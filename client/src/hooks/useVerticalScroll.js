import { useState, useRef, useEffect } from 'react';
import { authFetch, catchError } from '../utils';
import { QUERY_KEYS } from './useApi';

export default function useVerticalScroll({
  bookId,
  pageNumber,
  readingMode,
  navigate,
  user,
  queryClient,
  setShowLoginModal,
  updateReadingProgress,
  pageRefs,
}) {
  const [loadedPages, setLoadedPages] = useState([]);
  const scrollContainerRef = useRef(null);
  const isUpdatingUrlFromScroll = useRef(false);
  const loadMoreSentinelRef = useRef(null);
  const [hasScrolledToInitialPage, setHasScrolledToInitialPage] = useState(false);
  const hasReachedEnd = useRef(false);

  const initializeScrollPages = async (centerPage) => {
    const startPage = Math.max(1, centerPage - 2);
    const endPage = centerPage + 3;
    const pages = [];

    for (let p = startPage; p <= endPage; p++) {
      if (!user && p > 2) break;
      try {
        const data = await queryClient.fetchQuery({
          queryKey: QUERY_KEYS.BOOK_PAGE(bookId, String(p)),
          queryFn: async () => {
            const [err, result] = await catchError(authFetch({
              path: `/book/${bookId}/pages/num/${p}`,
              method: 'GET',
              requireAuth: false
            }));
            if (err) throw err;
            return result;
          },
          staleTime: 5 * 60 * 1000,
        });
        if (data) {
          pages.push(data);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    setLoadedPages(pages);
    hasReachedEnd.current = false;
  };

  const loadMorePagesAhead = async () => {
    if (hasReachedEnd.current) return;
    const lastPage = loadedPages[loadedPages.length - 1];
    if (!lastPage) return;
    const nextPageNum = lastPage.pageNumber + 1;

    if (!user && nextPageNum > 2) {
      setShowLoginModal(true);
      return;
    }

    try {
      const data = await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.BOOK_PAGE(bookId, String(nextPageNum)),
        queryFn: async () => {
          const [err, result] = await catchError(authFetch({
            path: `/book/${bookId}/pages/num/${nextPageNum}`,
            method: 'GET',
            requireAuth: false
          }));
          if (err) throw err;
          return result;
        },
        staleTime: 5 * 60 * 1000,
      });

      if (data) {
        setLoadedPages(prev => {
          if (prev.some(p => p.pageNumber === data.pageNumber)) return prev;
          return [...prev, data];
        });
      } else {
        hasReachedEnd.current = true;
      }
    } catch {
      hasReachedEnd.current = true;
    }
  };

  // Initialize scroll pages when switching to vertical mode or when user auth resolves
  useEffect(() => {
    if (readingMode === 'vertical') {
      setHasScrolledToInitialPage(false);
      initializeScrollPages(parseInt(pageNumber));
    }
  }, [readingMode, user]);

  // Scroll to initial page after pages are loaded
  useEffect(() => {
    if (readingMode === 'vertical' && loadedPages.length > 0 && !hasScrolledToInitialPage) {
      const currentPageNum = parseInt(pageNumber);
      requestAnimationFrame(() => {
        const el = pageRefs.current[currentPageNum];
        if (el) {
          el.scrollIntoView({ behavior: 'auto', block: 'start' });
          setHasScrolledToInitialPage(true);
        }
      });
    }
  }, [loadedPages, readingMode]);

  // Track current visible page ref
  const currentVisiblePageRef = useRef(pageNumber);
  useEffect(() => {
    currentVisiblePageRef.current = pageNumber;
  }, [pageNumber]);

  // IntersectionObserver for page tracking in vertical mode
  useEffect(() => {
    if (readingMode !== 'vertical' || loadedPages.length === 0) return;
    if (!hasScrolledToInitialPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let mostVisibleEntry = null;
        let maxRatio = 0;

        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisibleEntry = entry;
          }
        });

        if (mostVisibleEntry && maxRatio > 0.25) {
          const pageNum = mostVisibleEntry.target.dataset.pageNumber;
          if (pageNum && pageNum !== currentVisiblePageRef.current) {
            currentVisiblePageRef.current = pageNum;
            isUpdatingUrlFromScroll.current = true;
            navigate(`/books/${bookId}/page/${pageNum}`, { replace: true });
            updateReadingProgress(parseInt(pageNum));
            setTimeout(() => {
              isUpdatingUrlFromScroll.current = false;
            }, 300);
          }
        }
      },
      { threshold: [0.25, 0.5, 0.75] }
    );

    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [readingMode, loadedPages, bookId, hasScrolledToInitialPage]);

  // IntersectionObserver for sentinel (load more)
  useEffect(() => {
    if (readingMode !== 'vertical' || !loadMoreSentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMorePagesAhead();
        }
      },
      { rootMargin: '500px' }
    );

    observer.observe(loadMoreSentinelRef.current);
    return () => observer.disconnect();
  }, [readingMode, loadedPages]);

  const resetForHorizontalMode = () => {
    setLoadedPages([]);
    pageRefs.current = {};
    setHasScrolledToInitialPage(false);
    hasReachedEnd.current = false;
  };

  return {
    loadedPages,
    setLoadedPages,
    scrollContainerRef,
    isUpdatingUrlFromScroll,
    loadMoreSentinelRef,
    hasScrolledToInitialPage,
    setHasScrolledToInitialPage,
    resetForHorizontalMode,
  };
}
