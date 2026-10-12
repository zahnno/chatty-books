import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { ChevronLeft, ChevronRight, RefreshCw } from 'react-feather';

export default function HorizontalReader({
  page,
  bookId,
  bookTitle,
  isDarkMode,
  fontSize,
  isFetching,
  isTransitioning,
  showSwipeInstructions,
  pageNumber,
  loading,
  renderParagraph,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onPrevClick,
  onNextClick,
}) {
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [page]);

  return (
    <div
      className={`book-page-container ${isDarkMode ? 'dark-mode' : ''} ${!loading ? 'fade-in' : ''} ${isTransitioning ? 'transitioning' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      <div
        ref={contentRef}
        className={`book-content ${isDarkMode ? 'dark-mode' : ''} ${isFetching ? 'fetching' : ''}`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {bookTitle && bookId && (
          <div className={`book-page-title-header ${isDarkMode ? 'dark-mode' : ''}`}>
            <span className="book-page-title-line" aria-hidden="true" />
            <Link to={`/books/${bookId}`} className="book-page-title-link">
              {bookTitle}
            </Link>
            <span className="book-page-title-line" aria-hidden="true" />
          </div>
        )}
        <Markdown components={{ p: renderParagraph }}>
          {page?.pageText}
        </Markdown>

        {isFetching && (
          <div className={`page-turn-loader ${isDarkMode ? 'dark-mode' : ''}`}>
            <RefreshCw size={16} className="spin" style={{ color: isDarkMode ? '#fff' : '#333', opacity: 0.7 }} />
          </div>
        )}
      </div>

      <div className="navigation-buttons">
        <div className="navigation-buttons-row">
          {pageNumber != 1 && (
            <button
              className={`nav-btn prev-btn ${isDarkMode ? 'dark-mode' : ''}`}
              onClick={onPrevClick}
              disabled={isTransitioning}
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div className={`page-number ${isDarkMode ? 'dark-mode' : ''}`}>{page?.pageNumber}</div>
          <button
            className={`nav-btn next-btn ${isDarkMode ? 'dark-mode' : ''}`}
            onClick={onNextClick}
            disabled={isTransitioning}
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {showSwipeInstructions && (
        <div className={`swipe-instructions ${isDarkMode ? 'dark-mode' : ''} visible`}>
          ← Swipe or use arrow keys to navigate →
        </div>
      )}

      {isTransitioning && (
        <div className={`swipe-feedback next ${isDarkMode ? 'dark-mode' : ''}`} />
      )}
    </div>
  );
}
