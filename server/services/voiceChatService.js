const privateer = require('./privateerClient');
const chatService = require('./chatService');
const CostEstimateService = require('./costEstimateService');
const Publishing = require('./solana/publishing');
const { assignVoice, getVoice } = require('./characterVoices');
const { VOICE_CHAT_MODEL, VOICE_CHAT_REASONING } = require('../constants');
const Character = require('../models/characterModel');
const Feature = require('../models/featureModel');
const User = require('../models/userModel');

const ACTION = 'VOICE_CHAT_WITH_CHARACTER';
const MAX_RECORDING_SECONDS = 120;
const MAX_SPEAK_CHARS = 1500;

// ServiceRate `tts` key for each voice engine (priced per character).
const TTS_RATE_KEYS = {
  elevenlabs: 'elevenlabs_turbo',
  deepgram: 'deepgram_aura2',
  qwen: 'qwen3'
};
const ttsRateKey = (voice) => TTS_RATE_KEYS[voice.engine] || 'elevenlabs_turbo';

// Replies are voiced sentence by sentence, each as soon as it's written, so
// the voice starts while the rest is still being generated and no clip is long
// (some engines, e.g. Deepgram, take ~30ms per character). Short sentences are
// merged into the next to keep requests per turn down (the Privateer account
// allows 8 generations at once).
const FIRST_CHUNK_MIN_CHARS = 12;
const NEXT_CHUNK_MIN_CHARS = 40;
const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s)/g;

const AUDIO_TAGS = /\s*\[[^\]\n]{1,40}\]\s*/g;
const stripAudioTags = (text) => text.replace(AUDIO_TAGS, ' ').replace(/\s{2,}/g, ' ').trim();

// A request-level error with an HTTP status for the route to send.
class VoiceChatError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function ensureAvailable(userId) {
  const [enabled, user] = await Promise.all([
    Feature.isEnabled(ACTION),
    User.findById(userId, 'tokenBalance').lean()
  ]);
  if (!enabled) throw new VoiceChatError('Voice chat is not available at this time', 503);
  if (!user || user.tokenBalance <= 0) {
    throw new VoiceChatError('You are out of tokens. Please upgrade your subscription to continue', 402);
  }
}

async function loadCharacter(bookId, characterId) {
  const character = await Character.findById(characterId);
  if (!character || String(character.bookId) !== String(bookId)) {
    throw new VoiceChatError('Character not found', 404);
  }
  return character;
}

// Checks the request can go ahead; call before starting a response stream so
// failures still get a proper HTTP status.
async function prepare(userId, bookId, characterId) {
  const [, character] = await Promise.all([ensureAvailable(userId), loadCharacter(bookId, characterId)]);
  return character;
}

// The character's catalogue voice, matching one first if they have none.
async function voiceFor(character) {
  return getVoice(await assignVoice(character));
}

const speakIn = async (voice, text) =>
  (await privateer.synthesizeSpeech(text, { model: voice.model, voice: voice.id })).audio;

// Charges for a finished provider call. Mirrors text chat: generate, then
// deduct, then credit the book's publisher.
async function charge(costEstimate, { bookId, characterId }) {
  const result = await costEstimate.checkAndDeductTokens();
  if (!result.success) throw new VoiceChatError(result.message, 402);
  Publishing.recordInteraction({ bookId, characterId, tokens: result.transaction?.amount });
}

const toAudioPayload = (buffer) => ({ mimeType: 'audio/mpeg', base64: buffer.toString('base64') });

// End index of the first run of whole sentences after `from` that is at least
// `minChars` long, or -1 if there isn't one yet.
function sentencesEnd(text, from, minChars) {
  const pattern = new RegExp(SENTENCE_END.source, 'g');
  pattern.lastIndex = from;
  for (const match of text.matchAll(pattern)) {
    const end = match.index + match[0].length;
    if (stripAudioTags(text.slice(from, end)).length >= minChars) return end;
  }
  return -1;
}

class VoiceChatService {
  prepare(userId, bookId, characterId) {
    return prepare(userId, bookId, characterId);
  }

  // Server-side speech to text, for devices that can't recognise speech themselves.
  async transcribe({ user, bookId, characterId, audio, format, durationSeconds }) {
    await prepare(user._id, bookId, characterId);
    const seconds = Math.min(Math.max(Number(durationSeconds) || 0, 1), MAX_RECORDING_SECONDS);
    const costEstimate = await CostEstimateService.estimateTranscriptionCost(user._id, seconds, ACTION);
    let transcript;
    try {
      transcript = await privateer.transcribe(audio, { format });
    } catch (err) {
      await CostEstimateService.updateActualCost(costEstimate._id, null, 'failed');
      throw err;
    }
    await charge(costEstimate, { bookId, characterId });
    if (!transcript) throw new VoiceChatError("We couldn't hear anything. Please try again.");
    return transcript;
  }

