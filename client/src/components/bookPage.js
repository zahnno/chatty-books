import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { catchError, authFetch } from "../utils.js";
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { Book, Users, Clock, ChevronLeft, ChevronRight, Star, MessageCircle, BookOpen, X, Headphones, Check, Share2 } from 'react-feather';
import '../styles/bookPage.css';
import { useAuth } from '../context/AuthContext';
import LazyImage from './LazyImage';
import { useBook, useBookCharacters, useBookPages, useSimilarBooks, useSimilarCharacters, QUERY_KEYS, useCharacterChatPrefetch, useBookPrefetch, useBookAudioProfiles } from '../hooks/useApi';
import { preloadCharacterChat, preloadBookPage } from '../utils/routePrefetch';
import BookListHorizontal from './BookListHorizontal';

import CharacterListHorizontal from './CharacterListHorizontal';
import SectionHeader from './SectionHeader';
import '../styles/shelf.css';
import '../styles/bookDetail.css';
import BookPageSkeleton from './skeletons/BookPageSkeleton';
import { useAudiobookPlayer } from '../context/AudiobookPlayerContext';
import { thumbUrl } from '@talkingbook/shared';

// Share link with a per-book preview card (see server/routes/share.js).
const shareBook = async (book) => {
  const url = `${window.location.origin}/b/${book._id}`;
  const title = book.author ? `${book.title} by ${book.author}` : book.title;
  try {
    if (navigator.share) {
      await navigator.share({ title, text: `Read ${book.title} and talk with its characters on Chatty Books`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch (err) {
    if (err?.name !== 'AbortError') toast.error('Could not share this book');
  }
};

export default function BookPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openPlayer, playProfile, currentBook, isVisible } = useAudiobookPlayer();
  const isThisBookActive = isVisible && currentBook?.bookId === bookId;
  const { data: audioProfiles = [] } = useBookAudioProfiles(bookId);
  const hasAudio = audioProfiles.some(p => p.status === 'completed');
  const bookQuery = useBook(bookId);
  const charactersQuery = useBookCharacters(bookId);
  const pagesQuery = useBookPages(bookId);
  const book = bookQuery.data;
  const characters = charactersQuery.data ?? [];
  const pages = pagesQuery.data ?? [];
  const [generatedImages, setGeneratedImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showImageDetails, setShowImageDetails] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  const audioRef = useRef(null);
  const charactersRef = useRef(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showAudioSignInModal, setShowAudioSignInModal] = useState(false);
  const prefetchCharacterChat = useCharacterChatPrefetch();
  const similarBooksQuery = useSimilarBooks(bookId);
  const similarBooks = similarBooksQuery.data ?? [];
  const similarCharactersQuery = useSimilarCharacters(bookId);
  const similarCharacters = similarCharactersQuery?.data ?? [];
  const prefetchBook = useBookPrefetch();
  const galleryScrollRef = useRef(null);
  const [galleryCanScrollLeft, setGalleryCanScrollLeft] = useState(false);
  const [galleryCanScrollRight, setGalleryCanScrollRight] = useState(false);
  const charsScrollRef = useRef(null);
  const [charsCanScrollLeft, setCharsCanScrollLeft] = useState(false);
  const [charsCanScrollRight, setCharsCanScrollRight] = useState(false);

  const handleGalleryScroll = () => {
    const el = galleryScrollRef.current;
    if (!el) return;
    setGalleryCanScrollLeft(el.scrollLeft > 0);
    setGalleryCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  const scrollGallery = (direction) => {
    galleryScrollRef.current?.scrollBy({ left: direction === 'left' ? -400 : 400, behavior: 'smooth' });
  };

  const handleCharsScroll = () => {
    const el = charsScrollRef.current;
    if (!el) return;
    setCharsCanScrollLeft(el.scrollLeft > 0);
    setCharsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  const scrollChars = (direction) => {
    charsScrollRef.current?.scrollBy({ left: direction === 'left' ? -400 : 400, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = galleryScrollRef.current;
    if (!el) return;
    const update = () => {
      setGalleryCanScrollLeft(el.scrollLeft > 0);
      setGalleryCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
  }, [generatedImages, book]);

  useEffect(() => {
    const el = charsScrollRef.current;
    if (!el) return;
    setCharsCanScrollLeft(el.scrollLeft > 0);
    setCharsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, [characters, book]);

  const onSimilarBookHover = (book) => {
    if (book?._id) {
      preloadBookPage();
      prefetchBook(book._id, book.currentPage || 1);
    }
  };

  // Only show skeleton while book is loading; never show "Loading book..." copy.
  const loading = !book && bookQuery.isLoading;

  const onCharacterChatHover = (characterId) => {
    if (bookId && characterId) {
      preloadCharacterChat();
      prefetchCharacterChat(bookId, characterId);
    }
  };

  useEffect(() => {
    if (!user || !bookId) return;
    let cancelled = false;
    const fetchImages = async () => {
      const [err, data] = await catchError(authFetch({ path: `/book/${bookId}/generated-images` }));
      console.log('Generate media: ', data);
      if (!cancelled && data) setGeneratedImages(data);
      if (err) console.error('Failed to load illustrations');
    };
    fetchImages();
    return () => { cancelled = true; };
  }, [bookId, user]);

  useEffect(() => {
    if (location.hash === '#characters' && charactersRef.current) {
      charactersRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash, loading]);

  const handleClick = () => {
    navigate(`/books/${bookId}/page/${book.currentPage || 1}`);
  };

  const handleAdd = async () => {
    try {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/add`,
        method: 'POST',
      }));
      
      if (data) {
        toast.success(`${book?.title} added to your library`);
        if (data?.book) queryClient.setQueryData(QUERY_KEYS.BOOK(bookId), data.book);
        else queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOK(bookId) });
      }
      if (error) {
        toast.error('Failed to add book to library');
      }
    } catch (err) {
      console.error('Error adding book:', err);
      toast.error('An error occurred while adding the book');
    }
  };

  const handleRemove = async () => {
    const [error, data] = await catchError(authFetch({
      path: `/book/${bookId}/remove`,
      method: 'DELETE',
    }));
    if (data) {
      toast.success(`${book?.title} removed from your library`);
      if (data?.book) queryClient.setQueryData(QUERY_KEYS.BOOK(bookId), data.book);
      else queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOK(bookId) });
    }
    if (error) {
      toast.error('Failed to remove book from library');
    }
  };

  const handleChatClick = (characterId) => {
    navigate(`/books/${bookId}/view/characters/${characterId}`);
  };

  // Handle audio playback
  const handleAudioPlay = (audio) => {
    if (playingAudio?._id === audio._id) {
      // If clicking the same audio that's currently playing
      if (audioRef.current?.paused) {
        audioRef.current.play();
        setPlayingAudio(audio);
      } else {
        audioRef.current.pause();
        setPlayingAudio(null);
      }
    } else {
      // If clicking a different audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingAudio(audio);
      // Create new audio element
      const newAudio = new Audio(audio.audioUrl);
      newAudio.addEventListener('ended', () => setPlayingAudio(null));
      newAudio.play();
      audioRef.current = newAudio;
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return <BookPageSkeleton />;
  }

  if (!book) {
    return (
      <div className="ui-page ui-page-narrow bd-missing">
        <h1 className="ui-page-title">Book not found</h1>
        <p className="ui-page-subtitle">The book you're looking for doesn't exist or has been removed.</p>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigate('/')}>Back to discover</button>
      </div>
    );
  }

  const fullNameOf = (c) => (c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName);
  const roleSummary = Object.entries(characters.reduce((acc, c) => {
    if (c.role) { const k = c.role.trim(); acc[k] = (acc[k] || 0) + 1; }
    return acc;
  }, {})).map(([role, count]) => `${count} ${role}${count !== 1 ? 's' : ''}`).join(' · ');

  return (
    <div className="bd">
      <section className="bd-hero">
        <div className="bd-cover">
          <LazyImage
            src={thumbUrl(book.image_url, 400)}
            alt={`Cover of ${book.title}`}
            skipLazy
          />
        </div>
        <div className="bd-info">
          {book.categories?.length > 0 && (
            <span className="ui-section-eyebrow">{book.categories[0]}</span>
          )}
          <h1 className="bd-title">{book.title}</h1>
          <p className="bd-author">by {book.author || 'Unknown author'}</p>

          <ul className="bd-stats">
            {pages.length > 0 && (
              <li><Book size={14} />{pages.length} pages</li>
            )}
            {characters.length > 0 && (
              <li><Users size={14} />{characters.length} characters</li>
            )}
            {hasAudio && (
              <li><Headphones size={14} />Audiobook</li>
            )}
            {book.currentPage > 1 && (
              <li><Clock size={14} />Last read: page {book.currentPage}</li>
            )}
            {book.featured && (
              <li><Star size={14} />Featured</li>
            )}
          </ul>

          {book.description && (
            <div className="bd-description">
              <p className={isDescriptionExpanded ? 'expanded' : ''}>{book.description}</p>
              {book.description.length > 200 && (
                <button
                  type="button"
                  className="bd-more"
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                >
                  {isDescriptionExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          <div className="bd-actions">
            {(book.isPurchased || book.is_public) ? (
              <>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary ui-btn-lg"
                  onClick={handleClick}
                >
                  <BookOpen size={18} />
                  {book.currentPage > 1 ? 'Continue reading' : 'Start reading'}
                </button>
                {characters.length > 0 && (
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-lg"
                    onClick={() => charactersRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    onMouseEnter={() => characters[0] && onCharacterChatHover(characters[0]._id)}
                    onFocus={() => characters[0] && onCharacterChatHover(characters[0]._id)}
                  >
                    <MessageCircle size={18} />
                    Chat with characters
                  </button>
                )}
                {hasAudio && (
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-lg"
                    onClick={() => {
                      if (!user?.email) { setShowAudioSignInModal(true); return; }
                      const firstProfile = audioProfiles.find(p => p.status === 'completed');
                      if (firstProfile) {
                        playProfile(firstProfile, { bookId, bookTitle: book.title, bookCover: book.image_url }, book.currentPage || null);
                      } else {
                        openPlayer({ bookId, bookTitle: book.title, bookCover: book.image_url });
                      }
                    }}
                  >
                    <Headphones size={18} />
                    {isThisBookActive ? 'Now playing' : 'Listen'}
                  </button>
                )}
                {user?.email && !book.isPurchased && (
                  <button
                    type="button"
                    className="ui-icon-btn bd-save"
                    onClick={handleAdd}
                    aria-label="Add to library"
                    title="Add to library"
                  >
                    <Book size={18} />
                  </button>
                )}
                {book.isPurchased && (
                  <button
                    type="button"
                    className="ui-icon-btn bd-save saved"
                    onClick={handleRemove}
                    aria-label="Saved to library. Click to remove"
                    title="Saved to library"
                  >
                    <Check size={18} />
                  </button>
                )}
                {book.is_public && (
                  <button
                    type="button"
                    className="ui-icon-btn bd-save"
                    onClick={() => shareBook(book)}
                    aria-label="Share this book"
                    title="Share"
                  >
                    <Share2 size={18} />
                  </button>
                )}
              </>
            ) : user?.email ? (
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-lg"
                onClick={handleAdd}
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
                Sign in to read
              </button>
            )}
          </div>

          {book.categories?.length > 1 && (
            <div className="ui-chip-row bd-tags">
              {book.categories.map((category) => (
                <span key={category} className="ui-tag">{category}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {characters.length > 0 && (
        <section className="bd-section" ref={charactersRef}>
          <div className="shelf-header">
            <SectionHeader
              eyebrow="Characters"
              title="Meet the characters"
              subtitle={roleSummary || `${characters.length} characters in ${book.title}`}
            />
            {(charsCanScrollLeft || charsCanScrollRight) && (
              <div className="shelf-controls">
                <button type="button" className="ui-icon-btn" onClick={() => scrollChars('left')} disabled={!charsCanScrollLeft} aria-label="Scroll left">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="ui-icon-btn" onClick={() => scrollChars('right')} disabled={!charsCanScrollRight} aria-label="Scroll right">
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
          <div
            className="shelf-row bd-characters"
            ref={charsScrollRef}
            onScroll={handleCharsScroll}
          >
            {characters.map((character) => (
              <article
                key={character._id}
                className="bd-character"
                onMouseEnter={() => onCharacterChatHover(character._id)}
              >
                <button
                  type="button"
                  className="bd-character-portrait"
                  onClick={() => setSelectedCharacter(character)}
                  aria-label={`About ${fullNameOf(character)}`}
                >
                  <LazyImage src={thumbUrl(character.image_url, 200)} alt="" />
                  {character.role && <span className="bd-character-role">{character.role}</span>}
                </button>
                <div className="bd-character-body">
                  <h3 className="bd-character-name" title={fullNameOf(character)}>{fullNameOf(character)}</h3>
                  {character.description && (
                    <p className="bd-character-description">{character.description}</p>
                  )}
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-sm bd-character-chat"
                    onClick={() => handleChatClick(character._id)}
                    onFocus={() => onCharacterChatHover(character._id)}
                  >
                    <MessageCircle size={14} />
                    Chat
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {generatedImages.length > 0 && (
        <section className="bd-section">
          <div className="shelf-header">
            <SectionHeader
              eyebrow="Community"
              title="Reader illustrations"
              subtitle={`Scenes from ${book.title}, imagined by readers.`}
            />
            {(galleryCanScrollLeft || galleryCanScrollRight) && (
              <div className="shelf-controls">
                <button type="button" className="ui-icon-btn" onClick={() => scrollGallery('left')} disabled={!galleryCanScrollLeft} aria-label="Scroll left">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="ui-icon-btn" onClick={() => scrollGallery('right')} disabled={!galleryCanScrollRight} aria-label="Scroll right">
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
          <div
            className="shelf-row"
            ref={galleryScrollRef}
            onScroll={handleGalleryScroll}
          >
            {generatedImages.map((image, index) => (
              <button
                type="button"
                key={image._id || index}
                className="bd-scene"
                onClick={() => setSelectedImage(image)}
              >
                <span className="bd-scene-media">
                  {image.mediaType === 'video' && image.videoUrl ? (
                    <video src={image.videoUrl} autoPlay loop muted playsInline />
                  ) : (
                    <LazyImage src={thumbUrl(image.imageUrl, 200)} alt="" />
                  )}
                </span>
                <span className="bd-scene-page">Page {image.pageNumber}</span>
                {image.paragraphText && (
                  <span className="bd-scene-text">{image.paragraphText}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {similarBooks.length > 0 && (
        <section className="bd-section">
          <BookListHorizontal
            eyebrow="Keep reading"
            title="You might also like"
            subtitle={book.categories?.length > 0
              ? `More ${book.categories[0]} in the same spirit as ${book.title}.`
              : undefined}
            books={similarBooks}
            handleClick={(id) => navigate(`/books/${id}`)}
            handleAction={(id, currentPage) => navigate(`/books/${id}/page/${currentPage}`)}
            onBookHover={onSimilarBookHover}
          />
        </section>
      )}

      {similarCharacters.length > 0 && (
        <section className="bd-section">
          <CharacterListHorizontal
            eyebrow="Discover"
            title="Characters from similar stories"
            characters={similarCharacters}
          />
        </section>
      )}

      {selectedCharacter && (
        <div className="book-page-character-modal-overlay" onClick={() => setSelectedCharacter(null)}>
          <div className="book-page-character-modal" onClick={e => e.stopPropagation()}>
            <button className="book-page-character-modal-close" onClick={() => setSelectedCharacter(null)}>
              <X size={24} />
            </button>
              <div className="book-page-character-modal-content">
                <div className="book-page-character-modal-sidebar">
                  <LazyImage
                    src={thumbUrl(selectedCharacter.image_url, 400)}
                    alt={selectedCharacter.lastName ? `${selectedCharacter.firstName} ${selectedCharacter.lastName}` : selectedCharacter.firstName}
                    className="book-page-character-modal-image"
                  />
                  <div className="book-page-character-modal-info">
                    <h2>{selectedCharacter.lastName ? `${selectedCharacter.firstName} ${selectedCharacter.lastName}` : selectedCharacter.firstName}</h2>
                    <div className="book-page-character-modal-basic-info">
                      {selectedCharacter.gender && (
                        <span className="book-page-character-modal-badge">{selectedCharacter.gender}</span>
                      )}
                      {selectedCharacter.race && (
                        <span className="book-page-character-modal-badge">{selectedCharacter.race}</span>
                      )}
                      {selectedCharacter.role && (
                        <span className="book-page-character-modal-badge">{selectedCharacter.role}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="book-page-character-modal-main">
                  <div className="book-page-character-modal-details">
                    <div className="book-page-character-modal-details-grid">
                {selectedCharacter.description && (
                  <div className="book-page-character-modal-detail-section">
                    <h3>Description</h3>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{selectedCharacter.description}</p>
                  </div>
                )}
                
                {selectedCharacter.appearance && (
                  <div className="book-page-character-modal-detail-section">
                    <h3>Appearance</h3>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{selectedCharacter.appearance}</p>
                  </div>
                )}
                
                {selectedCharacter.personalityTraits?.length > 0 && (
                  <div className="book-page-character-modal-detail-section">
                    <h3>Personality Traits</h3>
                    <ul>
                      {selectedCharacter.personalityTraits.map((trait, index) => (
                        <li key={index}>{trait}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedCharacter.strengths?.length > 0 && (
                  <div className="book-page-character-modal-detail-section">
                    <h3>Strengths</h3>
                    <ul>
                      {selectedCharacter.strengths.map((strength, index) => (
                        <li key={index}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedCharacter.weaknesses?.length > 0 && (
                  <div className="book-page-character-modal-detail-section">
                    <h3>Weaknesses</h3>
                    <ul>
                      {selectedCharacter.weaknesses.map((weakness, index) => (
                        <li key={index}>{weakness}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedCharacter.goals?.length > 0 && (
                  <div className="book-page-character-modal-detail-section">
                    <h3>Goals</h3>
                    <ul>
                      {selectedCharacter.goals.map((goal, index) => (
                        <li key={index}>{goal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                    </div>
                  </div>
                  
                  <button 
                    className="book-page-character-modal-chat-button"
                    onClick={() => {
                      handleChatClick(selectedCharacter._id);
                      setSelectedCharacter(null);
                    }}
                    onMouseEnter={() => onCharacterChatHover(selectedCharacter._id)}
                    onFocus={() => onCharacterChatHover(selectedCharacter._id)}
                  >
                    <MessageCircle size={20} />
                    Start Chatting
                  </button>
                </div>
              </div>
            </div>
          </div>
      )}

      {showAudioSignInModal && (
        <div className="book-page-character-modal-overlay" onClick={() => setShowAudioSignInModal(false)}>
          <div className="book-page-character-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <button className="book-page-character-modal-close" onClick={() => setShowAudioSignInModal(false)}>
              <X size={24} />
            </button>
            <div className="book-page-character-modal-content" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
              <Headphones size={40} style={{ marginBottom: '1rem', color: 'var(--accent-color)' }} />
              <h2 style={{ marginBottom: '0.5rem' }}>Sign in to listen</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Create a free account to listen to the audiobook of <em>{book.title}</em>.
              </p>
              <button
                onClick={() => navigate('/login', { state: { from: window.location.pathname } })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600,
                  background: 'var(--accent-color)', color: '#fff',
                  border: 'none', borderRadius: '10px', cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(var(--accent-rgb),0.35)',
                }}
              >
                <BookOpen size={16} />
                <span>Sign In</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="book-page-image-modal-overlay" onClick={() => {
          setSelectedImage(null);
          setShowImageDetails(false);
        }}>
          <div className="book-page-image-modal" onClick={e => e.stopPropagation()}>
            <button 
              className="book-page-image-modal-close" 
              onClick={() => {
                setSelectedImage(null);
                setShowImageDetails(false);
              }}
            >
              <X size={24} />
            </button>
            
            <button 
              className="book-page-image-modal-info-toggle"
              onClick={() => setShowImageDetails(!showImageDetails)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z" fill="none" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="19" r="1.5"/>
                <path d="M12 6v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>

            <div className="book-page-image-modal-content">
              {selectedImage.mediaType === 'video' && selectedImage.videoUrl ? (
                <video
                  src={selectedImage.videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="book-page-image-modal-img"
                  style={{ background: '#000' }}
                />
              ) : (
                <LazyImage
                  src={selectedImage.imageUrl}
                  alt="Generated scene"
                  className="book-page-image-modal-img"
                />
              )}
              
              <div className={`book-page-image-modal-overlay-details ${showImageDetails ? 'visible' : ''}`}>
                <div className="book-page-image-modal-details-content">
                  <div 
                    className="book-page-image-modal-page-label" 
                    onClick={() => navigate(`/books/${bookId}/page/${selectedImage.pageNumber}`)}
                  >
                    Page {selectedImage.pageNumber}
                  </div>
                  <p className="book-page-image-modal-caption">{selectedImage.paragraphText}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
