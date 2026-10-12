const mongoose = require('mongoose');

const AuthorInquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  bookTitle: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'in-progress', 'completed', 'declined'],
    default: 'new'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

AuthorInquirySchema.index({ createdAt: -1 });
AuthorInquirySchema.index({ status: 1 });
AuthorInquirySchema.index({ email: 1 });

module.exports = mongoose.model('AuthorInquiry', AuthorInquirySchema);
