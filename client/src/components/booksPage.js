import React, { useMemo, useState }  from "react";
import { useNavigate, NavLink } from 'react-router-dom';
import BookListHorizontal from './BookListHorizontal.js';
import { Book, LogIn, Search, MessageCircle, X, Heart, Award, Target } from 'react-feather';
import { useUserBooks, useUserCharacters } from '../hooks/useApi';
import '../styles/booksPage.css';
import '../styles/shelf.css';
import '../styles/library.css';
import SectionHeader from './SectionHeader';
import { useAuth } from '../context/AuthContext';
import BooksPageSkeleton from './skeletons/BooksPageSkeleton';
import { useBookPrefetch } from '../hooks/useApi';
import { preloadBookPage } from '../utils/routePrefetch';
import { thumbUrl } from '@talkingbook/shared';

export default function BooksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const prefetchBook = useBookPrefetch();
  const onBookHoverCb = (book) => {
    preloadBookPage();
    prefetchBook(book._id, book.currentPage || 1);
  };
  
  // Use React Query hooks for cached data - but they should skip if no user
  const { data: userBooksData, isLoading: booksLoading, error: booksError } = useUserBooks();
  const { data: userCharactersData, isLoading: charactersLoading, error: charactersError } = useUserCharacters();
  
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [characterSearchQuery, setCharacterSearchQuery] = useState('');

  // Extract books from the API response
  const books = userBooksData?.books || [];
  // Show content when we have cached data; full-page spinner only when no data at all.
  const hasCachedData = userBooksData !== undefined || userCharactersData !== undefined;
  const loading = booksLoading || charactersLoading;
  const showFullPageLoading = !hasCachedData && loading;

  // Process characters data with memoization
  const characters = useMemo(() => {
    if (!userCharactersData || !books.length) return [];
    
    const purchasedBookIds = books.map(book => book._id);
    return userCharactersData.filter(char => 
      purchasedBookIds.includes(char.bookId._id)
    );
  }, [userCharactersData, books]);

  const handleBookClick = (id) => {
    navigate(`/books/${id}`);
  }

  const handleContinueReading = (id, currentPage) => {
    navigate(`/books/${id}/page/${currentPage}`);
  }

  const handleCharacterClick = (character) => {
    setSelectedCharacter(character);
    setShowCharacterModal(true);
  }

  const handleStartChat = (characterId, bookId) => {
    navigate(`/books/${bookId._id}/view/characters/${characterId}`);
  }

  // Handle errors from React Query
  React.useEffect(() => {
    if (booksError) {
      console.error('Error fetching books:', booksError);
      console.error('Failed to load your books');
    }
    if (charactersError) {
      console.error('Error fetching characters:', charactersError);
      console.error('Failed to load characters');
    }
  }, [booksError, charactersError]);

  // Memoize expensive computations for performance
  const booksInProgress = useMemo(() => {
    return books.filter(book => book.currentPage > 1)
      .sort((a, b) => new Date(b.lastReadAt) - new Date(a.lastReadAt));
  }, [books]);

  const filteredBooks = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return books.filter(book => (
      book.title.toLowerCase().includes(searchLower) ||
      book.author.toLowerCase().includes(searchLower) ||
      book.description.toLowerCase().includes(searchLower)
    ));
  }, [books, searchQuery]);

  const filteredCharacters = useMemo(() => {
    const searchLower = characterSearchQuery.toLowerCase();
    return characters.filter(character => (
      `${character.firstName} ${character.lastName}`.toLowerCase().includes(searchLower) ||
      character.personalityTraits?.some(trait => trait.toLowerCase().includes(searchLower)) ||
      character.strengths?.some(strength => strength.toLowerCase().includes(searchLower)) ||
      character.goals?.some(goal => goal.toLowerCase().includes(searchLower)) ||
      character.bookTitle.toLowerCase().includes(searchLower)
    ));
  }, [characters, characterSearchQuery]);

  const charactersByBook = useMemo(() => {
    return filteredCharacters.reduce((acc, character) => {
      if (!acc[character.bookId._id]) {
        acc[character.bookId._id] = {
          bookId: character.bookId._id,
          bookTitle: character.bookTitle,
          characters: []
        };
      }
      acc[character.bookId._id].characters.push(character);
      return acc;
    }, {});
  }, [filteredCharacters]);

  const renderEmptyState = () => {
    if (!user) {
      return (
        <div className="library-empty">
          <span className="ui-section-eyebrow">Library</span>
          <h1 className="ui-page-title">Your books, all in one place</h1>
          <p className="ui-page-subtitle">
            Sign in to keep track of what you're reading, pick up where you left off, and
            return to the characters you've been talking to.
          </p>
          <div className="library-empty-actions">
            <NavLink to="/login" className="ui-btn ui-btn-primary ui-btn-lg">
              <LogIn size={18} />
              Sign in
            </NavLink>
            <NavLink to="/" className="ui-btn ui-btn-secondary ui-btn-lg">
              Browse books
            </NavLink>
          </div>
        </div>
      );
    }

    return (
      <div className="library-empty">
        <Book size={40} className="library-empty-icon" />
        <h2 className="ui-section-title">Your library is empty</h2>
        <p className="ui-section-subtitle">Add a book from the collection and it will show up here.</p>
        <div className="library-empty-actions">
          <NavLink to="/" className="ui-btn ui-btn-primary">
            Discover books
          </NavLink>
        </div>
      </div>
    );
  };

  const renderCharacterModal = () => {
    if (!selectedCharacter || !showCharacterModal) return null;

    return (
      <>
        <div className="books-page__modal-overlay" onClick={() => setShowCharacterModal(false)} />
        <div className="books-page__character-modal">
          <button 
            className="books-page__modal-close"
            onClick={() => setShowCharacterModal(false)}
          >
            <X size={24} />
          </button>

          <div className="books-page__modal-header">
            <div className="books-page__modal-image">
              <img src={thumbUrl(selectedCharacter.image_url, 400)} alt={`${selectedCharacter.firstName} ${selectedCharacter.lastName}`} />
            </div>
            <div className="books-page__modal-title">
              <h2>{`${selectedCharacter.firstName} ${selectedCharacter.lastName}`}</h2>
              <p>{selectedCharacter.bookTitle}</p>
            </div>
          </div>

          <div className="books-page__modal-content">
            {selectedCharacter.description && (
              <div className="books-page__modal-section">
                <h3>About</h3>
                <p>{selectedCharacter.description}</p>
              </div>
            )}

            {selectedCharacter.personalityTraits?.length > 0 && (
              <div className="books-page__modal-section">
                <h3>Personality</h3>
                <div className="books-page__modal-tags">
                  {selectedCharacter.personalityTraits.map((trait, index) => (
                    <span key={index} className="books-page__modal-tag">
                      <Heart size={14} />
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedCharacter.strengths?.length > 0 && (
              <div className="books-page__modal-section">
                <h3>Strengths</h3>
                <div className="books-page__modal-tags">
                  {selectedCharacter.strengths.map((strength, index) => (
                    <span key={index} className="books-page__modal-tag">
                      <Award size={14} />
                      {strength}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedCharacter.goals?.length > 0 && (
              <div className="books-page__modal-section">
                <h3>Goals</h3>
                <div className="books-page__modal-tags">
                  {selectedCharacter.goals.map((goal, index) => (
                    <span key={index} className="books-page__modal-tag">
                      <Target size={14} />
                      {goal}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="books-page__modal-stats">
              <span>
                <MessageCircle size={16} />
                {selectedCharacter.messageCount} messages exchanged
              </span>
            </div>

            <button 
              className="books-page__modal-chat-button"
              onClick={() => handleStartChat(selectedCharacter._id, selectedCharacter.bookId)}
            >
              <MessageCircle size={20} />
              Start chatting
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderCharacterSection = () => {
    if (!characters.length) return null;

    return (
      <section className="library-section">
        <div className="library-section-head">
          <SectionHeader
            eyebrow="Characters"
            title="Your characters"
            subtitle="Everyone from your books, ready to pick up the conversation."
          />
          <div className="ui-search library-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search characters"
              aria-label="Search characters"
              value={characterSearchQuery}
              onChange={(e) => setCharacterSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="library-character-groups">
          {Object.entries(charactersByBook).map(([bookId, bookData]) => (
            <div key={bookId} className="library-character-group">
              <button
                type="button"
                className="library-character-book"
                onClick={() => handleBookClick(bookData.bookId)}
              >
                {bookData.bookTitle}
              </button>
              <div className="library-character-list">
                {bookData.characters.map(character => (
                  <button
                    type="button"
                    key={character._id}
                    className="library-character"
                    onClick={() => handleCharacterClick(character)}
                  >
                    <img src={thumbUrl(character.image_url, 200)} alt="" loading="lazy" />
                    <span className="library-character-text">
                      <span className="library-character-name">{`${character.firstName} ${character.lastName || ''}`.trim()}</span>
                      <span className="library-character-meta">
                        <MessageCircle size={12} />
                        {character.messageCount || 0} messages
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {renderCharacterModal()}
      </section>
    );
  };

  const renderHeroSection = () => {
    if (!user || !books.length) return null;

    const booksStarted = books.filter(book => book.currentPage > 1).length;

    return (
      <header className="library-header">
        <span className="ui-section-eyebrow">Library</span>
        <h1 className="ui-page-title">Welcome back{user.username ? `, ${user.username}` : ''}</h1>
        <dl className="library-stats">
          <div>
            <dt>Books</dt>
            <dd>{books.length}</dd>
          </div>
          <div>
            <dt>In progress</dt>
            <dd>{booksStarted}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd>{characters.length}</dd>
          </div>
        </dl>
      </header>
    );
  };

  return (
    <div className="ui-page library">
      {!user ? (
        renderEmptyState()
      ) : showFullPageLoading ? (
        <BooksPageSkeleton />
      ) : (
        <>
          {renderHeroSection()}

          {booksInProgress.length > 0 && (
            <section className="library-section">
              <BookListHorizontal
                eyebrow="Pick up where you left off"
                title="Continue reading"
                books={booksInProgress}
                handleClick={handleBookClick}
                handleAction={handleContinueReading}
                onBookHover={onBookHoverCb}
              />
            </section>
          )}

          {books?.length > 0 && (
            <section className="library-section">
              <div className="library-section-head">
                <SectionHeader eyebrow="Collection" title="My books" />
                <div className="ui-search library-search">
                  <Search size={16} />
                  <input
                    type="search"
                    placeholder="Search your library"
                    aria-label="Search your library"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              {filteredBooks.length > 0 ? (
                <div className="shelf-grid">
                  {filteredBooks.map((book) => (
                    <div key={book._id} className="shelf-item">
                      <button
                        type="button"
                        className="shelf-book"
                        onClick={() => handleBookClick(book._id)}
                        onMouseEnter={() => onBookHoverCb(book)}
                        onFocus={() => onBookHoverCb(book)}
                      >
                        <span className="shelf-cover">
                          <img src={thumbUrl(book.image_url, 200)} alt={`Cover of ${book.title}`} loading="lazy" />
                        </span>
                        <span className="shelf-title">{book.title}</span>
                        {book.author && <span className="shelf-author">{book.author}</span>}
                      </button>
                      {book.currentPage > 1 && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-secondary ui-btn-sm shelf-continue"
                          onClick={() => handleContinueReading(book._id, book.currentPage)}
                        >
                          Continue reading
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="library-no-results">No books match "{searchQuery}".</p>
              )}
            </section>
          )}

          {renderCharacterSection()}

          {books?.length === 0 && renderEmptyState()}
        </>
      )}
    </div>
  );
}
