const mongoose = require('mongoose');

const CharacterSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  lastName: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  image_url: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  intro: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  description: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  events: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  appearance: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  personalityTraits: {
    type: [String],
    required: false,
    default: []
  },
  strengths: {
    type: [String],
    required: false,
    default: []
  },
  weaknesses: {
    type: [String],
    required: false,
    default: []
  },
  goals: {
    type: [String],
    required: false,
    default: []
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Books',
    required: true
  },
  gender: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  race: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  // TTS voice name used for voice chat (see services/characterVoices.js).
  voice: {
    type: String,
    default: null
  },
  // 'auto' when matched to the character automatically, 'admin' when chosen by hand.
  voiceSource: {
    type: String,
    enum: ['auto', 'admin', null],
    default: null
  },
  voiceReason: {
    type: String,
    default: null
  },
  // What readers' chats with this character have earned its book's publisher
  // (published books only; see services/solana/publishing.js).
  earnings: {
    interactions: { type: Number, default: 0 },
    microUsd: { type: Number, default: 0 }
  },
});

module.exports = mongoose.model.Characters || mongoose.model('Characters', CharacterSchema);