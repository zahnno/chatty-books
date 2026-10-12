import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'react-feather';
import CharacterModal from './CharacterModal';
import { useTheme } from '../context/ThemeContext';
import { thumbUrl } from '@talkingbook/shared';

export default function TopCharacters({ characters }) {
  const scrollContainerRef = useRef(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const { isDarkMode } = useTheme();

  const handleCharacterClick = (character) => {
    setSelectedCharacter(character);
  };

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -400 : 400;
      scrollContainerRef.current.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="top-characters-section">
      <div className="top-characters-header">
        <div className="top-characters-header">
          <h2>Popular Characters</h2>
        </div>
        {/* <p className="top-characters-description">
          Dive into meaningful conversations with literary figures. Each character brings their unique perspective and story to life through interactive dialogue.
        </p> */}
      </div>
      
      <div className="top-characters-scroll-container">
        <button 
          className="top-characters-scroll-button top-characters-scroll-left" 
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="top-characters-grid" ref={scrollContainerRef}>
          {characters.map((character) => (
            <div 
              key={character._id} 
              className="top-character-card"
              onClick={() => handleCharacterClick(character)}
            >
              <div className="top-character-image-container">
                {character.image_url ? (
                  <img 
                    src={thumbUrl(character.image_url, 200)} 
                    alt={`${character.firstName} ${character.lastName}`}
                    className="top-character-image"
                  />
                ) : (
                  <div className="top-character-placeholder">
                    <span className="top-character-initials">
                      {character.firstName[0]}{character.lastName[0]}
                    </span>
                  </div>
                )}
                
                <div className="top-character-overlay">
                  <div className="top-character-info">
                    <h3 className="top-character-name">
                      {character.firstName} {character.lastName}
                    </h3>
                    <p className="top-character-book">{character.bookTitle}</p>
                  </div>
                  
                  <div className="top-character-description-overlay">
                    <p className="top-character-description">{character.description}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {/* View More Card */}
          <Link to="/characters" className="top-character-card view-more-card">
            <div className="view-more-content">
              <div className="view-more-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="view-more-title">View All Characters</h3>
              <p className="view-more-subtitle">Discover more literary companions</p>
            </div>
          </Link>
        </div>

        <button 
          className="top-characters-scroll-button top-characters-scroll-right" 
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          <ChevronRight size={24} />
        </button>
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