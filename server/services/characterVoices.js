const privateer = require('./privateerClient');
const { VOICE_CHAT_MODEL, VOICE_CHAT_REASONING } = require("../constants");
const Character = require('../models/characterModel');

// Privateer's English TTS voices on engines fast enough for live chat, with
// Privateer's own profile of each (see data/characterVoices.json; re-check it
// with scripts/verifyCharacterVoices.js). A voice id is unique across engines
// and names both the engine (`model`) and the voice sent to it.
const { voices: VOICES } = require('../data/characterVoices.json');

const VOICES_BY_ID = new Map(VOICES.map(v => [v.id, v]));

const getVoice = (voiceId) => VOICES_BY_ID.get(voiceId) || null;
const isValidVoice = (voiceId) => VOICES_BY_ID.has(voiceId);

// One line per voice for the matcher, e.g.
// "George: male, adult, british accent; calm, resonant, warm; best for audiobook"
const describeVoice = (v) => [
  `${v.id}: ${[v.gender !== 'unknown' && v.gender, v.age, v.accent && `${v.accent} accent`].filter(Boolean).join(', ')}`,
  v.traits.length && v.traits.join(', '),
  v.bestFor.length && `best for ${v.bestFor.join(', ')}`
].filter(Boolean).join('; ');

// Deterministic fallback when the matcher is unavailable: a voice of the
// character's gender, spread across characters by id.
function fallbackVoice(character, avoid = []) {
  const g = (character.gender || '').toLowerCase();
  const gender = /\b(female|woman|girl|she|her)\b/.test(g) ? 'female'
    : /\b(male|man|boy|he|him)\b/.test(g) ? 'male'
    : null;
  let pool = VOICES.filter(v => !gender || v.gender === gender);
  const unused = pool.filter(v => !avoid.includes(v.id));
  if (unused.length) pool = unused;
  const hash = [...String(character._id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return pool[hash % pool.length].id;
}

// Asks the model to pick the best-fitting voice for the character, preferring
// voices not already used by other characters in the same book.
async function matchVoice(character, avoid = []) {
  const profile = [
    `Name: ${[character.firstName, character.lastName].filter(Boolean).join(' ')}`,
    character.gender && `Gender: ${character.gender}`,
    character.race && `Race: ${character.race}`,
    character.appearance && `Appearance: ${character.appearance}`,
    character.description && `Backstory: ${character.description}`,
    character.intro && `How they introduce themself: ${character.intro}`,
    character.personalityTraits?.length && `Personality: ${character.personalityTraits.join(', ')}`
  ].filter(Boolean).join('\n');

  const catalogue = VOICES.map(v => `- ${describeVoice(v)}`).join('\n');

  const prompt = `You are casting a voice actor for a character from a book. Choose the single voice that best fits the character's gender, age, origin and personality.

Character:
${profile}

Available voices:
${catalogue}
${avoid.length ? `\nThese voices are already used by other characters in the same book; avoid them unless one is clearly the best fit: ${avoid.join(', ')}\n` : ''}
Respond with only a JSON object, no markdown: {"voice": "<voice id from the list, exactly as written>", "reason": "<one short sentence>"}`;

  const { text } = await privateer.generateText(prompt, { model: VOICE_CHAT_MODEL, reasoning: VOICE_CHAT_REASONING, maxTokens: 1024 });
  const parsed = JSON.parse(privateer.cleanJson(text));
  if (!isValidVoice(parsed.voice)) throw new Error(`Model picked unknown voice "${parsed.voice}"`);
  return { voice: parsed.voice, reason: parsed.reason || '' };
}

// Picks and saves a voice for a character. Admin-chosen voices are kept unless
// `force` is set (used when an admin resets back to automatic).
async function assignVoice(character, { force = false } = {}) {
  if (!force && character.voice && isValidVoice(character.voice)) return character.voice;

  const siblings = await Character.find(
    { bookId: character.bookId, _id: { $ne: character._id }, voice: { $ne: null } },
    'voice'
  ).lean();
  const avoid = [...new Set(siblings.map(c => c.voice).filter(Boolean))];

  let voice, reason;
  try {
    ({ voice, reason } = await matchVoice(character, avoid));
  } catch (err) {
    console.error(`Voice matching failed for character ${character._id}:`, err.message);
    voice = fallbackVoice(character, avoid);
    reason = 'Picked by gender (automatic matching was unavailable).';
  }

  await Character.updateOne(
    { _id: character._id },
    { voice, voiceSource: 'auto', voiceReason: reason }
  );
  character.voice = voice;
  character.voiceSource = 'auto';
  character.voiceReason = reason;
  return voice;
}

module.exports = { VOICES, getVoice, isValidVoice, assignVoice, fallbackVoice };
