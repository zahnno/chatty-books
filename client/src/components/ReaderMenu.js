import React from 'react';
import { Users, Grid } from 'react-feather';

export default function ReaderMenu({
  user,
  isDarkMode,
  cleanReadingMode,
  readingMode,
  fontSize,
  isMenuOpen,
  characters,
  onClose,
  onToggleTheme,
  onToggleCleanMode,
  onToggleReadingMode,
  onShowGallery,
  onShowCharacters,
  onFontSizeChange,
  onNavigateLogin,
}) {
  return (
    <div className={`reader-menu ${isDarkMode ? 'dark-mode' : ''} ${isMenuOpen ? 'open' : ''}`}>
      <div className="menu-header">
        <h3>Reader Controls</h3>
      </div>

      {user ? (
        <>
          <div className="menu-section">
            <h4>Theme</h4>
            <button
              className={`menu-btn theme-btn ${isDarkMode ? 'active' : ''}`}
              onClick={onToggleTheme}
            >
              {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>

          <div className="menu-section">
            <h4>Reading Experience</h4>
            <button
              className={`menu-btn ${cleanReadingMode ? 'active' : ''}`}
              onClick={onToggleCleanMode}
            >
              📖 {cleanReadingMode ? 'Show UI Controls' : 'Clean Reading Mode'}
            </button>
          </div>

          {/* <div className="menu-section">
            <h4>Reading Mode</h4>
            <button
              className={`menu-btn ${readingMode === 'vertical' ? 'active' : ''}`}
              onClick={onToggleReadingMode}
            >
              {readingMode === 'vertical' ? '← Horizontal Swipe' : '↕ Vertical Scroll'}
            </button>
          </div> */}

          <div className="menu-section">
            <h4>Image Gallery</h4>
            <button
              className={`menu-btn gallery-btn ${isDarkMode ? 'dark-mode' : ''}`}
              onClick={onShowGallery}
            >
              <Grid size={20} />
              View Community Gallery
            </button>
          </div>

          <div className="menu-section">
            <h4>Font Size</h4>
            <div className="font-size-controls">
              <button
                className={`font-size-btn ${isDarkMode ? 'dark-mode' : ''}`}
                onClick={() => onFontSizeChange(-1)}
                disabled={fontSize <= 12}
              >
                A-
              </button>
              <button
                className={`font-size-btn ${isDarkMode ? 'dark-mode' : ''}`}
                onClick={() => onFontSizeChange(1)}
                disabled={fontSize >= 24}
              >
                A+
              </button>
            </div>
          </div>

          <div className="menu-section">
            <h4>Characters</h4>
            <button
              className={`menu-btn characters-btn ${isDarkMode ? 'dark-mode' : ''} ${
                characters && characters.some(char => char.presentInCurrentPage) ? 'has-characters' : ''
              }`}
              onClick={onShowCharacters}
            >
              <Users size={20} />
              View Characters
            </button>
          </div>
        </>
      ) : (
        <div className="menu-section">
          <p style={{ fontSize: '14px' }}>Please sign in for access to Advanced Controls</p>
          <button
            className="menu-btn primary-cta"
            style={{ width: '100%' }}
            onClick={onNavigateLogin}
          >
            Sign In
          </button>
        </div>
      )}
    </div>
  );
}
