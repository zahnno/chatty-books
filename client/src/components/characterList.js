import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Users, Search, ChevronLeft, ChevronRight } from 'react-feather';
import { catchError, authFetch } from '../utils.js';
import { useTheme } from '../context/ThemeContext';
import CharacterModal from './CharacterModal';
import { SkeletonBlock } from './skeletons/Skeleton';
import '../styles/characters.css';
import { thumbUrl } from '@talkingbook/shared';

const characterName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Character';

// Characters grouped by book: each book's cover beside its cast, most-talked-to first,
// three tiles in view and the rest a scroll or swipe away. The cover and title open the
// book; a character opens their profile modal.
export default function CharacterList() {
  const { isDarkMode } = useTheme();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const requestId = useRef(0);
  const observer = useRef();

  // Search once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // A new query starts over at page 1.
  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    (async () => {
      const [error, data] = await catchError(
        authFetch({
          path: `/characters/by-book?page=${page}&query=${encodeURIComponent(query)}`,
          requireAuth: false,
        })
      );
      if (id !== requestId.current) return; // a newer search or page superseded this one
      setLoading(false);
      if (error || !data) {
        console.error('Error fetching characters:', error);
        return;
      }
      setGroups((prev) => {
        if (page === 1) return data.books;
        const seen = new Set(prev.map((g) => g.book._id));
        return [...prev, ...data.books.filter((g) => !seen.has(g.book._id))];
      });
      setHasMore(data.hasMore);
    })();
  }, [page, query]);

  const lastGroupRef = useCallback(
    (node) => {
      if (observer.current) observer.current.disconnect();
      if (loading || !hasMore || !node) return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) setPage((p) => p + 1);
        },
        { rootMargin: '400px' }
      );
      observer.current.observe(node);
    },
    [loading, hasMore]
  );

  const firstLoad = loading && page === 1;

  return (
    <div className="ui-page characters-page">
      <header className="characters-header">
        <span className="ui-section-eyebrow">Characters</span>
        <h1 className="ui-page-title">Talk to the characters</h1>
        <p className="ui-page-subtitle">
          Every character here knows their story. Ask them questions, hear their side, and
          see their world through their eyes.
        </p>
        <div className="ui-search characters-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search by name or book"
            aria-label="Search characters"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      {firstLoad && groups.length === 0 ? (
        <BookGroupsSkeleton />
      ) : groups.length > 0 ? (
        <div className={`characters-books${firstLoad ? ' is-refreshing' : ''}`}>
          {groups.map((group, index) => (
            <BookCharacters
              key={group.book._id}
              book={group.book}
              characters={group.characters}
              onSelect={setSelectedCharacter}
              ref={index === groups.length - 1 ? lastGroupRef : null}
            />
          ))}
        </div>
      ) : !loading ? (
        <div className="characters-empty">
          <Users size={40} />
          <h2>No characters found</h2>
          <p>{query ? 'Try a different name or book title.' : 'Discover books to meet their characters.'}</p>
          <NavLink to="/" className="ui-btn ui-btn-primary">Discover books</NavLink>
        </div>
      ) : null}

      {loading && page > 1 && (
        <div className="characters-loading">
          <div className="characters-spinner" />
        </div>
      )}

      {selectedCharacter && (
        <CharacterModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}

const BookCharacters = React.forwardRef(function BookCharacters({ book, characters, onSelect }, ref) {
  const stripRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  // Arrows show only when there's more to scroll that way.
  const updateEdges = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    updateEdges();
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges, characters.length]);

  const scroll = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };

  const bookPath = `/books/${book._id}`;
  const count = characters.length;

  return (
    <section className="characters-book" ref={ref} aria-label={book.title}>
      <header className="characters-book-head">
        <Link to={bookPath} className="characters-book-cover" tabIndex={-1} aria-hidden="true">
          {book.image_url && <img src={thumbUrl(book.image_url, 100)} alt="" loading="lazy" />}
        </Link>
        <div className="characters-book-meta">
          <Link to={bookPath} className="characters-book-title">{book.title}</Link>
          <span className="characters-book-sub">
            {[book.author, `${count} character${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
          </span>
        </div>
        {!(edges.start && edges.end) && (
          <div className="characters-book-arrows">
            <button type="button" onClick={() => scroll(-1)} disabled={edges.start} aria-label="Previous characters">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => scroll(1)} disabled={edges.end} aria-label="More characters">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </header>

      {book.description && <BookDescription text={book.description} />}

      <div className="characters-strip" ref={stripRef} onScroll={updateEdges}>
        {characters.map((character) => (
          <button
            type="button"
            key={character._id}
            className="characters-tile"
            onClick={() => onSelect(character)}
          >
            <span className="characters-portrait">
              {character.image_url && <img src={thumbUrl(character.image_url, 200)} alt="" loading="lazy" />}
            </span>
            <span className="characters-name">{characterName(character)}</span>
            {character.intro && <span className="characters-quote">{character.intro}</span>}
          </button>
        ))}
      </div>
    </section>
  );
});

// Two lines of the blurb; "More" appears only when the text is actually cut off.
function BookDescription({ text }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div className="characters-book-desc">
      <p ref={ref} className={expanded ? 'is-expanded' : ''}>{text}</p>
      {(clamped || expanded) && (
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
}

function BookGroupsSkeleton() {
  return (
    <div className="characters-books" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="characters-book">
          <div className="characters-book-head">
            <SkeletonBlock className="characters-book-cover" />
            <div className="characters-book-meta">
              <SkeletonBlock width="60%" height={18} style={{ borderRadius: 4 }} />
              <SkeletonBlock width="35%" height={12} style={{ borderRadius: 4, marginTop: 8 }} />
            </div>
          </div>
          <div className="characters-strip">
            {[1, 2, 3].map((j) => (
              <div key={j} className="characters-tile">
                <SkeletonBlock className="characters-portrait" />
                <SkeletonBlock width="70%" height={12} style={{ borderRadius: 4, marginTop: 10 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
