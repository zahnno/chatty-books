import React, { useState, useEffect, useRef } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { Compass, Book, Search, Users, Image, Settings, Upload, LogIn, LogOut, Sun, Moon, User, X, BookOpen, Headphones, Play, Pause, ChevronRight } from "react-feather";
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useRoutePrefetch, useBookAudioProfiles } from '../hooks/useApi';
import { authFetch, catchError } from '../utils.js';
import { useAudiobookPlayer } from '../context/AudiobookPlayerContext';
import Cookies from "universal-cookie";
import { thumbUrl } from '@talkingbook/shared';

// Same destinations and order as the mobile app's tab bar
const PRIMARY_ITEMS = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/books', label: 'Library', icon: Book, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/characters', label: 'Characters', icon: Users },
  { to: '/gallery', label: 'Gallery', icon: Image },
];

const ADMIN_ITEMS = [
  { to: '/admin/books', label: 'Book management', icon: Settings },
  { to: '/upload', label: 'Upload book', icon: Upload },
];

const formatTime = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
};

// Slide-out drawer opened from the header menu button
export default function Navbar({ isOpen, onClose }) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { user } = useAuth();
  const prefetchRoute = useRoutePrefetch();
  const { recentAudiobook, playProfile, isPlaying, isVisible, currentBook, currentTime, duration, pause, resume } = useAudiobookPlayer();
  const { data: recentAudioProfiles = [] } = useBookAudioProfiles(recentAudiobook?.bookId);
  const isAudioActive = isVisible && currentBook;
  const audioProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const navigate = useNavigate();
  const closeButtonRef = useRef(null);
  const [currentReading, setCurrentReading] = useState(null);

  const closeMenu = () => {
    onClose();
  };

  const handleLogout = () => {
    new Cookies().remove('token', { path: "/" });
    window.location.href = '/';
  };

  // onClose is a new function on every parent render; read it through a ref so the
  // effect below only runs when the drawer opens or closes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // While open: close on Escape, keep the page behind from scrolling, focus the close button
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Fetch current reading progress
  useEffect(() => {
    const fetchCurrentReading = async () => {
      if (!user) {
        setCurrentReading(null);
        return;
      }

      const [error, data] = await catchError(authFetch({
        path: '/user/current-reading',
        method: 'GET'
      }));

      if (error) {
        console.error('Error fetching current reading:', error);
        setCurrentReading(null);
      } else {
        setCurrentReading(data);
      }
    };

    fetchCurrentReading();
  }, [user]);

  const handleContinueReading = () => {
    closeMenu();
    navigate(`/books/${currentReading.book._id}/page/${currentReading.currentPage}`);
  };

  const handleContinueListening = () => {
    const completedProfiles = recentAudioProfiles.filter(p => p.status === 'completed');
    const profile =
      completedProfiles.find(p => p._id === recentAudiobook.profileId) ||
      completedProfiles[0];
    if (profile) {
      const lastReadPage =
        currentReading?.book?._id === recentAudiobook.bookId
          ? currentReading.currentPage
          : null;
      playProfile(
        profile,
        { bookId: recentAudiobook.bookId, bookTitle: recentAudiobook.bookTitle, bookCover: recentAudiobook.bookCover },
        lastReadPage,
      );
    }
    closeMenu();
  };

  const renderLink = ({ to, label, icon: Icon, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className="side-nav-link"
      onClick={closeMenu}
      onMouseEnter={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );

  const showResume = user && (currentReading || recentAudiobook);

  return (
    <>
      <div className={`overlay ${isOpen ? 'visible' : ''}`} onClick={closeMenu} aria-hidden="true"></div>

      <nav className={`side-nav ${isOpen ? 'open' : ''}`} aria-label="Main menu">
        <div className="side-nav-top">
          <Link className="side-nav-brand" to="/" onClick={closeMenu}>
            <img src={isDarkMode ? '/book-logo-dark.png' : '/book-logo-light.png'} alt="" />
            <span>Chatty Books</span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            className="side-nav-icon-button"
            onClick={closeMenu}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="side-nav-body">
          {showResume && (
            <section className="side-nav-group">
              <div className="side-nav-label">Pick up where you left off</div>

              {currentReading && (
                <button type="button" className="side-nav-resume" onClick={handleContinueReading}>
                  <img
                    className="side-nav-resume-cover"
                    src={thumbUrl(currentReading.book.image_url, 100)}
                    alt=""
                    onError={(e) => { e.target.src = '/book-placeholder.png'; }}
                  />
                  <span className="side-nav-resume-info">
                    <span className="side-nav-resume-kind"><BookOpen size={12} aria-hidden="true" /> Reading</span>
                    <span className="side-nav-resume-title">{currentReading.book.title}</span>
                    <span className="side-nav-progress">
                      <span className="side-nav-progress-fill" style={{ width: `${currentReading.progress}%` }} />
                    </span>
                    <span className="side-nav-resume-meta">
                      <span>Page {currentReading.currentPage} of {currentReading.totalPages}</span>
                      <span>{currentReading.progress}%</span>
                    </span>
                  </span>
                </button>
              )}

              {recentAudiobook && (
                <div className="side-nav-resume-row">
                  <button type="button" className="side-nav-resume" onClick={handleContinueListening}>
                    <img
                      className="side-nav-resume-cover"
                      src={thumbUrl(recentAudiobook.bookCover || '/book-placeholder.png', 100)}
                      alt=""
                      onError={(e) => { e.target.src = '/book-placeholder.png'; }}
                    />
                    <span className="side-nav-resume-info">
                      <span className="side-nav-resume-kind"><Headphones size={12} aria-hidden="true" /> Listening</span>
                      <span className="side-nav-resume-title">{recentAudiobook.bookTitle}</span>
                      {isAudioActive ? (
                        <>
                          <span className="side-nav-progress">
                            <span className="side-nav-progress-fill" style={{ width: `${audioProgress}%` }} />
                          </span>
                          <span className="side-nav-resume-meta">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                          </span>
                        </>
                      ) : (
                        <span className="side-nav-resume-meta">
                          <span>{recentAudiobook.voiceName}</span>
                        </span>
                      )}
                    </span>
                  </button>
                  {isAudioActive && (
                    <button
                      type="button"
                      className="side-nav-play"
                      onClick={() => (isPlaying ? pause() : resume())}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="side-nav-group">
            {PRIMARY_ITEMS.map(renderLink)}
          </section>

          {user?.role === 'admin' && (
            <section className="side-nav-group">
              <div className="side-nav-label">Admin</div>
              {ADMIN_ITEMS.map(renderLink)}
            </section>
          )}
        </div>

        <div className="side-nav-footer">
          {user ? (
            <Link className="side-nav-account" to="/settings" onClick={closeMenu}>
              <span className="side-nav-avatar">
                {user.profileImage ? <img src={thumbUrl(user.profileImage, 100)} alt="" /> : <User size={18} />}
              </span>
              <span className="side-nav-account-info">
                <span className="side-nav-account-name">{user.username || 'User'}</span>
                <span className="side-nav-account-email">{user.email}</span>
              </span>
              <ChevronRight size={16} className="side-nav-account-chevron" aria-hidden="true" />
            </Link>
          ) : (
            <Link className="side-nav-signin" to="/login" onClick={closeMenu}>
              <LogIn size={16} aria-hidden="true" />
              <span>Sign in</span>
            </Link>
          )}

          <div className="side-nav-footer-actions">
            <button type="button" className="side-nav-link" onClick={toggleTheme}>
              {isDarkMode ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              <span>{isDarkMode ? 'Light mode' : 'Dark mode'}</span>
            </button>
            {user && (
              <button type="button" className="side-nav-link" onClick={handleLogout}>
                <LogOut aria-hidden="true" />
                <span>Sign out</span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
