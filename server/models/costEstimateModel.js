const mongoose = require('mongoose');

const costEstimateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    service: {
      type: String,
      enum: ['text', 'image', 'video', 'getimg', 'tts', 'stt'],
      required: true
    },
    action: {
      type: String,
      required: true
    },
    prompt: {
      type: String,
      required: false
    },
    tokenQuote: {
      type: Object,
      required: true,
      default: () => ({
        baseTokens: 0,
        operatingCostTokens: 0,
        totalTokens: 0,
        baseUSD: 0,
        operatingCostUSD: 0,
        totalUSD: 0
      })
    },
    estimatedCost: {
      type: Number,
      required: true
    },
    parameters: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map()
    },
    imageGenerationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageGeneration'
    },
    actualCost: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      enum: ['estimated', 'completed', 'failed', 'partial'],
      default: 'estimated'
    },
    tokenTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TokenTransaction',
      default: null
    },
    tokenCostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Feature',
      default: null
    },
    partialTokensUsed: {
      type: Number,
      default: null
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
costEstimateSchema.index({ service: 1, createdAt: -1 });
costEstimateSchema.index({ userId: 1, service: 1 });
costEstimateSchema.index({ tokenTransactionId: 1 });
costEstimateSchema.index({ tokenCostId: 1 });

// Method to check user balance and handle partial token usage
costEstimateSchema.methods.checkAndDeductTokens = async function() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await mongoose.model('User').findById(this.userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    // If user has enough tokens, proceed with full transaction
    if (user.tokenBalance >= this.tokenQuote.totalTokens) {
      // Create a token transaction for the full amount
      const transaction = await mongoose.model('TokenTransaction').createTransaction({
        userId: this.userId,
        amount: this.tokenQuote.totalTokens,
        type: 'debit',
        action: this.action.toLowerCase(),
        description: `Tokens used for ${this.action.toLowerCase().replace('_', ' ')}`,
        metadata: {
          costEstimateId: this._id,
          isPartial: false,
          requestedTokens: this.tokenQuote.totalTokens,
          actualTokensUsed: this.tokenQuote.totalTokens
        }
      });

      // Update cost estimate with transaction details
      this.status = 'completed';
      this.actualCost = this.estimatedCost;
      this.tokenTransactionId = transaction._id;
      await this.save({ session });

      await session.commitTransaction();
      
      return {
        success: true,
        canProceed: true,
        remainingBalance: user.tokenBalance - this.tokenQuote.totalTokens,
        partialTokensUsed: null,
        transaction,
        message: 'Full token deduction successful'
      };
    }

    // If user has no tokens at all, reject immediately
    if (user.tokenBalance <= 0) {
      await session.commitTransaction();
      return {
        success: false,
        canProceed: false,
        remainingBalance: 0,
        partialTokensUsed: null,
        transaction: null,
        message: 'Please upgrade your subscription to continue'
      };
    }

    // Handle partial token usage
    const partialTokensUsed = user.tokenBalance;
    
    // Create a token transaction for the partial amount
    const transaction = await mongoose.model('TokenTransaction').createTransaction({
      userId: this.userId,
      amount: partialTokensUsed,
      type: 'debit',
      action: this.action.toLowerCase(),
      description: `Partial tokens used for ${this.action.toLowerCase().replace('_', ' ')}`,
      metadata: {
        costEstimateId: this._id,
        isPartial: true,
        requestedTokens: this.tokenQuote.totalTokens,
        actualTokensUsed: partialTokensUsed,
        percentageComplete: (partialTokensUsed / this.tokenQuote.totalTokens * 100).toFixed(2)
      }
    });

    // Update cost estimate with partial usage details
    this.status = 'partial';
    this.partialTokensUsed = partialTokensUsed;
    this.tokenTransactionId = transaction._id;
    this.actualCost = (this.estimatedCost * (partialTokensUsed / this.tokenQuote.totalTokens));
    await this.save({ session });

    await session.commitTransaction();
    
    return {
      success: true,
      canProceed: false,
      remainingBalance: 0,
      partialTokensUsed,
      transaction,
      message: `Partial token deduction completed. Used ${partialTokensUsed} of ${this.tokenQuote.totalTokens} requested tokens.`
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const CostEstimate = mongoose.model('CostEstimate', costEstimateSchema);

module.exports = CostEstimate; 