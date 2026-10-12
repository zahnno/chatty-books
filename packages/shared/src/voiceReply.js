// Streams a character's spoken reply to a voice chat message (server route
// POST /book/:bookId/character/:characterId/voice-reply). The server sends
// newline-delimited JSON events, each passed to `onEvent` as it arrives:
//   { type: 'text', text }                           the reply so far
//   { type: 'audio', index, text, mimeType, base64 }  spoken chunks, in order
//   { type: 'audio_error', index, message }
//   { type: 'done', message, suggestions, voice }
// Resolves once the reply is complete; rejects with the server's message on
// failure (err.status carries the HTTP-style status).
//
// `fetchImpl` must support streaming response bodies: the browser's fetch on
// web, `fetch` from 'expo/fetch' on React Native.
import { getServerUri, getToken } from './apiClient.js';

export async function streamVoiceReply({ bookId, characterId, transcript, pageNumber, onEvent, fetchImpl = fetch }) {
  const token = await getToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetchImpl(`${getServerUri()}/book/${bookId}/character/${characterId}/voice-reply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, pageNumber }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const error = new Error(data.message || 'Voice chat failed');
    error.status = res.status;
    throw error;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = null;
  const handleLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') {
      const error = new Error(event.message || 'Voice chat failed');
      error.status = event.status;
      throw error;
    }
    if (event.type === 'done') done = event;
    onEvent(event);
  };

  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  handleLine(buffer);
  if (!done) throw new Error('The reply was cut off. Please try again.');
  return done;
}
