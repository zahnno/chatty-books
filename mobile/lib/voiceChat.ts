// Voice chat with characters: listen to the reader (speech is recognised on the
// device, so there's no upload), stream the character's reply, and play it in
// the character's voice as each spoken chunk arrives.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
  type RecordingOptions,
} from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as FileSystem from 'expo-file-system';
import { fetch as streamingFetch } from 'expo/fetch';
// @ts-ignore - shared package is plain JS without type declarations
import { authFetch, streamVoiceReply } from '@talkingbook/shared';
import { useAudiobookPlayer } from '../context/AudiobookPlayerContext';

export const MAX_RECORDING_SECONDS = 60;

/** Whether microphone (and speech recognition) access is already granted, without prompting. */
export async function hasMicAccess(): Promise<boolean> {
  const { granted } = ExpoSpeechRecognitionModule.isRecognitionAvailable()
    ? await ExpoSpeechRecognitionModule.getPermissionsAsync()
    : await AudioModule.getRecordingPermissionsAsync();
  return granted;
}

// Fallback recording when the device has no speech recogniser: mono speech,
// transcribed on the server.
const SPEECH_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

type SpokenAudio = { mimeType: string; base64: string };

export type VoiceReply = { message: string; suggestions: string[]; voice: string };

// The shared client is plain JS; this is its contract (see packages/shared/src/voiceReply.js).
const streamReply = streamVoiceReply as (options: {
  bookId: string;
  characterId: string;
  transcript: string;
  pageNumber: number;
  fetchImpl: unknown;
  onEvent: (event: any) => void;
}) => Promise<VoiceReply>;

const speakText = (bookId: string, characterId: string, text: string): Promise<{ audio: SpokenAudio }> =>
  authFetch({ path: `/book/${bookId}/character/${characterId}/speak`, method: 'POST', body: { text } });

const transcribeRecording = (bookId: string, characterId: string, uri: string, durationSeconds: number) => {
  const body = new FormData();
  // React Native's FormData takes a { uri, name, type } file descriptor.
  body.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
  body.append('durationSeconds', String(durationSeconds));
  return authFetch({ path: `/book/${bookId}/character/${characterId}/transcribe`, method: 'POST', body }) as Promise<{
    transcript: string;
  }>;
};

// Playback goes through the speaker, not the earpiece, once listening is done.
const setListeningMode = (allowsRecording: boolean) =>
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording });

