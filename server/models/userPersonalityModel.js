const mongoose = require('mongoose');

const dialoguePreferencesSchema = new mongoose.Schema({
  length: {
    type: String,
    enum: ['short', 'medium', 'long', 'varied'],
    default: 'medium'
  },
  tone: {
    type: String,
    enum: ['formal', 'informal', 'humorous', 'serious', 'mixed'],
    default: 'informal'
  },
  emojiUse: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const alignmentSchema = new mongoose.Schema({
  moral: {
    type: String,
    enum: ['Good', 'Neutral', 'Evil'],
    default: 'Neutral'
  },
  order: {
    type: String,
    enum: ['Lawful', 'Neutral', 'Chaotic'],
    default: 'Neutral'
  }
}, { _id: false });

const userPersonalitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  cognitiveStyle: {
    type: String,
    enum: ['logical', 'imaginative', 'analytical', 'intuitive', 'practical'],
    default: 'imaginative'
  },
  emotionalTendencies: [{
    type: String,
    enum: ['reflective', 'excitable', 'stoic', 'calm', 'passionate', 'reserved']
  }],
  interactionStyle: {
    type: String,
    enum: ['gives feedback', 'roleplays', 'observes', 'asks questions', 'direct'],
    default: 'asks questions'
  },
  motivations: [{
    type: String,
    enum: ['romance', 'solving mysteries', 'learning', 'adventure', 'friendship', 'power']
  }],
  dialoguePreferences: {
    type: dialoguePreferencesSchema,
    default: () => ({})
  },
  alignment: {
    type: alignmentSchema,
    default: () => ({})
  }
}, { timestamps: true });

const UserPersonality = mongoose.model('UserPersonality', userPersonalitySchema);

module.exports = UserPersonality; 