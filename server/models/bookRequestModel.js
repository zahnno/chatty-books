const mongoose = require('mongoose');

const BookRequestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Add indexes for optimized querying
BookRequestSchema.index({ createdAt: -1 }); // For sorting
BookRequestSchema.index({ status: 1 }); // For filtering
BookRequestSchema.index({ userId: 1 }); // For user-specific queries

module.exports = mongoose.model('BookRequest', BookRequestSchema); 