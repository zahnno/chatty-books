import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Image as ImageIcon, X, Menu } from 'react-feather';
import { authFetch, catchError } from '../utils.js';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useBookPageData, usePrefetchBookPage } from '../hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import LoginModal from './LoginModal';
import UsageExhaustedModal from './UsageExhaustedModal';
import Navbar from './navbar';
import ParagraphModal from './ParagraphModal';
import PageGalleryModal from './PageGalleryModal';
import CharacterListModal from './CharacterListModal';
import MiniCharacterChat from './MiniCharacterChat';
import ReaderMenu from './ReaderMenu';
import HorizontalReader from './HorizontalReader';
import VerticalReader from './VerticalReader';
import useBookReaderNavigation from '../hooks/useBookReaderNavigation';
import useVerticalScroll from '../hooks/useVerticalScroll';
import BookReaderSkeleton from './skeletons/BookReaderSkeleton';
import { thumbUrl } from '@talkingbook/shared';

export default function BookReader() {
  const navigate = useNavigate();
  const { bookId, pageNumber } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { book, page, characters, isInitialLoading, isFetching, error } = useBookPageData(bookId, pageNumber);
  const { prefetchNextPage, prefetchPreviousPage } = usePrefetchBookPage();
  const { user, loading: authLoading } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  // UI state
  const [fontSize, setFontSize] = useState(18);
  const [showCharacters, setShowCharacters] = useState(false);
  const [isAIMode] = useState(true);
  const [showCharacterBubbles] = useState(true);
  const [cleanReadingMode, setCleanReadingMode] = useState(false);
  const [generatedImages, setGeneratedImages] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);
  const [generatingImage, setGeneratingImage] = useState(null);
  const [showGallery, setShowGallery] = useState(false);
  const [allGeneratedImages, setAllGeneratedImages] = useState([]);
  const [showParagraphModal, setShowParagraphModal] = useState(false);
  const [selectedParagraph, setSelectedParagraph] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUsageExhaustedModal, setShowUsageExhaustedModal] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [readingMode, setReadingMode] = useState('horizontal');
  const [openMiniChats, setOpenMiniChats] = useState([]);

  // Show book content as soon as page data is ready; do not block on auth (progress/menu adapt when auth resolves).
  const loading = isInitialLoading;

  // Shared ref for vertical scroll page elements
  const pageRefs = useRef({});

  // updateReadingProgress lives here so both hooks can use it
  const updateReadingProgress = async (newPage) => {
    try {
      await authFetch({
        path: `/book/${bookId}/progress`,
        method: 'POST',
        body: { pageNumber: newPage },
        requireAuth: false
      });
    } catch (err) {
      console.error('Error updating reading progress:', err);
    }
  };

  // Navigation hook
  const {
    handleSwipeNavigation,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleMouseLeave,
    handleNextClick,
    handleBackClick,
    isTransitioning,
    showSwipeInstructions,
  } = useBookReaderNavigation({
    bookId,
    pageNumber,
    navigate,
    user,
    readingMode,
    pageRefs,
    setShowLoginModal,
    page,
    updateReadingProgress,
  });

  // Vertical scroll hook
  const {
    loadedPages,
    scrollContainerRef,
    isUpdatingUrlFromScroll,
    loadMoreSentinelRef,
    resetForHorizontalMode,
  } = useVerticalScroll({
    bookId,
    pageNumber,
    readingMode,
    navigate,
    user,
    queryClient,
    setShowLoginModal,
    updateReadingProgress,
    pageRefs,
  });

  // Load preferences from localStorage
  useEffect(() => {
    const savedFontSize = localStorage.getItem('bookReaderFontSize');
    const savedCleanMode = localStorage.getItem('bookReaderCleanMode');
    const savedReadingMode = localStorage.getItem('bookReaderReadingMode');

    if (savedFontSize) setFontSize(JSON.parse(savedFontSize));
    if (savedCleanMode !== null) setCleanReadingMode(JSON.parse(savedCleanMode));
    if (savedReadingMode === 'vertical' || savedReadingMode === 'horizontal') {
      setReadingMode(savedReadingMode);
    }
  }, []);

  // Update reading progress on horizontal page change
  useEffect(() => {
    if (readingMode === 'horizontal' && page && pageNumber) {
      updateReadingProgress(parseInt(pageNumber));
    }
  }, [page, pageNumber, readingMode]);

  // Handle login gate errors
  useEffect(() => {
    if (error?.requiresLogin && parseInt(pageNumber) > 2) {
      setShowLoginModal(true);
      navigate(`/books/${bookId}/page/2`, { replace: true });
    }
  }, [error, pageNumber, bookId, navigate]);

  // Prefetch adjacent pages
  useEffect(() => {
    if (bookId && pageNumber) {
      const currentPageNum = parseInt(pageNumber);
      for (let i = 1; i <= 3; i++) {
        prefetchNextPage(bookId, currentPageNum + i - 1);
      }
      for (let i = 1; i <= 3; i++) {
        const targetPageNum = currentPageNum - i;
        if (targetPageNum > 0) {
          prefetchPreviousPage(bookId, targetPageNum + 1);
        }
      }
    }
  }, [bookId, pageNumber, prefetchNextPage, prefetchPreviousPage]);

  // Fetch generated images for current page
  useEffect(() => {
    if (isUpdatingUrlFromScroll.current) return;

    const fetchGeneratedImages = async () => {
      if (!bookId || !pageNumber) return;
      const [err, data] = await catchError(authFetch({
        path: `/book/${bookId}/generated-images/page/${pageNumber}`,
        method: 'GET',
        requireAuth: false
      }));
      if (err) { console.error('Error fetching generated images:', err); return; }
      if (data) {
        setAllGeneratedImages(data);
        const imageMap = {};
        data.forEach(img => {
          if (img.paragraphId) imageMap[img.paragraphId] = img.imageUrl;
        });
        setGeneratedImages(imageMap);
      }
    };

    fetchGeneratedImages();
  }, [bookId, pageNumber]);

  const handleGenerateImage = async (paragraphId, text, style, aspectRatio = '1:1') => {
    try {
      setGeneratingImage(paragraphId);
      const [err, data] = await catchError(authFetch({
        path: `/book/${bookId}/generate-image`,
        method: 'POST',
        body: { prompt: text, paragraphId, pageNumber: parseInt(pageNumber), style, aspectRatio }
      }));
      if (err) {
        console.error('Error generating image:', err);
        if (err.message && (
          err.message.includes('tokens') ||
          err.message.includes('usage limit') ||
          err.message.includes('upgrade your subscription')
        )) {
          setShowParagraphModal(false);
          setSelectedParagraph(null);
          setShowUsageExhaustedModal(true);
        }
        return;
      }
      if (data?.imageUrl) {
        setGeneratedImages(prev => ({ ...prev, [paragraphId]: data.imageUrl }));
        setAllGeneratedImages(prev => [...prev, {
          imageUrl: data.imageUrl, paragraphId,
          pageNumber: parseInt(pageNumber), text, style
        }]);
      }
    } catch (err) {
      console.error('Error generating image:', err);
    } finally {
      setGeneratingImage(null);
    }
  };

  const handleGenerateVideo = async (paragraphId, text, style, durationSeconds = 6, aspectRatio = '16:9', resolution = '720p') => {
    try {
      const [err, data] = await catchError(authFetch({
        path: `/book/${bookId}/generate-video`,
        method: 'POST',
        body: { prompt: text, paragraphId, pageNumber: parseInt(pageNumber), style, durationSeconds, aspectRatio, resolution }
      }));
      if (err) {
        console.error('Error generating video:', err);
        if (err.message && (
          err.message.includes('tokens') ||
          err.message.includes('usage limit') ||
          err.message.includes('upgrade your subscription')
        )) {
          setShowParagraphModal(false);
          setSelectedParagraph(null);
          setShowUsageExhaustedModal(true);
        }
        return null;
      }
      return data?.imageGenerationId || null;
    } catch (err) {
      console.error('Error generating video:', err);
      return null;
    }
  };

  const handleAuthenticatedAction = (action) => {
    if (!user) {
      navigate('/login', { state: { from: location.pathname, message: 'Please log in to use this feature.' } });
    } else {
      action();
    }
  };

  const handleCharacterClick = (characterId) => {
    const isOpen = openMiniChats.includes(characterId);
    if (isOpen) {
      setOpenMiniChats((prev) => prev.filter((id) => id !== characterId));
    } else {
      setOpenMiniChats((prev) => [...prev, characterId]);
    }
  };

  const closeMiniChat = (characterId) => {
    setOpenMiniChats((prev) => prev.filter((id) => id !== characterId));
  };

  const adjustFontSize = (delta) => {
    const newSize = Math.max(12, Math.min(24, fontSize + delta));
    setFontSize(newSize);
    localStorage.setItem('bookReaderFontSize', JSON.stringify(newSize));
  };

  const toggleCleanReadingMode = () => {
    const newValue = !cleanReadingMode;
    setCleanReadingMode(newValue);
    localStorage.setItem('bookReaderCleanMode', JSON.stringify(newValue));
  };

  const toggleReadingMode = () => {
    const newMode = readingMode === 'horizontal' ? 'vertical' : 'horizontal';
    setReadingMode(newMode);
    localStorage.setItem('bookReaderReadingMode', newMode);
    if (newMode === 'horizontal') {
      resetForHorizontalMode();
    }
  };

  const renderParagraph = ({ children }) => {
    const paragraphText = React.Children.toArray(children)
      .map(child => {
        if (typeof child === 'string') return child;
        if (React.isValidElement(child)) return child.props.children || '';
        return '';
      })
      .join('');

    const hasEnoughContent = paragraphText.length >= 150;

    return (
      <div className="paragraph-container">
        <p>{children}</p>
        {!cleanReadingMode && isAIMode && user && hasEnoughContent && (
          <div className="paragraph-controls" onClick={e => e.stopPropagation()}>
            <button
              className={`view-images-btn ${isDarkMode ? 'dark-mode' : ''}`}
              onClick={() => {
                setSelectedParagraph({ text: paragraphText });
                setShowParagraphModal(true);
              }}
            >
              <ImageIcon size={16} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const floatingHamburgerStyle = {
    position: 'fixed',
    borderRadius: '50%',
    width: '50px',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    background: isDarkMode ? '#2a2a2a' : '#ffffff',
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
  };

  if (loading) return (
    <>
      <Navbar isOpen={headerMenuOpen} onClose={() => setHeaderMenuOpen(false)} />
      <button
        className={`floating-nav-button ${isDarkMode ? 'dark-mode' : ''} ${headerMenuOpen ? 'active' : ''}`}
        onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
        title="Toggle navigation"
        style={{ ...floatingHamburgerStyle, top: '20px', right: '20px', zIndex: 998 }}
      >
        <Menu size={24} color={isDarkMode ? '#ffffff' : '#333333'} />
      </button>
      <BookReaderSkeleton />
    </>
  );

  return (
    <>
      <Navbar isOpen={headerMenuOpen} onClose={() => setHeaderMenuOpen(false)} />

      {!cleanReadingMode && (
        <button
          className={`floating-nav-button ${isDarkMode ? 'dark-mode' : ''} ${headerMenuOpen ? 'active' : ''}`}
          onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
          title="Toggle navigation"
          style={{ ...floatingHamburgerStyle, top: '20px', left: '20px', zIndex: 999 }}
        >
          <Menu size={24} color={isDarkMode ? '#ffffff' : '#333333'} />
        </button>
      )}

      {/* Character bubbles */}
      {!cleanReadingMode && showCharacterBubbles && characters && characters.some(char => char.presentInCurrentPage) && (
        <div className="character-bubble">
          {characters
            .filter(char => char.presentInCurrentPage)
            .map((char, index) => (
              <div
                key={char._id}
                className={`character-bubble-wrapper ${openMiniChats.includes(char._id) ? 'chat-open' : ''}`}
              >
                <img
                  src={thumbUrl(char.image_url, 100)}
                  alt={`${char.firstName} ${char.lastName}`}
                  className={`character-bubble-image ${isDarkMode ? 'dark-mode' : ''}`}
                  style={{
                    animation: `float ${2 + index * 0.5}s ease-in-out infinite`,
                    animationDelay: `${index * 0.2}s`
                  }}
                  onClick={() => handleCharacterClick(char._id, true, false)}
                />
                <div className={`character-tooltip ${isDarkMode ? 'dark-mode' : ''}`}>
                  {char.firstName} {char.lastName}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Mini character chats - above bubbles, closable, minimizable */}
      {!cleanReadingMode && openMiniChats.length > 0 && characters && (
        <>
          {openMiniChats.map((characterId, index) => {
            const char = characters.find((c) => c._id === characterId);
            if (!char) return null;
            return (
              <MiniCharacterChat
                key={characterId}
                character={char}
                bookId={bookId}
                currentPage={parseInt(pageNumber, 10)}
                user={user}
                isDarkMode={isDarkMode}
                onClose={() => closeMiniChat(characterId)}
                index={index}
              />
            );
          })}
        </>
      )}

      {/* Book logo menu toggle */}
      <button
        className={`menu-toggle book-logo-button ${isDarkMode ? 'dark-mode' : ''} ${isMenuOpen ? 'active' : ''} ${!user && !authLoading ? 'no-user-attention' : ''}`}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        title="Toggle menu"
      >
        <img
          src={isDarkMode ? '/book-logo-dark.png' : '/book-logo-light.png'}
          alt="Menu"
          className="menu-book-logo"
        />
      </button>

      <ReaderMenu
        user={user}
        isDarkMode={isDarkMode}
        cleanReadingMode={cleanReadingMode}
        readingMode={readingMode}
        fontSize={fontSize}
        isMenuOpen={isMenuOpen}
        characters={characters}
        onClose={() => setIsMenuOpen(false)}
        onToggleTheme={() => handleAuthenticatedAction(toggleTheme)}
        onToggleCleanMode={() => handleAuthenticatedAction(toggleCleanReadingMode)}
        onToggleReadingMode={() => handleAuthenticatedAction(toggleReadingMode)}
        onShowGallery={() => handleAuthenticatedAction(() => { setShowGallery(true); setIsMenuOpen(false); })}
        onShowCharacters={() => handleAuthenticatedAction(() => { setShowCharacters(true); setIsMenuOpen(false); })}
        onFontSizeChange={(delta) => handleAuthenticatedAction(() => adjustFontSize(delta))}
        onNavigateLogin={() => navigate('/login', { state: { from: location.pathname, message: 'Please sign in to access reader controls.' } })}
      />

      <div className={`menu-overlay ${isMenuOpen ? 'visible' : ''}`} onClick={() => setIsMenuOpen(false)} />

      {readingMode === 'horizontal' ? (
        <HorizontalReader
          page={page}
          bookId={bookId}
          bookTitle={book?.title}
          isDarkMode={isDarkMode}
          fontSize={fontSize}
          isFetching={isFetching}
          isTransitioning={isTransitioning}
          showSwipeInstructions={showSwipeInstructions}
          pageNumber={pageNumber}
          loading={loading}
          renderParagraph={renderParagraph}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onPrevClick={handleBackClick}
          onNextClick={handleNextClick}
        />
      ) : (
        <VerticalReader
          loadedPages={loadedPages}
          scrollContainerRef={scrollContainerRef}
          loadMoreSentinelRef={loadMoreSentinelRef}
          pageRefs={pageRefs}
          bookId={bookId}
          bookTitle={book?.title}
          isDarkMode={isDarkMode}
          fontSize={fontSize}
          renderParagraph={renderParagraph}
        />
      )}

      {/* Full-size image modal */}
      {selectedImage && (
        <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="image-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedImage(null)}>
              <X size={24} />
            </button>
            {selectedImage.mediaType === 'video' ? (
              <video src={selectedImage.videoUrl} controls autoPlay loop muted playsInline />
            ) : (
              <img src={selectedImage.imageUrl} alt="AI Generated Scene" />
            )}
            <p className="image-caption">{selectedImage.text}</p>
          </div>
        </div>
      )}

      {showGallery && (
        <PageGalleryModal
          allGeneratedImages={allGeneratedImages}
          pageNumber={pageNumber}
          onClose={() => setShowGallery(false)}
          onSelectImage={setSelectedImage}
          isDarkMode={isDarkMode}
        />
      )}

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <UsageExhaustedModal isOpen={showUsageExhaustedModal} onClose={() => setShowUsageExhaustedModal(false)} />

      {showCharacters && (
        <CharacterListModal
          characters={characters}
          isDarkMode={isDarkMode}
          onClose={() => setShowCharacters(false)}
          onCharacterClick={handleCharacterClick}
        />
      )}

      {showParagraphModal && selectedParagraph && (
        <ParagraphModal
          paragraph={selectedParagraph}
          onClose={() => { setShowParagraphModal(false); setSelectedParagraph(null); }}
          pageNumber={pageNumber}
          allGeneratedImages={allGeneratedImages}
          generatingImage={generatingImage}
          handleGenerateImage={handleGenerateImage}
          handleGenerateVideo={handleGenerateVideo}
          isDarkMode={isDarkMode}
          onImageSelect={setSelectedImage}
        />
      )}

    </>
  );
}
