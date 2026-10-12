import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'react-feather';
import { authFetch, catchError } from '../utils';
import { useAuth } from '../context/AuthContext';
import BookRequestModal from './BookRequestModal';
import { preloadBookPage } from '../utils/routePrefetch';
import { useBookPrefetch } from '../hooks/useApi';
import SearchBooksSkeleton from './skeletons/SearchBooksSkeleton';
import '../styles/BookRequestModal.css';
import '../styles/shelf.css';
import { thumbUrl } from '@talkingbook/shared';

const SearchBooks = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('query') || '');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const observer = useRef();
  const { user } = useAuth();
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const prefetchBook = useBookPrefetch();
  const onBookHover = (book) => {
    if (book?._id) {
      preloadBookPage();
      prefetchBook(book._id, book.currentPage || 1);
    }
  };

  const lastBookElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [fetchError, response] = await catchError(authFetch({
        path: `/books/search?page=${page}&query=${encodeURIComponent(searchQuery)}`,
        method: 'GET',
        requireAuth: false
      }));

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        setError('Failed to fetch books. Please try again.');
        return;
      }
      
      if (!response || !response.books || !Array.isArray(response.books)) {
        console.error('Received invalid response format:', response);
        setError('Invalid response format from server');
        return;
      }

      const newBooks = response.books;
      
      setBooks(prevBooks => {
        if (page === 1) {
          return newBooks;
        }
        // Filter out duplicates
        const uniqueBooks = newBooks.filter(newBook => 
          !prevBooks.some(existingBook => existingBook._id === newBook._id)
        );
        return [...prevBooks, ...uniqueBooks];
      });
      
      setHasMore(response.hasMore);
    } catch (error) {
      console.error('Error in fetchBooks:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSearchParams(query ? { query } : {}, { replace: true });
    // Reset pagination when search changes
    setBooks([]);
    setPage(1);
    setHasMore(true);
    setError(null);
  };

  // Fetch books when page or query changes
  useEffect(() => {
    if (page === 1 || hasMore) {
      fetchBooks();
    }
  }, [page, searchQuery]);

  // Handle URL query parameter changes
  useEffect(() => {
    const urlQuery = searchParams.get('query');
    if (urlQuery !== searchQuery) {
      setSearchQuery(urlQuery || '');
      // Don't reset here - the searchQuery change will trigger a fetch
    }
  }, [searchParams]);

  return (
    <div className="ui-page search-page-v2">
      <header className="search-header">
        <h1 className="ui-page-title">{searchQuery ? 'Search results' : 'Browse all books'}</h1>
        <div className="ui-search search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search by title or author"
            aria-label="Search books"
            value={searchQuery}
            onChange={handleSearchChange}
            autoFocus
          />
        </div>
      </header>

      {error && <p className="search-error">{error}</p>}

      {books.length === 0 && !loading && !error ? (
        searchQuery ? (
          <div className="search-empty">
            <h2 className="ui-section-title">No books match "{searchQuery}"</h2>
            <p className="ui-section-subtitle">Can't find what you're after? Ask us to add it.</p>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              onClick={() => {
                if (user) {
                  setIsRequestModalOpen(true);
                } else {
                  window.location.href = '/#/login';
                }
              }}
            >
              Request a book
            </button>
          </div>
        ) : null
      ) : (
        <div className="shelf-grid">
          {books.map((book, index) => {
            if (!book || !book._id) {
              console.error('Invalid book object at index', index, book);
              return null;
            }
            const isLastElement = books.length === index + 1;
            return (
              <Link
                ref={isLastElement ? lastBookElementRef : null}
                key={book._id}
                to={`/books/${book._id}`}
                className="shelf-book"
                onMouseEnter={() => onBookHover(book)}
                onFocus={() => onBookHover(book)}
              >
                <span className="shelf-cover">
                  <img
                    src={thumbUrl(book.image_url || '/placeholder-book.png', 200)}
                    alt={`Cover of ${book.title || 'Untitled book'}`}
                    loading="lazy"
                    onError={(e) => {
                      e.target.src = '/placeholder-book.png';
                    }}
                  />
                </span>
                <span className="shelf-title">{book.title || 'Untitled book'}</span>
                <span className="shelf-author">{book.author || 'Unknown author'}</span>
              </Link>
            );
          })}
        </div>
      )}
      {loading && <SearchBooksSkeleton />}

      <BookRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
      />
    </div>
  );
};

export default SearchBooks;
