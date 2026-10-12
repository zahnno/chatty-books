const mongoose = require('mongoose');

const ImageCommentSchema = new mongoose.Schema({
  imageGenerationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImageGeneration',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImageComment',
    default: null
  },
  // Taken down by a moderator after a report.
  hidden: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
ImageCommentSchema.index({ imageGenerationId: 1, createdAt: -1 });
ImageCommentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ImageComment', ImageCommentSchema);
