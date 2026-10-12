import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, MessageCircle, ChevronLeft, ChevronRight } from 'react-feather';
import { authFetch, catchError } from '../utils';
import { toast } from 'react-toastify';
import { thumbUrl } from '@talkingbook/shared';

export default function FeaturedBookHero({ books, handleClick, user, onBookHover }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [purchasedBooks, setPurchasedBooks] = useState({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const currentBook = books[currentIndex];

  const goTo = useCallback((getIndex) => {
    setIsTransitioning(true);
    setIsDescriptionExpanded(false);
    setTimeout(() => {
      setCurrentIndex(getIndex);
      setIsTransitioning(false);
    }, 200);
  }, []);

  const handleNavigation = useCallback((direction) => {
    goTo((prev) => direction === 'next'
      ? (prev + 1) % books.length
      : (prev - 1 + books.length) % books.length);
  }, [goTo, books.length]);

  // Horizontal trackpad scroll and touch swipes move between books
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    let locked = false;
    let lockTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;

    const lock = () => {
      locked = true;
      lockTimer = setTimeout(() => { locked = false; }, 800);
    };

    // Only clearly horizontal wheel movement changes the book, so vertical scroll passes through
    const handleWheel = (e) => {
      if (locked) return;
      const absX = Math.abs(e.deltaX ?? 0);
      const absY = Math.abs(e.deltaY ?? 0);
      if (absX > absY && absX > 60) {
        lock();
        handleNavigation(e.deltaX > 0 ? 'next' : 'prev');
      }
    };

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e) => {
      if (locked) return;
      const deltaX = touchStartX - e.changedTouches[0].screenX;
      const deltaY = touchStartY - e.changedTouches[0].screenY;
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        lock();
        handleNavigation(deltaX > 0 ? 'next' : 'prev');
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
      clearTimeout(lockTimer);
    };
  }, [handleNavigation]);

  const handleAddBook = async (book) => {
    const [error, data] = await catchError(authFetch({
      path: `/book/${book._id}/add`,
      method: 'POST',
    }));
    if (data) {
      toast.success(`${book.title} added`);
      setPurchasedBooks(prev => ({
        ...prev,
        [book._id]: true
      }));
      navigate(`/books/${book._id}`);
    }
    if (error) {
      toast.error(`${book.title} could not be added to library: ${error.message}`);
    }
  };

  if (!currentBook) return null;

  const canRead = currentBook.isPurchased || purchasedBooks[currentBook._id] || currentBook.is_public;

  return (
    <section className="home-band">
      <div className="home-band-inner spotlight" ref={containerRef}>
        <div className={`spotlight-body ${isTransitioning ? 'transitioning' : ''}`}>
          <button
            type="button"
            className="spotlight-cover"
            onClick={() => handleClick(currentBook._id)}
            onMouseEnter={() => onBookHover?.(currentBook)}
            onFocus={() => onBookHover?.(currentBook)}
            aria-label={`Open ${currentBook.title}`}
          >
            <img src={thumbUrl(currentBook.image_url, 400)} alt="" />
          </button>

          <div className="spotlight-details">
            <span className="ui-section-eyebrow">Featured</span>
            <h2 className="spotlight-title">{currentBook.title}</h2>
            {currentBook.author && <p className="spotlight-author">{currentBook.author}</p>}
            {currentBook.tagline && <p className="spotlight-tagline">{currentBook.tagline}</p>}

            {(currentBook.ageGroup || currentBook.readingTime) && (
              <dl className="spotlight-meta">
                {currentBook.ageGroup && (
                  <div>
                    <dt>Age group</dt>
                    <dd>{currentBook.ageGroup}</dd>
                  </div>
                )}
                {currentBook.readingTime && (
                  <div>
                    <dt>Reading time</dt>
                    <dd>{currentBook.readingTime} min</dd>
                  </div>
                )}
              </dl>
            )}

            {currentBook.description && (
              <div className="spotlight-description">
                <p className={isDescriptionExpanded ? 'expanded' : ''}>{currentBook.description}</p>
                <button
                  type="button"
                  className="spotlight-more"
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                >
                  {isDescriptionExpanded ? 'Show less' : 'Show more'}
                </button>
              </div>
            )}

            {currentBook.categories?.length > 0 && (
              <div className="ui-chip-row spotlight-tags">
                {currentBook.categories.slice(0, 4).map((category) => (
                  <span key={category} className="ui-tag">{category}</span>
                ))}
              </div>
            )}

            <div className="spotlight-actions">
              {canRead ? (
                <>
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary ui-btn-lg"
                    onClick={() => navigate(`/books/${currentBook._id}`)}
                  >
                    <BookOpen size={18} />
                    {currentBook.currentPage > 1 ? 'Continue reading' : 'Start reading'}
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-lg"
                    onClick={() => navigate(`/books/${currentBook._id}#characters`)}
                  >
                    <MessageCircle size={18} />
                    Chat with characters
                  </button>
                </>
              ) : user?.email ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-primary ui-btn-lg"
                  onClick={() => handleAddBook(currentBook)}
                >
                  <BookOpen size={18} />
                  Add to library
                </button>
              ) : (
                <button
                  type="button"
                  className="ui-btn ui-btn-primary ui-btn-lg"
                  onClick={() => navigate('/login', { state: { from: window.location.pathname } })}
                >
                  <BookOpen size={18} />
                  Sign in to add
                </button>
              )}
            </div>
          </div>
        </div>

        {books.length > 1 && (
          <div className="spotlight-nav">
            <button type="button" className="ui-icon-btn" onClick={() => handleNavigation('prev')} aria-label="Previous book">
              <ChevronLeft size={18} />
            </button>
            <div className="spotlight-dots">
              {books.map((book, idx) => (
                <button
                  type="button"
                  key={book._id || idx}
                  className={`spotlight-dot ${idx === currentIndex ? 'active' : ''}`}
                  onClick={() => goTo(idx)}
                  aria-label={`Show ${book.title}`}
                />
              ))}
            </div>
            <button type="button" className="ui-icon-btn" onClick={() => handleNavigation('next')} aria-label="Next book">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
