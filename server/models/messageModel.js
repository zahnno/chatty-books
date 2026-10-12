const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  userMessage: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  modelResponse: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  suggestions: {
    type: [String],
    required: false,
    trim: true,
    unique: false
  },
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Characters',
    required: false
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Books',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  pageNumber: {
    type: Number,
    required: false,
    description: "The page number in the book where this chat message occurred"
  }
}, { timestamps: true });

// Per-character conversation counts (/characters/top, /characters/by-book).
MessageSchema.index({ characterId: 1 });

module.exports = mongoose.model.Messages || mongoose.model('Messages', MessageSchema);