  // One spoken turn, streamed through `send(event)`:
  //   { type: 'text', text }                          the reply so far, for display
  //   { type: 'audio', index, text, mimeType, base64 } spoken chunks, in order
  //   { type: 'audio_error', index, message }          a chunk that couldn't be voiced
  //   { type: 'done', message, suggestions, voice }
  // Each sentence is sent to TTS as soon as it's written, so playback starts
  // long before the model has finished. `character` comes from prepare().
  async streamReply({ user, bookId, character, transcript, pageNumber, send }) {
    const startedAt = Date.now();
    const timings = {};
    const mark = (name) => { if (!(name in timings)) timings[name] = Date.now() - startedAt; };

    // Matches a voice in parallel with the reply if the character has none yet.
    const voicePromise = voiceFor(character);

    let spoken = '';
    let queuedUpTo = 0;
    let spokenChars = 0;
    let sendChain = Promise.resolve();
    let chunkCount = 0;

    const queueSpeech = (rawText) => {
      const text = stripAudioTags(rawText);
      if (!text) return;
      const index = chunkCount++;
      spokenChars += text.length;
      const audio = voicePromise.then(voice => speakIn(voice, text));
      audio.catch(() => {}); // handled in order below
      // Chunks are voiced in parallel but always delivered in order.
      sendChain = sendChain.then(async () => {
        try {
          send({ type: 'audio', index, text, ...toAudioPayload(await audio) });
          mark(`audio${index}`);
        } catch (err) {
          console.error('Voice chat speech failed:', err.message);
          send({ type: 'audio_error', index, message: 'Could not generate the voice for this reply' });
        }
      });
    };

    const onText = (delta) => {
      mark('firstText');
      spoken += delta;
      send({ type: 'text', text: stripAudioTags(spoken) });
      for (;;) {
        const end = sentencesEnd(spoken, queuedUpTo, chunkCount === 0 ? FIRST_CHUNK_MIN_CHARS : NEXT_CHUNK_MIN_CHARS);
        if (end < 0) break;
        mark('firstSentence');
        queueSpeech(spoken.slice(queuedUpTo, end));
        queuedUpTo = end;
      }
    };

    const onSpokenEnd = () => {
      mark('spokenEnd');
      queueSpeech(spoken.slice(queuedUpTo));
      queuedUpTo = spoken.length;
    };

    const reply = await chatService.streamSpokenReply(
      user._id, bookId, character._id, transcript, pageNumber, user,
      {
        model: VOICE_CHAT_MODEL,
        reasoning: VOICE_CHAT_REASONING,
        rateService: 'voice',
        action: ACTION,
        speechTags: false,
        onText,
        onSpokenEnd
      }
    );
    await sendChain;
    mark('done');

    // Charge for the speech once it's all been generated.
    if (spokenChars > 0) {
      try {
        const voice = await voicePromise;
        const costEstimate = await CostEstimateService.estimateTTSCost(user._id, stripAudioTags(spoken), ttsRateKey(voice), ACTION);
        await charge(costEstimate, { bookId, characterId: character._id });
      } catch (err) {
        console.error('Voice chat speech charge failed:', err.message);
      }
    }

    console.log(`Voice chat turn (${VOICE_CHAT_MODEL}, voice ${character.voice}): ${JSON.stringify(timings)}ms`);
    send({ type: 'done', message: reply.message, suggestions: reply.suggestions, voice: character.voice });
  }

  // Speaks existing text (an earlier reply, the character's intro) in the
  // character's voice.
  async speak({ user, bookId, characterId, text }) {
    const input = stripAudioTags(text || '');
    if (!input) throw new VoiceChatError('No text provided');
    if (input.length > MAX_SPEAK_CHARS) throw new VoiceChatError(`Text exceeds ${MAX_SPEAK_CHARS} character limit`);

    const character = await prepare(user._id, bookId, characterId);
    const voice = await voiceFor(character);
    const costEstimate = await CostEstimateService.estimateTTSCost(user._id, input, ttsRateKey(voice), ACTION);
    let audio;
    try {
      audio = await speakIn(voice, input);
    } catch (err) {
      await CostEstimateService.updateActualCost(costEstimate._id, null, 'failed');
      throw err;
    }
    await charge(costEstimate, { bookId, characterId });
    return { voice: voice.id, audio: toAudioPayload(audio) };
  }
}

module.exports = new VoiceChatService();
module.exports.VoiceChatError = VoiceChatError;
