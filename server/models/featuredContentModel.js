const mongoose = require('mongoose');

const FeaturedContentSchema = new mongoose.Schema({
  contentType: {
    type: String,
    enum: ['book', 'character'],
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'contentTypeModel'
  },
  contentTypeModel: {
    type: String,
    enum: ['Books', 'Characters', null],
  },
  type: {
    type: String,
    enum: ['featured', 'popular'],
    required: true
  },
  order: {
    type: Number,
    required: true,
    default: 0
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: false
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
FeaturedContentSchema.index({ contentType: 1, type: 1, isActive: 1 });
FeaturedContentSchema.index({ contentId: 1, type: 1 });
FeaturedContentSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('FeaturedContent', FeaturedContentSchema); 