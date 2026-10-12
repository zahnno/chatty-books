// Privateer model ids. An empty string uses the Privateer account default.
const reasoningFromEnv = (value) =>
  !value || value === 'off' ? { enabled: false } : value === 'default' ? undefined : { effort: value };

module.exports = {
  TEXT_MODEL: process.env.PRIVATEER_TEXT_MODEL || 'anthropic/claude-haiku-4.5',
  IMAGE_MODEL: process.env.PRIVATEER_IMAGE_MODEL || '',
  VIDEO_MODEL: process.env.PRIVATEER_VIDEO_MODEL || 'bytedance/seedance-2.0-mini',
  // Voice chat is latency-bound, so each model is the most capable one that
  // keeps a spoken turn fast (measured 2026-09-25 through Privateer):
  //  - Opus 4.8 with reasoning off: first sentence in ~2.5s. Opus 5.5 can't turn
  //    reasoning off and takes ~5s before its first word.
  //  - Voices: ElevenLabs Turbo v2.5 ~2.5s and Deepgram Aura-2 ~2s per clip;
  //    ElevenLabs v3 ~5.5s, Gemini TTS 5-7s and Kokoro 30s+ are too slow.
  //  - gpt-4o-transcribe: ~1.8s; whisper-1 took 4-10s. Only used when the
  //    device can't recognise speech itself.
  VOICE_CHAT_MODEL: process.env.PRIVATEER_VOICE_CHAT_MODEL || 'anthropic/claude-opus-4.8',
  // off (default) | minimal | low | medium | high | default (model's own setting)
  VOICE_CHAT_REASONING: reasoningFromEnv(process.env.PRIVATEER_VOICE_CHAT_REASONING),
  // Default TTS engine. Characters speak with the engine of their own voice
  // from data/characterVoices.json.
  TTS_MODEL: process.env.PRIVATEER_TTS_MODEL || 'fal-ai/elevenlabs/tts/turbo-v2.5',
  STT_MODEL: process.env.PRIVATEER_STT_MODEL || 'openai/gpt-4o-transcribe'
}