let fileCounter = 0;
async function writeAudioFile(audio: SpokenAudio) {
  const uri = `${FileSystem.cacheDirectory}voice-${Date.now()}-${fileCounter++}.mp3`;
  await FileSystem.writeAsStringAsync(uri, audio.base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

// Chunks of one spoken message, played back to back. More chunks can arrive
// while it plays (`open` until the reply is complete).
type Playlist = { key: string; uris: string[]; position: number; open: boolean; waiting: boolean };

const STREAMING_KEY = '__streaming__';

/**
 * Listening + playback state for one character conversation.
 *
 * Spoken messages are cached by their text for the life of the screen, so
 * replaying one is free; speaking an older message calls /speak once.
 */
export function useVoiceChat(bookId: string, characterId: string, contextualStrings: string[] = []) {
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const audiobook = useAudiobookPlayer();

  const [isListening, setIsListening] = useState(false);
  const [listenSeconds, setListenSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  // True when the recogniser stopped by itself (e.g. Android 12- after a pause).
  const [endedOnItsOwn, setEndedOnItsOwn] = useState(false);
  // Key of the message currently playing, or being fetched for playback.
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);

  const modeRef = useRef<'recognizer' | 'recorder' | null>(null);
  const startedAtRef = useRef(0);
  const segmentsRef = useRef<string[]>([]); // finalised recogniser segments
  const interimRef = useRef('');
  const finishingRef = useRef<(() => void) | null>(null);
  const recognizerEndedRef = useRef(false);

  const playerRef = useRef<AudioPlayer | null>(null);
  const playlistRef = useRef<Playlist | null>(null);
  const cacheRef = useRef(new Map<string, string[]>()); // message text → local file uris

  // --- Playback ---

  const stopPlayback = useCallback(() => {
    playerRef.current?.remove();
    playerRef.current = null;
    playlistRef.current = null;
    setSpeakingText(null);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const playNext = useCallback(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    playerRef.current?.remove();
    playerRef.current = null;
    if (playlist.position >= playlist.uris.length) {
      if (playlist.open) playlist.waiting = true;
      else stopPlayback();
      return;
    }
    playlist.waiting = false;
    const player = createAudioPlayer({ uri: playlist.uris[playlist.position++] });
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && playerRef.current === player) playNext();
    });
    playerRef.current = player;
    player.play();
  }, [stopPlayback]);

  const startPlaylist = useCallback(
    (key: string, uris: string[], open: boolean) => {
      stopPlayback();
      if (audiobook.isPlaying) audiobook.pause();
      playlistRef.current = { key, uris: [...uris], position: 0, open, waiting: false };
      setSpeakingText(key);
      playNext();
    },
    [audiobook, playNext, stopPlayback]
  );

  /** Toggles speaking `text` in the character's voice. */
  const toggleSpeak = useCallback(
    async (text: string) => {
      if (speakingText === text) return stopPlayback();
      const cached = cacheRef.current.get(text);
      if (cached) return startPlaylist(text, cached, false);

      setLoadingText(text);
      try {
        const { audio } = await speakText(bookId, characterId, text);
        const uri = await writeAudioFile(audio);
        cacheRef.current.set(text, [uri]);
        startPlaylist(text, [uri], false);
      } finally {
        setLoadingText(null);
      }
    },
    [bookId, characterId, speakingText, startPlaylist, stopPlayback]
  );

  // --- Listening ---

  const currentTranscript = () => [...segmentsRef.current, interimRef.current].join(' ').replace(/\s+/g, ' ').trim();

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      segmentsRef.current.push(text);
      interimRef.current = '';
    } else {
      interimRef.current = text;
    }
    setLiveTranscript(currentTranscript());
  });

  useSpeechRecognitionEvent('end', () => {
    if (modeRef.current !== 'recognizer') return;
    recognizerEndedRef.current = true;
    if (finishingRef.current) {
      finishingRef.current();
    } else {
      setEndedOnItsOwn(true);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.warn('Speech recognition error:', event.error, event.message);
  });

  // Recording timer
  useEffect(() => {
    if (!isListening) return;
    const timer = setInterval(() => setListenSeconds((Date.now() - startedAtRef.current) / 1000), 250);
    return () => clearInterval(timer);
  }, [isListening]);

  /** Returns false if the user declined microphone / speech access. */
  const startListening = useCallback(async () => {
    const useRecognizer = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    const { granted } = useRecognizer
      ? await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      : await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) return false;

    stopPlayback();
    if (audiobook.isPlaying) audiobook.pause();
    segmentsRef.current = [];
    interimRef.current = '';
    recognizerEndedRef.current = false;
    setLiveTranscript('');
    setEndedOnItsOwn(false);

    if (useRecognizer) {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        // Helps the recogniser spell names from the book.
        contextualStrings,
      });
      modeRef.current = 'recognizer';
    } else {
      await setListeningMode(true);
      await recorder.prepareToRecordAsync();
      recorder.record();
      modeRef.current = 'recorder';
    }
    startedAtRef.current = Date.now();
    setListenSeconds(0);
    setIsListening(true);
    return true;
  }, [audiobook, contextualStrings, recorder, stopPlayback]);

  /**
   * Stops listening and resolves to what the reader said ('' if nothing), or
   * null when cancelled.
   */
  const finishListening = useCallback(
    async (keep: boolean): Promise<string | null> => {
      const mode = modeRef.current;
      setIsListening(false);
      setEndedOnItsOwn(false);

      if (mode === 'recognizer') {
        if (!keep) {
          modeRef.current = null; // so the 'end' that follows isn't taken as the reader finishing
          ExpoSpeechRecognitionModule.abort();
          await setListeningMode(false).catch(() => {});
          return null;
        }
        if (!recognizerEndedRef.current) {
          // Wait briefly for the final result; fall back to the last interim one.
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 1200);
            finishingRef.current = () => {
              clearTimeout(timeout);
              resolve();
            };
            ExpoSpeechRecognitionModule.stop();
          });
          finishingRef.current = null;
        }
        modeRef.current = null;
        await setListeningMode(false).catch(() => {});
        return currentTranscript();
      }

      modeRef.current = null;

      if (mode === 'recorder') {
        const durationSeconds = recorder.currentTime;
        await recorder.stop();
        await setListeningMode(false).catch(() => {});
        if (!keep || !recorder.uri) return null;
        if (durationSeconds < 0.5) return '';
        const { transcript } = await transcribeRecording(bookId, characterId, recorder.uri, durationSeconds);
        return transcript;
      }
      return null;
    },
    [bookId, characterId, recorder]
  );

  // --- A spoken turn ---

  /**
   * Sends what the reader said and plays the reply as it streams in.
   * `onText` receives the reply text so far.
   */
  const sendTurn = useCallback(
    async (transcript: string, pageNumber: number, onText: (text: string) => void): Promise<VoiceReply> => {
      const uris: string[] = [];
      let started = false;
      // Chunk files are written in arrival order; keep playback in that order.
      let writes = Promise.resolve();
      try {
        const done = await streamReply({
          bookId,
          characterId,
          transcript,
          pageNumber,
          fetchImpl: streamingFetch,
          onEvent: (event: any) => {
            if (event.type === 'text') onText(event.text);
            if (event.type !== 'audio') return;
            writes = writes.then(async () => {
              const uri = await writeAudioFile(event);
              uris.push(uri);
              if (!started) {
                started = true;
                startPlaylist(STREAMING_KEY, [uri], true);
              } else if (playlistRef.current?.key === STREAMING_KEY) {
                playlistRef.current.uris.push(uri);
                if (playlistRef.current.waiting) playNext();
              }
            });
          },
        });
        await writes;
        cacheRef.current.set(done.message, uris);
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
    },
    [bookId, characterId, playNext, startPlaylist, stopPlayback]
  );

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
