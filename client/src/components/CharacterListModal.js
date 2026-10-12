import React from 'react';
import { X } from 'react-feather';
import { thumbUrl } from '@talkingbook/shared';

export default function CharacterListModal({ characters, isDarkMode, onClose, onCharacterClick }) {
  return (
    <>
      <div className="overlay visible" onClick={onClose} />
      <div className={`character-list-modal ${isDarkMode ? 'dark-mode' : ''}`}>
        <button
          className={`character-list-close ${isDarkMode ? 'dark-mode' : ''}`}
          onClick={onClose}
        >
          <X size={24} />
        </button>
        <h2>Characters</h2>
        <div className="character-list-grid">
          {characters && characters
            .sort((a, b) => {
              if (a.presentInCurrentPage && !b.presentInCurrentPage) return -1;
              if (!a.presentInCurrentPage && b.presentInCurrentPage) return 1;
              if (a.presentInPreviousPage && !b.presentInPreviousPage) return -1;
              if (!a.presentInPreviousPage && b.presentInPreviousPage) return 1;
              return 0;
            })
            .map((character, index) => (
              <div
                key={index}
                className={`character-card ${isDarkMode ? 'dark-mode' : ''} ${
                  character.presentInCurrentPage ? 'present-current' :
                  character.presentInPreviousPage ? 'present-previous' : ''
                }`}
                onClick={() => onCharacterClick(
                  character._id,
                  character.presentInCurrentPage,
                  character.presentInPreviousPage
                )}
              >
                <img
                  className="character-image"
                  src={thumbUrl(character.image_url, 200)}
                  alt={`${character.firstName} ${character.lastName}`}
                />
                <div className="character-card-info">
                  <h3>{character.firstName} {character.lastName}</h3>
                  {(character.presentInCurrentPage || character.presentInPreviousPage) ? (
                    <>
                      <div className="character-presence">
                        {character.presentInCurrentPage ? 'Present on this page' : 'Present on previous page'}
                      </div>
                      <div className="character-context-hint">
                        Will respond with knowledge of current page events
                      </div>
                    </>
                  ) : (
                    <div className="character-context-hint inactive">
                      Will respond with their general story knowledge
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
