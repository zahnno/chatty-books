const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Subscription = require('./subscriptionModel');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      trim: true
    },
    // Required except on wallet-only accounts (Sign In With Solana on Seeker).
    // Unique among accounts that have one — see the partial index below and
    // scripts/migrateEmailIndexForWallets.js.
    email: {
      type: String,
      required: function() {
        return !this.walletAddress;
      },
      trim: true
    },
    profileImage: {
      type: String,
      default: null
    },
    password: {
      type: String,
      required: function() {
        return !this.googleId && !this.auth0Id && !this.walletAddress; // Only required if not using OAuth / a wallet
      }
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true
    },
    auth0Id: {
      type: String,
      sparse: true,
      unique: true
    },
    // Solana wallet (base58) proven with Sign In With Solana. Signs in to this
    // account on the Seeker build; one account per wallet.
    walletAddress: {
      type: String,
      sparse: true,
      unique: true
    },
    // Seeker Genesis Token bonus: the SGT mint it was claimed with (each SGT
    // can be claimed once, ever — see ProcessedBillingEvent sgt:<mint>).
    seekerBonus: {
      sgtMint: String,
      claimedAt: Date,
      tokens: Number
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer not to say'],
      default: 'prefer not to say'
    },
    dateOfBirth: {
      type: Date
    },
    characteristics: [{
      type: String,
      enum: [
        'friendly', 'creative', 'analytical', 'adventurous', 'organized',
        'empathetic', 'introverted', 'extroverted', 'curious', 'determined',
        'patient', 'ambitious', 'reliable', 'adaptable', 'thoughtful',
        'energetic', 'calm', 'focused', 'innovative', 'practical'
      ]
    }],
    description: {
      type: String
    },
    moods: [{
      type: String,
      enum: [
        'happy', 'excited', 'peaceful', 'focused', 'inspired',
        'relaxed', 'energetic', 'curious', 'reflective', 'playful',
        'determined', 'calm', 'enthusiastic', 'content', 'motivated'
      ]
    }],
    role: {
      type: String,
      enum: ['user', 'reader', 'admin'],
      default: 'reader',
      required: true
    },
    purchasedBooks: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Books'
    }],
    readingProgress: [{
      book: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Books',
        required: true
      },
      currentPage: {
        type: Number,
        default: 1
      },
      lastReadAt: {
        type: Date,
        default: Date.now
      }
    }],
    subscription: {
      plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription'
      },
      startDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['active', 'cancelled', 'expired', 'pending', 'past_due', 'none'],
        default: 'pending'
      },
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      autoRenew: { type: Boolean, default: true },
      // Which billing provider owns a paid subscription: 'stripe' (web),
      // 'apple' (App Store), 'play' (Google Play) or 'solana' (prepaid crypto
      // pass on the Seeker build). Unset for the free plan.
      // Keeps each provider's webhook from mutating another's subscription and
      // tells clients where cancellation has to happen.
      provider: {
        type: String,
        enum: ['stripe', 'apple', 'play', 'solana', null]
      },
      // App Store state — only when provider === 'apple'. originalTransactionId
      // is the stable id Apple keys renewals/notifications on.
      apple: {
        originalTransactionId: String,
        transactionId: String,
        productId: String,
        environment: String
      },
      // Google Play state — only when provider === 'play'. A plan change issues
      // a new purchaseToken; linkedToken keeps the previous one so late
      // notifications for it still resolve to this user.
      play: {
        purchaseToken: String,
        linkedToken: String,
        productId: String,
        basePlanId: String,
        orderId: String,
        // License-tester purchase: no money changed hands.
        testPurchase: Boolean
      },
      // Solana pass state — only when provider === 'solana'. Passes don't
      // auto-renew: each payment buys one period. endDate is the end of the
      // current period; paidUntil is how far prepaid periods reach (> endDate
      // when the reader bought the next month early). services/solana/pass.js
      // rolls periods over and drops lapsed passes to the free plan.
      solana: {
        paidUntil: Date,
        lastPaymentId: mongoose.Schema.Types.ObjectId,
        lastSignature: String
      }
    },
    tokenBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    lastTokenRefresh: {
      type: Date
    },
    // Readers this user has blocked: their gallery scenes and comments are hidden.
    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    // When the user agreed to their chats being processed by our AI providers
    // (App Store 5.1.2(i)). Asked once per account, before the first chat.
    aiConsentAt: { type: Date, default: null },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date
  },
  { timestamps: true }
);

// Only hash password if it's being modified and exists
userSchema.pre('save', async function(next) {
  if (this.password && (this.isModified('password') || this.isNew)) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Assign free tier subscription to new users
userSchema.pre('save', async function(next) {
  try {
    // Only proceed if this is a new user or subscription is not set
    if (this.isNew || !this.subscription.plan) {
      // Find the free tier subscription plan
      const freePlan = await Subscription.findOne({ tier: 'free', isActive: true });
      
      if (freePlan) {
        // Set up the free subscription
        this.subscription = {
          plan: freePlan._id,
          startDate: new Date(),
          endDate: new Date(Date.now() + freePlan.duration * 24 * 60 * 60 * 1000),
          status: 'active',
          autoRenew: true
        };
        
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Compare the given password with the hashed password in the database
userSchema.methods.comparePassword = async function (password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    throw error;
  }
};

// Method to check if user has enough tokens
userSchema.methods.hasEnoughTokens = function(amount) {
  return this.tokenBalance >= amount;
};

// Method to check if subscription is active
userSchema.methods.hasActiveSubscription = function() {
  if (!this.subscription.plan) return false;
  const now = new Date();
  return (
    this.subscription.status === 'active' &&
    this.subscription.endDate > now
  );
};

// Add virtual getter for age before the module.exports line
userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Enable virtuals when converting to JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);

// A store subscription binds to exactly one account (anti-replay).
userSchema.index({ 'subscription.apple.originalTransactionId': 1 }, { unique: true, sparse: true });
userSchema.index({ 'subscription.play.purchaseToken': 1 }, { unique: true, sparse: true });
userSchema.index({ 'subscription.play.linkedToken': 1 }, { sparse: true });

const User = mongoose.model('User', userSchema);

module.exports = User;