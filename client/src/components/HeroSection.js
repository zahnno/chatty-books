import React from 'react';
import { ArrowRight } from 'react-feather';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { thumbUrl } from '@talkingbook/shared';

// Some stored cover URLs are double-encoded (%2520) or contain raw spaces.
const normalizeImageUrl = (url) => {
  if (!url || !url.startsWith('http')) return url;
  if (url.includes('%2520')) return url.replace(/%2520/g, '%20');
  if (url.includes(' ')) return url.replace(/\s/g, '%20');
  return url;
};

const HeroSection = ({ books = [] }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const covers = books
    .filter((book) => book.image_url && book.image_url.trim() !== '')
    .slice(0, 9)
    .map((book) => ({ ...book, image_url: normalizeImageUrl(book.image_url) }));

  // Three staggered columns of covers
  const columns = [0, 1, 2].map((col) => covers.filter((_, i) => i % 3 === col));

  return (
    <section className="home-hero">
      <div className="home-hero-inner">
        <div className="home-hero-copy">
          <span className="ui-section-eyebrow">Read · Listen · Talk it over</span>
          <h1 className="home-hero-title">
            Where books turn into <em>conversations</em>.
          </h1>
          <p className="home-hero-subtitle">
            Read the classics, listen along with a narrator, and chat with the characters
            who live inside them.
          </p>
          <div className="home-hero-actions">
            {user ? (
              <button type="button" className="ui-btn ui-btn-primary ui-btn-lg" onClick={() => navigate('/books')}>
                Go to your library
                <ArrowRight size={18} />
              </button>
            ) : (
              <button type="button" className="ui-btn ui-btn-primary ui-btn-lg" onClick={() => navigate('/register')}>
                Start reading free
                <ArrowRight size={18} />
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-lg" onClick={() => navigate('/how-to')}>
              How it works
            </button>
          </div>
        </div>

        {covers.length > 0 && (
          <div className="home-hero-covers" aria-hidden="true">
            {columns.map((column, colIndex) => (
              <div key={colIndex} className={`home-hero-column home-hero-column-${colIndex + 1}`}>
                {column.map((book, index) => (
                  <button
                    type="button"
                    tabIndex={-1}
                    key={book._id || index}
                    className="home-hero-cover"
                    onClick={() => book._id && navigate(`/books/${book._id}`)}
                  >
                    <img src={thumbUrl(book.image_url, 400)} alt="" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default HeroSection;
