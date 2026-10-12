const mongoose = require('mongoose');

const ImageGenerationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Books',
    required: false
  },
  pageNumber: {
    type: Number,
    required: false
  },
  paragraphId: {
    type: String,
    required: false
  },
  paragraphText: {
    type: String,
    required: false
  },
  prompt: {
    type: String,
    required: true
  },
  negative_prompt: {
    type: String,
    required: false
  },
  width: {
    type: Number,
    default: 512
  },
  height: {
    type: Number,
    default: 512
  },
  steps: {
    type: Number,
    default: 30
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  imageUrl: {
    type: String,
    required: false
  },
  error: {
    type: String,
    required: false
  },
  hordeJobId: {
    type: String,
    required: false
  },
  estimatedTimeSeconds: {
    type: Number,
    required: false
  },
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Characters',
    required: false
  },
  hordeResponse: {
    type: Object,
    required: false
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    default: 'image'
  },
  videoUrl: {
    type: String,
    required: false
  },
  // Taken down by a moderator after a report; excluded from the gallery.
  hidden: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ImageGeneration', ImageGenerationSchema); 