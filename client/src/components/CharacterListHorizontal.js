import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'react-feather';
import CharacterModal from './CharacterModal';
import SectionHeader from './SectionHeader';
import { useTheme } from '../context/ThemeContext';
import '../styles/shelf.css';
import { thumbUrl } from '@talkingbook/shared';

export default function CharacterListHorizontal({ characters, title, subtitle, eyebrow }) {
  const scrollContainerRef = useRef(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const { isDarkMode } = useTheme();

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
  }, [characters]);

  const scroll = (direction) => {
    const container = scrollContainerRef.current;
    if (container) {
      const amount = container.clientWidth * 0.8;
      container.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  if (!characters?.length) return null;

  return (
    <div className="shelf">
      <div className="shelf-header">
        <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
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
        {characters.map((character) => {
          const fullName = [character.firstName, character.lastName].filter(Boolean).join(' ') || 'Character';
          return (
            <button
              type="button"
              key={character._id}
              className="shelf-character"
              onClick={() => setSelectedCharacter(character)}
            >
              <span className="shelf-portrait">
                {character.image_url ? (
                  <img src={thumbUrl(character.image_url, 200)} alt="" loading="lazy" />
                ) : (
                  <span className="shelf-initials">
                    {(character.firstName?.[0] || '')}{(character.lastName?.[0] || '')}
                  </span>
                )}
              </span>
              <span className="shelf-title">{fullName}</span>
              {character.bookTitle && <span className="shelf-author">{character.bookTitle}</span>}
            </button>
          );
        })}
      </div>
      {selectedCharacter && (
        <CharacterModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}
