const mongoose = require('mongoose');

const BookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    unique: false
  },
  author: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  categories: {
    type: [String],
    required: false,
    default: []
  },
  description: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  tagline: {
    type: String,
    required: false,
    trim: true
  },
  ageGroup: {
    type: String,
    required: false,
    trim: true
  },
  readingTime: {
    type: Number,
    required: false,
    min: 1
  },
  style: {
    type: String,
    required: false,
    trim: true,
    default: "realistic digital art, professional portrait photography, soft lighting, warm tones, detailed facial features, high resolution, professional headshot style"
  },
  image_url: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  file_url: {
    type: String,
    required: false,
    trim: true
  },
  is_public: {
    type: Boolean,
    required: true,
    default: true
  },
  is_featured: {
    type: Boolean,
    required: true,
    default: false
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Community publishing (Seeker): a publisher submits the book, an admin
  // reviews it, the publisher mints it as a Metaplex Core asset, and from then
  // on whoever holds that asset earns a share of what readers spend talking to
  // its characters. See services/solana/publishing.js.
  publishing: {
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected', 'minted']
    },
    publisher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: String,
    reviewedAt: Date,
    // The automated pre-review (services/publishingReview.js): an AI read of
    // the title, author and first pages for rights and content problems. It
    // flags; an admin decides.
    screening: {
      verdict: { type: String, enum: ['clear', 'suspect', 'error'] },
      copyrightRisk: { type: String, enum: ['low', 'medium', 'high'] },
      contentRisk: { type: String, enum: ['low', 'medium', 'high'] },
      knownWork: String,      // the published work it appears to be, if any
      reasons: [String],
      summary: String,
      checkedAt: Date,
      error: String
    },
    supportNotifiedAt: Date,
    asset: String,              // Core asset address once minted
    mintSignature: String,
    mintedAt: Date,
    holder: String,             // asset owner, as last read from chain
    revenueShareBps: Number,
    pendingAsset: String,       // asset keypair for an unsent mint transaction
    pendingAssetSecret: { type: String, select: false },
    interactions: { type: Number, default: 0 },
    earnedMicroUsd: { type: Number, default: 0 },
    claimedMicroUsd: { type: Number, default: 0 }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

BookSchema.index({ 'publishing.status': 1 });
BookSchema.index({ 'publishing.publisher': 1 });
BookSchema.index({ 'publishing.holder': 1 });

BookSchema.virtual('isOwned').get(function () {
  return this._isOwned;
});

// Add indexes for optimized querying
BookSchema.index({ createdAt: -1 }); // For sorting
BookSchema.index({ is_public: 1, is_featured: 1 }); // For filtering

module.exports = mongoose.model.Books || mongoose.model('Books', BookSchema);