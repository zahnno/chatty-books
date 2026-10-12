// Voice chat with characters in the browser: listen to the reader (with the
// browser's speech recognition where available, so there's no upload), stream
// the character's reply, and play it in the character's voice as each spoken
// chunk arrives.
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamVoiceReply } from '@talkingbook/shared';
import { authFetch } from '../utils';

export const MAX_RECORDING_SECONDS = 60;

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

// Fallback recording formats: Chrome/Firefox record webm/opus; Safari only mp4/aac.
const RECORDING_TYPES = [
  { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
  { mimeType: 'audio/webm', ext: 'webm' },
  { mimeType: 'audio/mp4', ext: 'mp4' },
];

export const isVoiceSupported = () =>
  typeof window !== 'undefined' && (!!SpeechRecognition || (!!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia));

const toAudioUrl = ({ mimeType, base64 }) => `data:${mimeType};base64,${base64}`;

const STREAMING_KEY = '__streaming__';

export function useVoiceChat(bookId, characterId) {
  const [isListening, setIsListening] = useState(false);
  const [listenSeconds, setListenSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  // True when the recogniser stopped by itself (e.g. after a long pause).
  const [endedOnItsOwn, setEndedOnItsOwn] = useState(false);
  const [speakingText, setSpeakingText] = useState(null);
  const [loadingText, setLoadingText] = useState(null);

  const sessionRef = useRef(null); // the current listening session
  const audioRef = useRef(null);
  const playlistRef = useRef(null); // { key, urls, position, open, waiting }
  const cacheRef = useRef(new Map()); // message text → audio urls

  // --- Playback ---

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    playlistRef.current = null;
    setSpeakingText(null);
  }, []);

  const playNext = useCallback(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    if (playlist.position >= playlist.urls.length) {
      audioRef.current = null;
      if (playlist.open) playlist.waiting = true;
      else stopPlayback();
      return;
    }
    playlist.waiting = false;
    const audio = new Audio(playlist.urls[playlist.position++]);
    audio.onended = () => {
      if (audioRef.current === audio) playNext();
    };
    audioRef.current = audio;
    audio.play().catch(() => stopPlayback());
  }, [stopPlayback]);

  const startPlaylist = useCallback((key, urls, open) => {
    stopPlayback();
    playlistRef.current = { key, urls: [...urls], position: 0, open, waiting: false };
    setSpeakingText(key);
    playNext();
  }, [playNext, stopPlayback]);

  /** Toggles speaking `text` in the character's voice. */
  const toggleSpeak = useCallback(async (text) => {
    if (speakingText === text) return stopPlayback();
    let urls = cacheRef.current.get(text);
    if (!urls) {
      setLoadingText(text);
      try {
        const data = await authFetch({
          path: `/book/${bookId}/character/${characterId}/speak`,
          method: 'POST',
          body: { text },
        });
        urls = [toAudioUrl(data.audio)];
        cacheRef.current.set(text, urls);
      } finally {
        setLoadingText(null);
      }
    }
    startPlaylist(text, urls, false);
  }, [bookId, characterId, speakingText, startPlaylist, stopPlayback]);

  // --- Listening ---

  const endSession = () => {
    const session = sessionRef.current;
    if (!session) return;
    clearInterval(session.timer);
    session.stream?.getTracks().forEach((track) => track.stop());
    sessionRef.current = null;
    setIsListening(false);
    setListenSeconds(0);
  };

  useEffect(() => () => {
    stopPlayback();
    const session = sessionRef.current;
    if (session?.recognition) session.recognition.abort();
    if (session?.recorder?.state === 'recording') session.recorder.stop();
    endSession();
  }, [stopPlayback]);

  const startTimer = (session) => {
    session.startedAt = Date.now();
    session.timer = setInterval(() => setListenSeconds((Date.now() - session.startedAt) / 1000), 250);
  };

  /** Throws if the microphone is unavailable or access was denied. */
  const startListening = useCallback(async () => {
    stopPlayback();
    setLiveTranscript('');
    setEndedOnItsOwn(false);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      const session = { recognition, finals: [], interim: '', ended: false, onEnd: null };
      recognition.onresult = (event) => {
        session.interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) session.finals[i] = text;
          else session.interim += text;
        }
        setLiveTranscript(session.transcript());
      };
      session.transcript = () => [...session.finals.filter(Boolean), session.interim].join(' ').replace(/\s+/g, ' ').trim();
      recognition.onend = () => {
        session.ended = true;
        if (session.onEnd) session.onEnd();
        else if (sessionRef.current === session) setEndedOnItsOwn(true);
      };
      await new Promise((resolve, reject) => {
        recognition.onstart = resolve;
        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
            const error = new Error(event.error);
            error.name = event.error === 'audio-capture' ? 'NotFoundError' : 'NotAllowedError';
            reject(error);
          }
        };
        recognition.start();
      });
      sessionRef.current = session;
      startTimer(session);
      setIsListening(true);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t.mimeType));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type.mimeType } : undefined);
    const session = { recorder, stream, chunks: [], ext: type?.ext || 'webm' };
    recorder.ondataavailable = (e) => e.data.size && session.chunks.push(e.data);
    recorder.start();
    sessionRef.current = session;
    startTimer(session);
    setIsListening(true);
  }, [stopPlayback]);

  /** Stops listening; resolves to what the reader said ('' if nothing), or null when cancelled. */
  const finishListening = useCallback(async (keep) => {
    const session = sessionRef.current;
    if (!session) return null;
    setEndedOnItsOwn(false);

    if (session.recognition) {
      endSession();
      if (!keep) {
        session.onEnd = () => {};
        session.recognition.abort();
        return null;
      }
      if (!session.ended) {
        // Wait briefly for the final result; fall back to the last interim one.
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 1200);
          session.onEnd = () => {
            clearTimeout(timeout);
            resolve();
          };
          session.recognition.stop();
        });
      }
      return session.transcript();
    }

    const durationSeconds = (Date.now() - session.startedAt) / 1000;
    const blob = await new Promise((resolve) => {
      session.recorder.onstop = () => resolve(new Blob(session.chunks, { type: session.recorder.mimeType || 'audio/webm' }));
      session.recorder.stop();
    });
    endSession();
    if (!keep) return null;
    if (!blob.size || durationSeconds < 0.5) return '';
    const body = new FormData();
    body.append('audio', blob, `voice.${session.ext}`);
    body.append('durationSeconds', String(durationSeconds));
    const { transcript } = await authFetch({
      path: `/book/${bookId}/character/${characterId}/transcribe`,
      method: 'POST',
      body,
    });
    return transcript;
  }, [bookId, characterId]);

  // --- A spoken turn ---

  /** Sends what the reader said and plays the reply as it streams in. */
  const sendTurn = useCallback(async (transcript, pageNumber, onText) => {
    const urls = [];
    try {
      const done = await streamVoiceReply({
        bookId,
        characterId,
        transcript,
        pageNumber,
        onEvent: (event) => {
          if (event.type === 'text') onText(event.text);
          if (event.type !== 'audio') return;
          const url = toAudioUrl(event);
          urls.push(url);
          if (urls.length === 1) {
            startPlaylist(STREAMING_KEY, [url], true);
          } else if (playlistRef.current?.key === STREAMING_KEY) {
            playlistRef.current.urls.push(url);
            if (playlistRef.current.waiting) playNext();
          }
        },
      });
      cacheRef.current.set(done.message, urls);
      // The reply is complete: the playing message is now addressable by its text.
      const playlist = playlistRef.current;
      if (playlist?.key === STREAMING_KEY) {
        playlist.key = done.message;
        playlist.open = false;
        setSpeakingText(done.message);
        if (playlist.waiting) playNext();
      }
      return done;
    } catch (err) {
      if (playlistRef.current?.key === STREAMING_KEY) stopPlayback();
      throw err;
    }
  }, [bookId, characterId, playNext, startPlaylist, stopPlayback]);

  return {
    isListening,
    listenSeconds,
    liveTranscript,
    endedOnItsOwn,
    startListening,
    finishListening,
    sendTurn,
    speakingText,
    loadingText,
    toggleSpeak,
    stopPlayback,
  };
}
