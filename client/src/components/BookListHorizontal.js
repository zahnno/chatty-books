import React, { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from 'react-feather';
import SectionHeader from './SectionHeader';
import '../styles/shelf.css';
import { thumbUrl } from '@talkingbook/shared';

// A horizontally scrolling row of book covers with arrow controls on desktop.
export default function BookListHorizontal({ books, title, subtitle, eyebrow, actionLabel, actionTo, handleClick, handleAction, onBookHover }) {
  const scrollContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollIndicators = () => {
    const container = scrollContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
    }
  };

  useEffect(() => {
    checkScrollIndicators();
    window.addEventListener('resize', checkScrollIndicators);
    return () => window.removeEventListener('resize', checkScrollIndicators);
  }, [books]);

  const scroll = (direction) => {
    const container = scrollContainerRef.current;
    if (container) {
      const amount = container.clientWidth * 0.8;
      container.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  if (!books?.length) return null;

  return (
    <div className="shelf">
      <div className="shelf-header">
        {title && (
          <SectionHeader
            eyebrow={eyebrow}
            title={title}
            subtitle={subtitle}
            actionLabel={actionLabel}
            actionTo={actionTo}
          />
        )}
        {(canScrollLeft || canScrollRight) && (
          <div className="shelf-controls">
            <button type="button" className="ui-icon-btn" onClick={() => scroll('left')} disabled={!canScrollLeft} aria-label="Scroll left">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="ui-icon-btn" onClick={() => scroll('right')} disabled={!canScrollRight} aria-label="Scroll right">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
      <div
        className="shelf-row"
        ref={scrollContainerRef}
        onScroll={checkScrollIndicators}
      >
        {books.map((book, index) => (
          <div key={book._id || index} className="shelf-item">
            <button
              type="button"
              className="shelf-book"
              onClick={() => handleClick(book._id)}
              onMouseEnter={() => onBookHover?.(book)}
              onFocus={() => onBookHover?.(book)}
            >
              <span className="shelf-cover">
                <img src={thumbUrl(book.image_url, 200)} alt={`Cover of ${book.title}`} loading="lazy" />
              </span>
              <span className="shelf-title">{book.title}</span>
              {book.author && <span className="shelf-author">{book.author}</span>}
            </button>
            {handleAction && book.currentPage > 1 && (
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm shelf-continue"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(book._id, book.currentPage);
                }}
              >
                Continue reading
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
