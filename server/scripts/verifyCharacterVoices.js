// Checks every voice in data/characterVoices.json against Privateer: speaks a
// short line with each and confirms the engine used that voice (engines like
// ElevenLabs silently fall back to a default voice for names they don't know).
// Costs a fraction of a cent per voice.
// Usage: node scripts/verifyCharacterVoices.js
require('dotenv').config({ path: './config.env' });
const privateer = require('../services/privateerClient');
const { voices } = require('../data/characterVoices.json');

const CONCURRENCY = 3; // the account allows 8 generations at once

async function check(voice) {
  const started = Date.now();
  try {
    const { audio, voiceUsed } = await privateer.synthesizeSpeech('Hello there, it is good to meet you.', {
      model: voice.model,
      voice: voice.id
    });
    const ok = voiceUsed === voice.id;
    return { id: voice.id, ok, detail: `${ok ? 'ok' : `fell back to ${voiceUsed}`} (${Date.now() - started}ms, ${audio.length}B)` };
  } catch (err) {
    return { id: voice.id, ok: false, detail: err.message };
  }
}

async function run() {
  const queue = [...voices];
  const results = [];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const result = await check(queue.shift());
      console.log(`${result.ok ? '✓' : '✗'} ${result.id.padEnd(22)} ${result.detail}`);
      results.push(result);
    }
  }));
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} voices verified`);
  if (failed.length) process.exit(1);
}

run();
