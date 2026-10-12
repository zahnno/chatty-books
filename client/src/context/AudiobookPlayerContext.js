import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { authFetch } from '../utils.js';
import { SERVER_URI } from '../constants.js';

const resolveAudioUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SERVER_URI}${url}`;
};

const AudiobookPlayerContext = createContext(null);

// timestamps use normalized startTime (0–1); normTime = currentTime / duration
function findPage(timestamps, normTime) {
  let page = timestamps[0]?.pageNumber ?? null;
  for (const t of timestamps) {
    if (normTime >= t.startTime) page = t.pageNumber;
    else break;
  }
  return page;
}

export const AudiobookPlayerProvider = ({ children }) => {
  const [currentBook, setCurrentBook] = useState(null); // { bookId, bookTitle, bookCover }
  const [currentProfile, setCurrentProfile] = useState(null); // audio profile object
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(null);
  const [recentAudiobook, setRecentAudiobook] = useState(() => {
    try {
      const stored = localStorage.getItem('recentAudiobook');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const audioRef = useRef(null);
  const pageTimestampsRef = useRef([]);
  const lastReportedPageRef = useRef(null);

  const positionKey = (bookId, profileId) => `audiobook_pos_${bookId}_${profileId}`;

  const savePosition = useCallback((bookId, profileId, time) => {
    if (time > 0) {
      localStorage.setItem(positionKey(bookId, profileId), String(time));
    }
  }, []);

  const loadPosition = useCallback((bookId, profileId) => {
    return parseFloat(localStorage.getItem(positionKey(bookId, profileId)) || '0') || 0;
  }, []);

  // Attach event listeners whenever the audio src changes
  const attachListeners = useCallback((audio, bookId, profileId) => {
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Save position every ~5 seconds (when seconds crosses a multiple of 5)
      if (Math.floor(audio.currentTime) % 5 === 0) {
        savePosition(bookId, profileId, audio.currentTime);
      }
      // Page tracking
      const timestamps = pageTimestampsRef.current;
      if (timestamps.length > 0 && audio.duration > 0) {
        const page = findPage(timestamps, audio.currentTime / audio.duration);
        if (page !== null && page !== lastReportedPageRef.current) {
          setCurrentPage(page);
          lastReportedPageRef.current = page;
          authFetch({
            path: `/book/${bookId}/progress`,
            method: 'POST',
            body: { pageNumber: page },
            requireAuth: false
          }).catch(() => {});
        }
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Clear saved position when finished
      localStorage.removeItem(positionKey(bookId, profileId));
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      savePosition(bookId, profileId, audio.currentTime);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [savePosition]);

  const playProfile = useCallback((profile, book, lastReadPage = null) => {
    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
    }

    setCurrentBook(book);
    setCurrentProfile(profile);
    setCurrentTime(0);
    setDuration(0);
    setIsVisible(true);
    setCurrentPage(null);
    pageTimestampsRef.current = profile.pageTimestamps || [];
    lastReportedPageRef.current = null;

    const savedPosition = loadPosition(book.bookId, profile._id);

    console.log('[AudiobookPlayer] Playing profile:', {
      _id: profile._id,
      voiceName: profile.voiceName,
      audioUrl: profile.audioUrl,
      status: profile.status,
    });

    const resolvedUrl = resolveAudioUrl(profile.audioUrl);
    if (!resolvedUrl) {
      console.error('[AudiobookPlayer] No audioUrl on profile, cannot play');
      setIsVisible(false);
      return;
    }

    const audio = new Audio(resolvedUrl);
    audioRef.current = audio;
    attachListeners(audio, book.bookId, profile._id);

    // Restore position on metadata load. Prefer whichever is further: saved audio pos or last-read page
    audio.addEventListener('loadedmetadata', () => {
      let startTime = savedPosition;

      if (lastReadPage && pageTimestampsRef.current.length > 0 && audio.duration > 0) {
        const pageEntry = pageTimestampsRef.current.find(t => t.pageNumber === lastReadPage);
        if (pageEntry) {
          const pageTime = pageEntry.startTime * audio.duration;
          if (pageTime > startTime) startTime = pageTime;
        }
      }

      if (startTime > 0) {
        audio.currentTime = startTime;
        setCurrentTime(startTime);
      }
    }, { once: true });

    audio.play().catch(err => {
      console.error('[AudiobookPlayer] Playback error:', err, 'resolvedUrl:', resolvedUrl);
      setIsPlaying(false);
    });

    // Persist recent audiobook
    const recent = {
      bookId: book.bookId,
      bookTitle: book.bookTitle,
      bookCover: book.bookCover,
      profileId: profile._id,
      voiceName: profile.voiceName,
      lastPlayedAt: new Date().toISOString(),
    };
    setRecentAudiobook(recent);
    localStorage.setItem('recentAudiobook', JSON.stringify(recent));
  }, [attachListeners]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(err => console.error('Resume error:', err));
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setCurrentProfile(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const seek = useCallback((time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const openPlayer = useCallback((book) => {
    setCurrentBook(book);
    setIsVisible(true);
    setIsExpanded(true);
  }, []);

  const closePlayer = useCallback(() => {
    stop();
    setIsVisible(false);
    setIsExpanded(false);
    setCurrentBook(null);
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <AudiobookPlayerContext.Provider value={{
      currentBook,
      currentProfile,
      isPlaying,
      currentTime,
      duration,
      isVisible,
      isExpanded,
      currentPage,
      recentAudiobook,
      audioRef,
      playProfile,
      pause,
      resume,
      stop,
      seek,
      openPlayer,
      closePlayer,
      setIsExpanded,
    }}>
      {children}
    </AudiobookPlayerContext.Provider>
  );
};

export const useAudiobookPlayer = () => {
  const context = useContext(AudiobookPlayerContext);
  if (!context) {
    throw new Error('useAudiobookPlayer must be used within AudiobookPlayerProvider');
  }
  return context;
};
