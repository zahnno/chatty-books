const mongoose = require('mongoose');

const AudioProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true,
    index: true
  },
  voiceId: {
    type: String,
    required: true
  },
  voiceName: {
    type: String,
    required: true
  },
  audioUrl: {
    type: String,
    default: null
  },
  s3Key: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  error: {
    type: String,
    default: null
  },
  duration: {
    type: Number,
    default: 0
  },
  pageTimestamps: [{ pageNumber: Number, startTime: Number }]
}, { timestamps: true });

// Compound indexes for efficient lookups
AudioProfileSchema.index({ bookId: 1, voiceId: 1 }, { unique: true });
AudioProfileSchema.index({ userId: 1, bookId: 1 });

const AudioProfile = mongoose.model('AudioProfile', AudioProfileSchema);

module.exports = AudioProfile;
