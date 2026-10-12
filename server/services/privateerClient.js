const { TEXT_MODEL, IMAGE_MODEL, VIDEO_MODEL, TTS_MODEL, STT_MODEL } = require('../constants');

const BASE_URL = 'https://api.privateer.pro/v1';

const MAX_RETRIES = 3;

// Retries 429s (per-minute rate limit, or the account's cap on concurrent
// generations), honouring `retryAfter` when the gate provides one.
async function send(path, { method = 'GET', body } = {}, attempt = 0) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PRIVATEER_API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status !== 429 || attempt >= MAX_RETRIES) return res;

  const data = await res.clone().json().catch(() => ({}));
  const delayMs = Math.min(data.retryAfter ? data.retryAfter * 1000 : 1000 * 2 ** attempt, 8000);
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return send(path, { method, body }, attempt + 1);
}

// Errors come back either in OpenAI's envelope ({ error: { message, code } })
// or, from the rate/credit/concurrency gates, as a flat { message, code }.
function apiError(res, data) {
  const message = data.error?.message || data.message || `HTTP ${res.status}`;
  const err = new Error(`Privateer API error (${res.status}): ${message}`);
  err.status = res.status;
  err.code = data.error?.code || data.code;
  return err;
}

async function request(path, options) {
  const res = await send(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(res, data);
  return data;
}

function chatBody(messages, { model = TEXT_MODEL, maxTokens, reasoning } = {}) {
  return {
    model,
    messages,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(reasoning ? { reasoning } : {})
  };
}

// Chat completion. Returns { text, usage } where usage is the OpenAI-style
// { prompt_tokens, completion_tokens, total_tokens, cost } block.
// `reasoning` is passed through, e.g. { enabled: false } or { effort: 'low' }.
async function chat(messages, options) {
  const data = await request('/chat/completions', { method: 'POST', body: chatBody(messages, options) });
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage: data.usage || null
  };
}

// Streaming chat completion: calls onDelta(text) for each piece of the reply
// as it arrives, then resolves to { text, usage } like chat().
async function chatStream(messages, options, onDelta) {
  const res = await send('/chat/completions', {
    method: 'POST',
    body: { ...chatBody(messages, options), stream: true }
  });
  if (!res.ok) throw apiError(res, await res.json().catch(() => ({})));

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = null;
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.error) throw new Error(`Privateer API error: ${event.error.message || 'stream failed'}`);
      if (event.usage) usage = event.usage;
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        onDelta(delta);
      }
    }
  }
  return { text, usage };
}

// Single-prompt convenience wrapper around chat().
function generateText(prompt, options) {
  return chat([{ role: 'user', content: prompt }], options);
}

// Returns the generated image as a base64 string.
async function generateImage(prompt, { model = IMAGE_MODEL, aspectRatio } = {}) {
  const data = await request('/images/generations', {
    method: 'POST',
    body: {
      model,
      prompt,
      n: 1,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {})
    }
  });
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image generated');
  return b64;
}

const VIDEO_SIZES = {
  '720p': { '16:9': '1280x720', '9:16': '720x1280' },
  '1080p': { '16:9': '1920x1080', '9:16': '1080x1920' },
  '4k': { '16:9': '3840x2160', '9:16': '2160x3840' }
};

// Submits a video job, polls until it finishes and returns the video as a Buffer.
async function generateVideo(prompt, { model = VIDEO_MODEL, seconds, aspectRatio = '16:9', resolution = '720p', pollIntervalMs = 10000 } = {}) {
  const size = VIDEO_SIZES[resolution]?.[aspectRatio] || VIDEO_SIZES['720p']['16:9'];
  let job = await request('/videos', {
    method: 'POST',
    body: { model, prompt, seconds, size }
  });

  while (job.status !== 'completed') {
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(`Video generation ${job.status}: ${job.error?.message || job.error || 'unknown error'}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    job = await request(`/videos/${job.id}`);
  }

  if (!job.url) throw new Error('No video URL in Privateer response');
  const res = await fetch(job.url);
  if (!res.ok) throw new Error(`Video download failed with HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Text to speech. `model` + `voice` come from the character voice catalogue
// (data/characterVoices.json). Returns { audio: Buffer (MP3), voiceUsed }:
// some engines silently swap an unknown voice for their default, and
// `voiceUsed` (from the X-Privateer-Voice header) shows what actually spoke.
// Only characters' lines are spoken, so ZDR routing is waived: it measured
// ~0.5s slower per clip, which voice chat can't afford.
async function synthesizeSpeech(text, { model = TTS_MODEL, voice } = {}) {
  const res = await send('/audio/speech', {
    method: 'POST',
    body: { model, input: text, voice, response_format: 'mp3', requireZdr: false }
  });
  if (!res.ok) throw apiError(res, await res.json().catch(() => ({})));
  const voiceUsed = res.headers.get('x-privateer-voice');
  if (voice && voiceUsed && voiceUsed !== voice) {
    console.warn(`TTS voice "${voice}" is not available on ${model}; Privateer used "${voiceUsed}" instead`);
  }
  return { audio: Buffer.from(await res.arrayBuffer()), voiceUsed };
}

// Speech to text. `format` is the audio container, e.g. 'm4a', 'webm', 'mp3'.
// The default STT model has no zero-data-retention endpoint, so ZDR is waived.
async function transcribe(audio, { format, model = STT_MODEL } = {}) {
  const data = await request('/audio/transcriptions', {
    method: 'POST',
    body: { model, audioBase64: audio.toString('base64'), format, requireZdr: false }
  });
  return (data.text || '').trim();
}

// Strips markdown code fences so model output can be JSON.parse'd.
function cleanJson(text) {
  return text.trim()
    .replace(/```json\n?/g, '')
    .replace(/\n?```/g, '')
    .replace(/^`|`$/g, '')
    .trim();
}

module.exports = { chat, chatStream, generateText, generateImage, generateVideo, synthesizeSpeech, transcribe, cleanJson };
