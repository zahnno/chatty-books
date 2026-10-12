const mongoose = require('mongoose');

// A reader's report of objectionable content: a community gallery scene, a
// comment, or an AI character reply. Required by the App Store (1.2, UGC) and
// Google Play (UGC + AI-generated content) policies.
const ContentReportSchema = new mongoose.Schema({
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetType: {
    type: String,
    enum: ['image', 'comment', 'message'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // Author of the reported content (null for AI replies).
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reason: {
    type: String,
    enum: ['sexual', 'hate', 'harassment', 'violence', 'self_harm', 'spam', 'other'],
    required: true
  },
  details: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  // What the content said when reported, so moderators see it even if it changes.
  snapshot: {
    type: String,
    maxlength: 4000
  },
  status: {
    type: String,
    enum: ['open', 'removed', 'dismissed'],
    default: 'open'
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// One report per reader per item.
ContentReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
ContentReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ContentReport', ContentReportSchema);
