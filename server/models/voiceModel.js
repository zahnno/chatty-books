const mongoose = require('mongoose');

const VoiceSchema = new mongoose.Schema({
  voiceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'multi'],
    default: 'multi'
  },
  accent: {
    type: String,
    default: 'US'
  },
  model: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const Voice = mongoose.model('Voice', VoiceSchema);

module.exports = Voice;
