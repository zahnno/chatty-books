const mongoose = require('mongoose');

const ImageLikeSchema = new mongoose.Schema({
  imageGenerationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImageGeneration',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Ensure a user can only like an image once
ImageLikeSchema.index({ imageGenerationId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ImageLike', ImageLikeSchema);
