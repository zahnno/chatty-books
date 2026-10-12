// Global audiobook player for mobile, mirroring the web AudiobookPlayerContext but
// backed by expo-audio. Lives at the app root so playback continues across screens.
//
// Profile shape (from GET /book/:id/audio-profiles):
//   { _id, voiceName, audioUrl, status, duration, pageTimestamps: [{ pageNumber, startTime(0-1) }] }
// Book shape: { bookId, bookTitle, bookCover }
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
// @ts-ignore - shared package is plain JS without type declarations
import { authFetch } from '@talkingbook/shared';
import { SERVER_URI } from '../lib/api';

export type PageTimestamp = { pageNumber: number; startTime: number };
export type AudioProfile = {
  _id: string;
  voiceName?: string;
  audioUrl?: string;
  status?: string;
  duration?: number;
  pageTimestamps?: PageTimestamp[];
};
export type PlayerBook = { bookId: string; bookTitle?: string; bookCover?: string };

type Recent = PlayerBook & { profileId: string; voiceName?: string; lastPlayedAt: string };

const resolveAudioUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SERVER_URI}${url}`;
};

// timestamps use normalized startTime (0–1); normTime = currentTime / duration
function findPage(timestamps: PageTimestamp[], normTime: number): number | null {
  let page: number | null = timestamps[0]?.pageNumber ?? null;
  for (const t of timestamps) {
    if (normTime >= t.startTime) page = t.pageNumber;
    else break;
  }
  return page;
}

const positionKey = (bookId: string, profileId: string) =>
  `audiobook_pos_${bookId}_${profileId}`;

type Ctx = {
  currentBook: PlayerBook | null;
  currentProfile: AudioProfile | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isVisible: boolean;
  currentPage: number | null;
  recentAudiobook: Recent | null;
  playProfile: (profile: AudioProfile, book: PlayerBook, lastReadPage?: number | null) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
  closePlayer: () => void;
};

const AudiobookPlayerContext = createContext<Ctx | null>(null);

export const AudiobookPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  // expo-audio 0.3's Android replace() is a no-op on a player created without a
  // source (it swaps playlist item 0, which doesn't exist), so drive the source through
  // the hook instead: each new URL gets a freshly created, prepared player.
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const player = useAudioPlayer(sourceUri ? { uri: sourceUri } : null);
  const status = useAudioPlayerStatus(player);
  const playWhenReadyRef = useRef(false);

  // Start playback as soon as the player for a newly chosen source exists.
  useEffect(() => {
    if (!sourceUri || !playWhenReadyRef.current) return;
    playWhenReadyRef.current = false;
    player.play();
  }, [player, sourceUri]);

  const [currentBook, setCurrentBook] = useState<PlayerBook | null>(null);
  const [currentProfile, setCurrentProfile] = useState<AudioProfile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [recentAudiobook, setRecentAudiobook] = useState<Recent | null>(null);

  const pageTimestampsRef = useRef<PageTimestamp[]>([]);
  const lastReportedPageRef = useRef<number | null>(null);
  const bookProfileRef = useRef<{ bookId: string; profileId: string } | null>(null);
  const pendingRestoreRef = useRef<{ savedPosition: number; lastReadPage?: number | null } | null>(
    null
  );
  const restoredRef = useRef(false);

  // Enable silent-mode + background playback once.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
  }, []);

  // Load the most-recently played audiobook for "resume" UI.
  useEffect(() => {
    AsyncStorage.getItem('recentAudiobook')
      .then((v) => v && setRecentAudiobook(JSON.parse(v)))
      .catch(() => {});
  }, []);

  const savePosition = useCallback((bookId: string, profileId: string, time: number) => {
    if (time > 0) AsyncStorage.setItem(positionKey(bookId, profileId), String(time)).catch(() => {});
  }, []);

  const loadPosition = useCallback(async (bookId: string, profileId: string) => {
    const v = await AsyncStorage.getItem(positionKey(bookId, profileId));
    return parseFloat(v || '0') || 0;
  }, []);

  // Where to resume: the later of the saved position and the last-read page's timestamp.
  const resumeTime = (dur: number) => {
    let startTime = pendingRestoreRef.current?.savedPosition ?? 0;
    const lastReadPage = pendingRestoreRef.current?.lastReadPage;
    const ts = pageTimestampsRef.current;
    if (lastReadPage && ts.length > 0) {
      const entry = ts.find((t) => t.pageNumber === lastReadPage);
      if (entry) {
        const pageTime = entry.startTime * dur;
        if (pageTime > startTime) startTime = pageTime;
      }
    }
    return startTime;
  };

  // Restore position once the new source reports a duration.
  useEffect(() => {
    if (!status?.isLoaded || restoredRef.current) return;
    const dur = status.duration || 0;
    if (dur <= 0) return;
    const startTime = resumeTime(dur);
    if (startTime > 0) player.seekTo(startTime);
    restoredRef.current = true;
  }, [status?.isLoaded, status?.duration]);

  // Time updates: surface state, persist position every ~5s, report page progress.
  useEffect(() => {
    if (!status?.isLoaded) return;
    const t = status.currentTime || 0;
    setCurrentTime(t);
    setDuration(status.duration || 0);
    setIsPlaying(!!status.playing);

    const bp = bookProfileRef.current;
    if (!bp) return;
    if (t > 0 && Math.floor(t) % 5 === 0) savePosition(bp.bookId, bp.profileId, t);

    const ts = pageTimestampsRef.current;
    if (ts.length > 0 && (status.duration || 0) > 0) {
      const page = findPage(ts, t / status.duration);
      if (page !== null && page !== lastReportedPageRef.current) {
        setCurrentPage(page);
        lastReportedPageRef.current = page;
        authFetch({
          path: `/book/${bp.bookId}/progress`,
          method: 'POST',
          body: { pageNumber: page },
        }).catch(() => {}); // guests have no saved progress; this throws locally and is ignored
      }
    }
  }, [status?.currentTime]);

  // Clear saved position when a track finishes.
  useEffect(() => {
    if (!status?.didJustFinish) return;
    setIsPlaying(false);
    setCurrentTime(0);
    const bp = bookProfileRef.current;
    if (bp) AsyncStorage.removeItem(positionKey(bp.bookId, bp.profileId)).catch(() => {});
  }, [status?.didJustFinish]);

  const playProfile = useCallback(
    async (profile: AudioProfile, book: PlayerBook, lastReadPage: number | null = null) => {
      const url = resolveAudioUrl(profile.audioUrl);
      if (!url) return;

      setCurrentBook(book);
      setCurrentProfile(profile);
      setCurrentTime(0);
      setDuration(0);
      setCurrentPage(null);
      setIsVisible(true);
      pageTimestampsRef.current = profile.pageTimestamps || [];
      lastReportedPageRef.current = null;
      bookProfileRef.current = { bookId: book.bookId, profileId: profile._id };
      restoredRef.current = false;

      const savedPosition = await loadPosition(book.bookId, profile._id);
      pendingRestoreRef.current = { savedPosition, lastReadPage };

      if (url === sourceUri) {
        // Same track: the existing player is already loaded, so restore directly.
        player.seekTo(resumeTime(player.duration || 0));
        restoredRef.current = true;
        player.play();
      } else {
        playWhenReadyRef.current = true;
        setSourceUri(url);
      }

      const recent: Recent = {
        ...book,
        profileId: profile._id,
        voiceName: profile.voiceName,
        lastPlayedAt: new Date().toISOString(),
      };
      setRecentAudiobook(recent);
      AsyncStorage.setItem('recentAudiobook', JSON.stringify(recent)).catch(() => {});
    },
    [player, sourceUri, loadPosition]
  );

  const pause = useCallback(() => {
    player.pause();
    const bp = bookProfileRef.current;
    if (bp) savePosition(bp.bookId, bp.profileId, currentTime);
  }, [player, currentTime, savePosition]);

  const resume = useCallback(() => player.play(), [player]);

  const stop = useCallback(() => {
    player.pause();
    player.seekTo(0);
    setCurrentProfile(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [player]);

  const seek = useCallback((time: number) => {
    player.seekTo(time);
    setCurrentTime(time);
  }, [player]);

  const closePlayer = useCallback(() => {
    stop();
    setIsVisible(false);
    setCurrentBook(null);
    setSourceUri(null); // release the native player
  }, [stop]);

  return (
    <AudiobookPlayerContext.Provider
      value={{
        currentBook,
        currentProfile,
        isPlaying,
        currentTime,
        duration,
        isVisible,
        currentPage,
        recentAudiobook,
        playProfile,
        pause,
        resume,
        stop,
        seek,
        closePlayer,
      }}
    >
      {children}
    </AudiobookPlayerContext.Provider>
  );
};

export const useAudiobookPlayer = () => {
  const ctx = useContext(AudiobookPlayerContext);
  if (!ctx) throw new Error('useAudiobookPlayer must be used within AudiobookPlayerProvider');
  return ctx;
};
