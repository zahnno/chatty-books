import React, { useCallback, useState } from 'react';
import { Play, Pause, Headphones, ChevronDown, X } from 'react-feather';
import { useNavigate } from 'react-router-dom';
import { useAudiobookPlayer } from '../context/AudiobookPlayerContext';
import { useBookAudioProfiles } from '../hooks/useApi';
import './AudiobookPlayer.css';
import { thumbUrl } from '@talkingbook/shared';

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const AudiobookPlayer = () => {
  const {
    currentBook,
    currentProfile,
    isPlaying,
    currentTime,
    duration,
    isVisible,
    currentPage,
    playProfile,
    pause,
    resume,
    seek,
    closePlayer,
  } = useAudiobookPlayer();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const bookId = currentBook?.bookId;
  const { data: audioProfiles = [], isLoading } = useBookAudioProfiles(bookId);
  const completedAudios = audioProfiles.filter(p => p.status === 'completed');

  const handleSeek = useCallback((e) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  }, [seek, duration]);

  const handlePlayPause = useCallback((profile) => {
    if (currentProfile?._id === profile._id) {
      isPlaying ? pause() : resume();
    } else {
      playProfile(profile, currentBook);
    }
  }, [currentProfile, isPlaying, pause, resume, playProfile, currentBook]);

  if (!isVisible || !currentBook) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audiobook-player">
      <div className="player-mini">

        {/* Left: cover + info + voice dropdown */}
        <div className="player-mini-left" style={{ cursor: 'pointer' }} onClick={() => navigate(`/books/${currentBook.bookId}`)}>
          {currentBook.bookCover && (
            <img
              src={thumbUrl(currentBook.bookCover, 100)}
              alt={currentBook.bookTitle}
              className="player-mini-cover"
            />
          )}
          <div className="player-mini-info">
            <span className="player-mini-title">{currentBook.bookTitle}</span>
            {currentProfile && (
              <span className="player-mini-voice">{currentProfile.voiceName}</span>
            )}
            {currentPage && (
              <span
                className="player-mini-page"
                onClick={e => { e.stopPropagation(); navigate(`/books/${currentBook.bookId}/page/${currentPage}`); }}
              >
                Page {currentPage}
              </span>
            )}
          </div>
          <div className="player-voice-dropdown" onClick={e => e.stopPropagation()}>
            <button
              className={`player-voice-trigger ${dropdownOpen ? 'open' : ''}`}
              onClick={() => setDropdownOpen(o => !o)}
              disabled={isLoading || completedAudios.length === 0}
            >
              <Headphones size={13} />
              <span>{isLoading ? 'Loading…' : currentProfile ? currentProfile.voiceName : 'Voice'}</span>
              <ChevronDown size={12} className={`player-voice-trigger-chevron ${dropdownOpen ? 'open' : ''}`} />
            </button>
            {dropdownOpen && (
              <div className="player-voice-menu">
                {completedAudios.map((audio) => (
                  <button
                    key={audio._id}
                    className={`player-voice-option ${currentProfile?._id === audio._id ? 'active' : ''}`}
                    onClick={() => { handlePlayPause(audio); setDropdownOpen(false); }}
                  >
                    <span className="player-voice-option-dot" />
                    <span>{audio.voiceName}</span>
                    {currentProfile?._id === audio._id && (isPlaying ? <Pause size={13} /> : <Play size={13} />)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: seek bar + timestamps */}
        <div className="player-mini-seek-group">
          <div className="player-seek-bar player-mini-seek" onClick={handleSeek} role="slider" aria-label="Seek">
            <div className="player-seek-fill" style={{ width: `${progress}%` }} />
          </div>
          {currentProfile && (
            <div className="player-mini-timestamps">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          )}
        </div>

        {/* Right: media buttons */}
        <div className="player-mini-controls">
          <button
            className="player-icon-btn player-play-btn"
            onClick={() => currentProfile && handlePlayPause(currentProfile)}
            disabled={!currentProfile}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <button
            className="player-icon-btn player-close-btn"
            onClick={closePlayer}
            aria-label="Close player"
          >
            <X size={16} />
          </button>
        </div>

      </div>
    </div>
  );
};

export default AudiobookPlayer;
