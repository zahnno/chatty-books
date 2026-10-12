const Feature = require('../models/featureModel');

// The features admins can switch on and off (admin → Features). Keys are the
// Feature.action values the code checks.
const FEATURES = [
  { key: 'CHAT_WITH_CHARACTER', label: 'Character chat', description: 'Typed conversations with book characters.' },
  { key: 'VOICE_CHAT_WITH_CHARACTER', label: 'Voice chat', description: 'Talking to characters out loud, with spoken replies.' },
  { key: 'TEXT_GENERATION', label: 'Scene images', description: 'Illustrating a paragraph from the book.' },
  { key: 'VIDEO_GENERATION', label: 'Scene videos', description: 'Short video clips of a scene.' },
  { key: 'TEXT_TO_SPEECH', label: 'Page narration', description: 'Reading a page aloud.' }
];

/**
 * Throw `message` unless feature `key` is switched on. Call it before any
 * paid provider work so a switched-off feature costs nothing.
 */
async function requireFeature(key, message) {
  if (!(await Feature.isEnabled(key))) throw new Error(message);
}

module.exports = { FEATURES, requireFeature };
