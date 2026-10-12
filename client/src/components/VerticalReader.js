import React from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';

export default function VerticalReader({
  loadedPages,
  scrollContainerRef,
  loadMoreSentinelRef,
  pageRefs,
  bookId,
  bookTitle,
  isDarkMode,
  fontSize,
  renderParagraph,
}) {
  return (
    <div
      ref={scrollContainerRef}
      className={`book-scroll-container ${isDarkMode ? 'dark-mode' : ''}`}
    >
      {loadedPages.map((scrollPage) => (
        <div
          key={scrollPage.pageNumber}
          className="book-scroll-page"
          data-page-number={scrollPage.pageNumber}
          ref={(el) => { pageRefs.current[scrollPage.pageNumber] = el; }}
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
          <div className="scroll-page-divider">
            Page {scrollPage.pageNumber}
          </div>
          <div
            className={`book-content ${isDarkMode ? 'dark-mode' : ''}`}
            style={{ fontSize: `${fontSize}px` }}
          >
            <Markdown components={{ p: renderParagraph }}>
              {scrollPage.pageText}
            </Markdown>
          </div>
        </div>
      ))}
      <div ref={loadMoreSentinelRef} className="scroll-load-sentinel" />
    </div>
  );
}
