const mongoose = require('mongoose');

const tokenTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true
    },
    action: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    balance: {
      type: Number,
      required: true
    },
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedEntityModel'
    },
    relatedEntityModel: {
      type: String,
      enum: ['Books', 'Characters', 'Subscription', 'Messages', 'ImageGeneration', 'AudioGeneration']
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map()
    },
    tokenCostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Feature'
    }
  },
  { 
    timestamps: true 
  }
);

// Indexes for efficient querying
tokenTransactionSchema.index({ userId: 1, createdAt: -1 });
tokenTransactionSchema.index({ action: 1 });
tokenTransactionSchema.index({ type: 1 });

// Virtual for formatted amount with sign
tokenTransactionSchema.virtual('formattedAmount').get(function() {
  return `${this.type === 'credit' ? '+' : '-'}${Math.abs(this.amount)}`;
});

// Method to create a transaction and update user balance
tokenTransactionSchema.statics.createTransaction = async function(data) {
  const { userId, amount, type, action, description, relatedEntityId, relatedEntityModel, metadata } = data;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const user = await mongoose.model('User').findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate new balance
    const newBalance = type === 'credit' 
      ? user.tokenBalance + amount 
      : user.tokenBalance - amount;

    // Validate balance won't go negative
    if (newBalance < 0) {
      throw new Error('Insufficient tokens');
    }

    // Create transaction
    const transaction = await this.create([{
      userId,
      amount,
      type,
      action,
      description,
      balance: newBalance,
      relatedEntityId,
      relatedEntityModel,
      metadata
    }], { session });

    // Update user balance
    user.tokenBalance = newBalance;
    await user.save({ session });

    await session.commitTransaction();
    return transaction[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Method to get user's transaction history
tokenTransactionSchema.statics.getUserHistory = async function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate({
      path: 'relatedEntityId',
      refPath: 'relatedEntityModel'
    })
    .exec();
};

// Method to get transaction statistics
tokenTransactionSchema.statics.getStats = async function(userId, period = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    credits: stats.find(s => s._id === 'credit') || { total: 0, count: 0 },
    debits: stats.find(s => s._id === 'debit') || { total: 0, count: 0 },
    period
  };
};

const TokenTransaction = mongoose.model('TokenTransaction', tokenTransactionSchema);

module.exports = TokenTransaction; 