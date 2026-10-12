import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'react-feather';
import SectionHeader from './SectionHeader';
import { thumbUrl } from '@talkingbook/shared';

export default function ChatWithCharactersSection({ characters = [] }) {
  const navigate = useNavigate();

  // Shuffle and pick up to 6 characters
  const displayCharacters = useMemo(() => {
    if (!characters.length) return [];
    const shuffled = [...characters].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 6);
  }, [characters]);

  const handleCharacterClick = (character) => {
    const bookId = character.bookId?._id || character.bookId;
    if (bookId && character._id) {
      navigate(`/books/${bookId}/view/characters/${character._id}`);
    }
  };

  if (!displayCharacters.length) return null;

  return (
    <section className="home-section">
      <SectionHeader
        eyebrow="Characters"
        title="Talk to the people in the story"
        subtitle="Ask Elizabeth what she really thinks of Darcy, or get Sherlock's read on a case. Every character remembers their book."
        actionLabel="All characters"
        actionTo="/characters"
      />
      <div className="home-characters-grid">
        {displayCharacters.map((character) => {
          const name = [character.firstName, character.lastName].filter(Boolean).join(' ');
          const bookTitle = character.bookTitle || character.bookId?.title || '';

          return (
            <button
              type="button"
              key={character._id}
              className="home-character"
              onClick={() => handleCharacterClick(character)}
            >
              <span className="home-character-portrait">
                <img src={thumbUrl(character.image_url, 200)} alt="" loading="lazy" />
                <span className="home-character-chat">
                  <MessageCircle size={14} />
                  Chat
                </span>
              </span>
              <span className="home-character-name">{name}</span>
              {bookTitle && <span className="home-character-book">{bookTitle}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
