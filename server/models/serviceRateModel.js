const mongoose = require('mongoose');

const serviceRateSchema = new mongoose.Schema({
  service: { type: String, required: true },
  key: { type: String, required: true },
  rate: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String }
}, { timestamps: true });

serviceRateSchema.index({ service: 1, key: 1 }, { unique: true });

const DEFAULTS = [
  { service: 'text',         key: 'input',   rate: 0.00025,   unit: 'per 1K tokens', name: 'Input Tokens',    description: 'Text generation input cost' },
  { service: 'text',         key: 'output',  rate: 0.0005,    unit: 'per 1K tokens', name: 'Output Tokens',   description: 'Text generation output cost' },
  { service: 'image',        key: 'standard',rate: 0.040,     unit: 'per image',     name: 'Standard Image',  description: 'Image generation' },
  { service: 'tts',          key: 'standard',rate: 0.000004,  unit: 'per character', name: 'Standard Voice',  description: 'TTS standard voice ($4/1M chars)' },
  { service: 'tts',          key: 'hd',      rate: 0.000016,  unit: 'per character', name: 'HD Voice',        description: 'TTS HD voice ($16/1M chars)' },
  { service: 'video',        key: '720p',    rate: 0.50,      unit: 'per second',    name: '720p Video',      description: '720p video generation' },
  { service: 'video',        key: '1080p',   rate: 0.75,      unit: 'per second',    name: '1080p Video',     description: '1080p video generation' },
  { service: 'video',        key: '4k',      rate: 1.25,      unit: 'per second',    name: '4K Video',        description: '4K video generation' },
  // Voice chat: replies come from VOICE_CHAT_MODEL (Claude Opus 4.8 by default), so it has its own token rates.
  { service: 'voice',        key: 'input',   rate: 0.007,     unit: 'per 1K tokens', name: 'Voice Chat Input Tokens',  description: 'Voice chat model input cost (Claude Opus 4.8: $7/1M)' },
  { service: 'voice',        key: 'output',  rate: 0.035,     unit: 'per 1K tokens', name: 'Voice Chat Output Tokens', description: 'Voice chat model output cost (Claude Opus 4.8: $35/1M)' },
  { service: 'tts',          key: 'elevenlabs_turbo', rate: 0.00007, unit: 'per character', name: 'ElevenLabs Turbo Voice', description: 'Character voices, ElevenLabs Turbo v2.5 ($0.07/1K chars)' },
  { service: 'tts',          key: 'deepgram_aura2', rate: 0.00004, unit: 'per character', name: 'Deepgram Aura-2 Voice', description: 'Character voices, Deepgram Aura-2 (estimated; Privateer publishes no rate)' },
  { service: 'tts',          key: 'qwen3',   rate: 0.00007,   unit: 'per character', name: 'Qwen3 Voice',     description: 'Character voices, Qwen3-TTS (estimated; Privateer publishes no rate)' },
  { service: 'stt',          key: 'standard',rate: 0.0084,    unit: 'per minute',    name: 'Speech Transcription', description: 'Server speech-to-text (gpt-4o-transcribe), used when the device cannot transcribe' },
];

// Inserts any default rate that doesn't exist yet; rates edited by admins are left alone.
serviceRateSchema.statics.seedDefaults = async function () {
  const result = await this.bulkWrite(DEFAULTS.map(rate => ({
    updateOne: {
      filter: { service: rate.service, key: rate.key },
      update: { $setOnInsert: rate },
      upsert: true
    }
  })));
  if (result.upsertedCount) console.log(`ServiceRate: seeded ${result.upsertedCount} default rate(s)`);
};

serviceRateSchema.statics.getAllGrouped = async function () {
  const rates = await this.find({}).lean();
  const grouped = {};
  for (const r of rates) {
    if (!grouped[r.service]) grouped[r.service] = { name: serviceDisplayName(r.service), rates: [] };
    grouped[r.service].rates.push({ key: r.key, name: r.name, rate: r.rate, unit: r.unit });
  }
  return grouped;
};

function serviceDisplayName(service) {
  const names = { text: 'Text Generation', image: 'Image Generation', tts: 'Text-to-Speech', stt: 'Speech-to-Text', voice: 'Voice Chat', video: 'Video Generation' };
  return names[service] || service;
}

module.exports = mongoose.model('ServiceRate', serviceRateSchema);
