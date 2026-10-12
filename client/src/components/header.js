import React, { useState, useEffect, useRef } from "react";
import { Search, Menu, X, Sun, Moon, User } from "react-feather";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from '../context/ThemeContext';
import { authFetch, catchError } from '../utils';
import '../styles/header.css';
import { useAuth } from '../context/AuthContext';
import { thumbUrl } from '@talkingbook/shared';

const NAV_ITEMS = [
  { to: '/', label: 'Discover', end: true },
  { to: '/books', label: 'Library', end: true },
  { to: '/characters', label: 'Characters' },
  { to: '/gallery', label: 'Gallery' },
];

export default function Header({ openBookRequestModal, onMenuToggle, isMenuOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const searchRef = useRef(null);
  const { user } = useAuth();

  const isSearchPage = location.pathname === '/search';

  // Hairline border only once the page has scrolled under the header
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The header is always shown; pages (e.g. search) read this class for their top spacing
  useEffect(() => {
    document.body.classList.add('header-visible');
    return () => document.body.classList.remove('header-visible');
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
      setShowDropdown(false);
    }
  };

  const handleSearchChange = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim().length >= 2) {
      setIsSearching(true);
      setShowDropdown(true);

      try {
        const [, data] = await catchError(authFetch({
          path: `/books/search?query=${encodeURIComponent(query.trim())}`,
          method: 'GET',
          requireAuth: false
        }));

        if (data && data.books) {
          setSearchResults(data.books.slice(0, 5)); // Show only first 5 results
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = (bookId) => {
    navigate(`/books/${bookId}`);
    setShowDropdown(false);
    setSearchQuery('');
  };

  return (
    <header className={`app-header ${isScrolled ? 'scrolled' : ''}`}>
      <div className="header-content">
        <Link className="header-brand" to="/" aria-label="Chatty Books home">
          <img src={isDarkMode ? "/book-logo-dark.png" : "/book-logo-light.png"} alt="" />
          <span>Chatty Books</span>
        </Link>

        <nav className="header-nav" aria-label="Primary">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className="header-nav-link">
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          {!isSearchPage && (
            <div className="header-search" ref={searchRef}>
              <form onSubmit={handleSearch} role="search">
                <Search size={16} className="header-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search books"
                  aria-label="Search books"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
              </form>
              {showDropdown && (
                <div className="search-dropdown">
                  {isSearching ? (
                    <div className="search-loading">
                      <div className="loading-spinner" />
                    </div>
                  ) : searchResults.length > 0 ? (
                    <>
                      {searchResults.map((book) => (
                        <button
                          type="button"
                          key={book._id}
                          className="search-result-item"
                          onClick={() => handleResultClick(book._id)}
                        >
                          <img
                            src={thumbUrl(book.image_url || '/placeholder-book.png', 100)}
                            alt=""
                            onError={(e) => {
                              e.target.src = '/placeholder-book.png';
                            }}
                          />
                          <span className="search-result-info">
                            <span className="search-result-title">{book.title}</span>
                            <span className="search-result-author">{book.author}</span>
                          </span>
                        </button>
                      ))}
                      <button type="button" className="view-all-results" onClick={handleSearch}>
                        View all results
                      </button>
                    </>
                  ) : searchQuery.trim().length >= 2 ? (
                    <div className="no-results">
                      <p>No books found</p>
                      <button
                        type="button"
                        className="request-book-button"
                        onClick={() => {
                          setShowDropdown(false);
                          if (user) {
                            openBookRequestModal();
                          } else {
                            navigate('/login');
                          }
                        }}
                      >
                        Request a book
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <Link to="/search" className="header-icon-button header-search-link" aria-label="Search">
            <Search size={18} />
          </Link>

          <button
            type="button"
            className="header-icon-button header-theme-toggle"
            onClick={toggleTheme}
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <Link to="/settings" className="header-avatar" aria-label="Your account">
              {user.profileImage ? (
                <img src={thumbUrl(user.profileImage, 100)} alt="" />
              ) : (
                <User size={16} />
              )}
            </Link>
          ) : (
            <Link to="/login" className="header-signin">Sign in</Link>
          )}

          <button
            type="button"
            className="header-icon-button"
            onClick={onMenuToggle}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
