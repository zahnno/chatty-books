const express = require("express");
const multer = require("multer");
const voiceRoutes = express.Router();
const Character = require("../models/characterModel");
const privateer = require("../services/privateerClient");
const voiceChatService = require("../services/voiceChatService");
const { VoiceChatError } = require("../services/voiceChatService");
const { VOICES, getVoice, isValidVoice, assignVoice } = require("../services/characterVoices");
const { authenticateAdmin, checkBookAccess } = require('../controllers/auth');

// Recordings from the mobile app (m4a) and browsers (webm / mp4 / ogg).
const AUDIO_FORMATS = {
  'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav'
};

function audioFormat(file) {
  const ext = (file.originalname || '').split('.').pop().toLowerCase();
  if (Object.values(AUDIO_FORMATS).includes(ext)) return ext;
  return AUDIO_FORMATS[(file.mimetype || '').split(';')[0]] || null;
}

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 10 }, // 10MB, ~2 minutes of speech
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio' && audioFormat(file)) cb(null, true);
    else cb(new VoiceChatError('Unsupported audio recording'), false);
  }
});

function sendError(res, err, fallback) {
  if (err instanceof VoiceChatError) return res.status(err.status).json({ message: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ message: err.message });
  // Token deduction failures from the chat step (see chatService).
  if (/tokens|upgrade your subscription/i.test(err.message)) return res.status(402).json({ message: err.message });
  if (/Prompt exceeds/.test(err.message)) return res.status(400).json({ message: 'That was a bit long. Please try saying it more briefly.' });
  console.error(fallback, err);
  res.status(500).json({ message: fallback });
}

// Server-side speech to text, for devices that can't recognise speech
// themselves: multipart `audio` recording plus `durationSeconds`.
voiceRoutes.route("/book/:bookId/character/:characterId/transcribe").post(
  checkBookAccess,
  (req, res, next) => audioUpload.single('audio')(req, res, (err) => err ? sendError(res, err) : next()),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No audio recording provided' });
      const transcript = await voiceChatService.transcribe({
        user: req.user,
        bookId: req.params.bookId,
        characterId: req.params.characterId,
        audio: req.file.buffer,
        format: audioFormat(req.file),
        durationSeconds: req.body.durationSeconds
      });
      res.json({ transcript });
    } catch (err) {
      sendError(res, err, 'Could not transcribe your message');
    }
  }
);

// One spoken turn: `{ transcript, pageNumber }` in, a stream of
// newline-delimited JSON events out (see voiceChatService.streamReply) so the
// app can show the reply and start playing its first sentence while the rest
// is still being generated.
voiceRoutes.route("/book/:bookId/character/:characterId/voice-reply").post(checkBookAccess, async (req, res) => {
  const transcript = (req.body.transcript || '').trim();
  if (!transcript) return res.status(400).json({ message: "We couldn't hear anything. Please try again." });

  let character;
  try {
    character = await voiceChatService.prepare(req.user._id, req.params.bookId, req.params.characterId);
  } catch (err) {
    return sendError(res, err, 'Voice chat failed');
  }

  res.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no' // don't let proxies buffer the stream
  });
  res.flushHeaders();
  const send = (event) => {
    if (!res.writableEnded) res.write(JSON.stringify(event) + '\n');
  };

  try {
    await voiceChatService.streamReply({
      user: req.user,
      bookId: req.params.bookId,
      character,
      transcript,
      pageNumber: req.body.pageNumber ? Number(req.body.pageNumber) : undefined,
      send
    });
  } catch (err) {
    const status = err instanceof VoiceChatError ? err.status
      : /tokens|upgrade your subscription/i.test(err.message) ? 402
      : /Prompt exceeds/.test(err.message) ? 400
      : 500;
    if (status === 500) console.error('Voice chat failed', err);
    send({
      type: 'error',
      status,
      message: status === 500 ? 'Voice chat failed'
        : /Prompt exceeds/.test(err.message) ? 'That was a bit long. Please try saying it more briefly.'
        : err.message
    });
  }
  res.end();
});

// Speak existing text (e.g. an earlier reply) in the character's voice.
voiceRoutes.route("/book/:bookId/character/:characterId/speak").post(checkBookAccess, async (req, res) => {
  try {
    const result = await voiceChatService.speak({
      user: req.user,
      bookId: req.params.bookId,
      characterId: req.params.characterId,
      text: req.body.text
    });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err, 'Could not speak this message');
  }
});

// --- Admin: character voice management ---

voiceRoutes.route("/character-voices").get(authenticateAdmin, (req, res) => {
  res.json(VOICES);
});

// Sample clips are cached per voice so browsing the catalogue costs one call each.
const previewCache = new Map();

voiceRoutes.route("/character-voices/:voiceId/preview").post(authenticateAdmin, async (req, res) => {
  try {
    const voice = getVoice(req.params.voiceId);
    if (!voice) return res.status(404).json({ message: 'Unknown voice' });
    const text = (req.body.text || '').trim().slice(0, 300);
    const cacheKey = text ? null : voice.id;

    let audio = cacheKey && previewCache.get(cacheKey);
    if (!audio) {
      audio = (await privateer.synthesizeSpeech(
        text || `Hello there. I'm ${voice.name}, and this is how I sound when I tell a story.`,
        { model: voice.model, voice: voice.id }
      )).audio.toString('base64');
      if (cacheKey) previewCache.set(cacheKey, audio);
    }
    res.json({ voice: voice.id, audio: { mimeType: 'audio/mpeg', base64: audio } });
  } catch (err) {
    sendError(res, err, 'Could not generate a voice preview');
  }
});

// Set a character's voice. `voice: null` hands it back to automatic matching.
voiceRoutes.route("/book/:bookId/character/:characterId/voice").put(authenticateAdmin, async (req, res) => {
  try {
    const character = await Character.findOne({ _id: req.params.characterId, bookId: req.params.bookId });
    if (!character) return res.status(404).json({ message: 'Character not found' });

    const { voice } = req.body;
    if (voice) {
      if (!isValidVoice(voice)) return res.status(400).json({ message: 'Unknown voice' });
      character.voice = voice;
      character.voiceSource = 'admin';
      character.voiceReason = null;
      await character.save();
    } else {
      await assignVoice(character, { force: true });
    }
    res.json({ voice: character.voice, voiceSource: character.voiceSource, voiceReason: character.voiceReason });
  } catch (err) {
    sendError(res, err, 'Could not update the character voice');
  }
});

// Match voices for every character in a book without a usable one.
voiceRoutes.route("/book/:bookId/characters/assign-voices").post(authenticateAdmin, async (req, res) => {
  try {
    const characters = await Character.find({ bookId: req.params.bookId, voice: { $nin: VOICES.map(v => v.id) } });
    // One at a time so each match can avoid the voices picked before it.
    for (const character of characters) await assignVoice(character);
    const all = await Character.find({ bookId: req.params.bookId }, 'voice voiceSource voiceReason').lean();
    res.json({ assigned: characters.length, characters: all });
  } catch (err) {
    sendError(res, err, 'Could not assign character voices');
  }
});

module.exports = voiceRoutes;
