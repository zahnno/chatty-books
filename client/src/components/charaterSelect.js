import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { catchError, authFetch } from '../utils.js';
import BookHeader from './bookHeader.js';
import CharacterListSkeleton from './skeletons/CharacterListSkeleton';
import '../styles/characters.css';
import { thumbUrl } from '@talkingbook/shared';

export default function CharacterSelect() {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [book, setBook] = useState(null);

  useEffect(() => {
    const fetchBook = async () => {
      const [error, data] = await catchError(authFetch({
          path: `/book/${bookId}`,
          method: 'GET'
      }))
      if (error) console.error('Error fetching books:', error);
      if (data) setBook(data);
    };

    fetchBook();
    const fetchCharacters = async () => {
      setLoading(true)
      const [error, data] = await catchError(authFetch({path: `/book/${bookId}/characters`, requireAuth: false}));
      if (data) setCharacters(data);
      if (error) console.error('Error fetching books:', error);
      setLoading(false)
    };

    fetchCharacters();
  }, []);


  const handleClick = (characterId) => {
    navigate(`/books/${bookId}/view/characters/${characterId}`)
  }

  return (
    <>
      <BookHeader book={book} />
      <div className="ui-page">
        <header className="characters-header">
          <span className="ui-section-eyebrow">Characters</span>
          <h1 className="ui-page-title">Who would you like to talk to?</h1>
          {book?.title && <p className="ui-page-subtitle">Choose someone from {book.title} to start a conversation.</p>}
        </header>
        {loading ? (
          <CharacterListSkeleton />
        ) : characters.length > 0 ? (
          <div className="characters-grid">
            {characters.map((character) => {
              const name = [character.firstName, character.lastName].filter(Boolean).join(' ');
              return (
                <button
                  type="button"
                  key={character._id}
                  className="characters-card"
                  onClick={() => handleClick(character._id)}
                >
                  <span className="characters-portrait">
                    <img src={thumbUrl(character.image_url, 200)} alt="" loading="lazy" />
                  </span>
                  <span className="characters-name">{name}</span>
                  {character.role && <span className="characters-book">{character.role}</span>}
                  {character.description && (
                    <span className="characters-description">{character.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="characters-empty">
            <h2>No characters yet</h2>
            <p>This book doesn't have any characters to talk to yet.</p>
          </div>
        )}
      </div>
    </>
  );
};
