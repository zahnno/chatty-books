import { useState, useRef, useEffect } from 'react';

export default function useBookReaderNavigation({
  bookId,
  pageNumber,
  navigate,
  user,
  readingMode,
  pageRefs,
  setShowLoginModal,
  page,
  updateReadingProgress,
}) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showSwipeInstructions, setShowSwipeInstructions] = useState(false);
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const mouseDown = useRef({ x: 0, y: 0, time: 0 });
  const isDragging = useRef(false);

  const handleNextClick = async () => {
    const nextPage = parseInt(pageNumber) + 1;
    if (nextPage > 2 && !user) {
      setShowLoginModal(true);
      return;
    }
    updateReadingProgress(nextPage);
    navigate(`/books/${bookId}/page/${nextPage}`);
  };

  const handleBackClick = () => {
    if (pageNumber == 1) {
      updateReadingProgress(1);
      return navigate(`/books/${bookId}`);
    }
    const prevPage = parseInt(pageNumber) - 1;
    updateReadingProgress(prevPage);
    navigate(`/books/${bookId}/page/${prevPage}`);
  };

  const handleSwipeNavigation = (direction) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      if (direction === 'next') {
        handleNextClick();
      } else {
        handleBackClick();
      }
      setIsTransitioning(false);
    }, 150);
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('button, a, .paragraph-controls')) return;
    touchStart.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY, time: Date.now() };
  };

  const handleTouchMove = (e) => {
    if (!touchStart.current.x) return;
    const deltaX = e.targetTouches[0].clientX - touchStart.current.x;
    const deltaY = e.targetTouches[0].clientY - touchStart.current.y;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchStart.current.x) return;
    const MIN_SWIPE_DISTANCE = 50;
    const MAX_SWIPE_TIME = 500;
    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const swipeDuration = Date.now() - touchStart.current.time;
    const deltaX = touchEnd.x - touchStart.current.x;
    const deltaY = touchEnd.y - touchStart.current.y;

    if (swipeDuration < MAX_SWIPE_TIME) {
      if (Math.abs(deltaX) > MIN_SWIPE_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) {
          handleSwipeNavigation('next');
        } else {
          handleSwipeNavigation('prev');
        }
      }
    }
    touchStart.current = { x: 0, y: 0, time: 0 };
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('button, a, .paragraph-controls')) return;
    e.preventDefault();
    mouseDown.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    isDragging.current = true;
  };

  const handleMouseUp = (e) => {
    if (!isDragging.current) return;
    const MIN_SWIPE_DISTANCE = 50;
    const MAX_SWIPE_TIME = 700;
    const mouseUp = { x: e.clientX, y: e.clientY };
    const swipeDuration = Date.now() - mouseDown.current.time;
    const deltaX = mouseUp.x - mouseDown.current.x;
    const deltaY = mouseUp.y - mouseDown.current.y;

    if (swipeDuration < MAX_SWIPE_TIME) {
      if (Math.abs(deltaX) > MIN_SWIPE_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          handleSwipeNavigation('next');
        } else {
          handleSwipeNavigation('prev');
        }
      }
    }
    isDragging.current = false;
  };

  const handleMouseMove = (e) => {
    if (isDragging.current) {
      e.preventDefault();
    }
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (readingMode === 'horizontal') {
          if (e.key === 'ArrowLeft') {
            handleSwipeNavigation('prev');
          } else {
            handleSwipeNavigation('next');
          }
        } else {
          const currentPageNum = parseInt(pageNumber);
          const targetPage = e.key === 'ArrowLeft' ? currentPageNum - 1 : currentPageNum + 1;
          const el = pageRefs.current[targetPage];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [pageNumber, isTransitioning, readingMode]);

  // Show swipe instructions briefly on first load
  useEffect(() => {
    if (page && !localStorage.getItem('hasSeenSwipeInstructions')) {
      setShowSwipeInstructions(true);
      setTimeout(() => {
        setShowSwipeInstructions(false);
        localStorage.setItem('hasSeenSwipeInstructions', 'true');
      }, 3000);
    }
  }, [page]);

  return {
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
    updateReadingProgress,
    isTransitioning,
    showSwipeInstructions,
  };
}
