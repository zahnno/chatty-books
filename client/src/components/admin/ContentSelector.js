import React, { useEffect, useState } from 'react';
import { authFetch, catchError } from '../../utils';
import { EmptyState, Loading, Notice, SearchInput } from './AdminUI';

const titleOf = (item) => item.title || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Untitled';

// Searchable, paged list of books or characters to pick from. Items in excludeIds
// (already on the list being edited) are hidden.
export default function ContentSelector({ contentType, onSelect, excludeIds = [], selectedId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const base = contentType === 'book' ? '/books/search' : '/characters';
      const params = new URLSearchParams({ page: String(page) });
      if (debouncedQuery) params.set('query', debouncedQuery);
      const [err, data] = await catchError(authFetch({ path: `${base}?${params}` }));
      if (cancelled) return;
      setLoading(false);
      if (err) return setError(err.message || 'Could not load content');
      const list = (contentType === 'book' ? data.books : data.characters) || [];
      setItems(prev => (page === 1 ? list : [...prev, ...list]));
      setHasMore(Boolean(data.hasMore));
    };
    load();
    return () => { cancelled = true; };
  }, [contentType, debouncedQuery, page]);

  const shown = items.filter(item => !excludeIds.includes(item._id));

  return (
    <div>
      <SearchInput value={query} onChange={setQuery} placeholder={`Search ${contentType === 'book' ? 'books' : 'characters'}`} />
      {error && <div style={{ marginTop: 16 }}><Notice>{error}</Notice></div>}

      <div className="adm-picker-list">
        {loading && page === 1 ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing to add" text="No matches, or everything here is already on the list." />
        ) : (
          <div className="adm-list">
            {shown.map(item => (
              <button
                key={item._id}
                type="button"
                className="adm-row is-clickable"
                style={{ border: 'none', font: 'inherit', textAlign: 'left', width: '100%', background: selectedId === item._id ? 'var(--accent-soft)' : undefined }}
                onClick={() => onSelect(item)}
                aria-pressed={selectedId === item._id}
              >
                <img
                  className={contentType === 'book' ? 'adm-thumb' : 'adm-avatar'}
                  src={item.image_url || '/placeholder-cover.jpg'}
                  alt=""
                  loading="lazy"
                />
                <div className="adm-row-body">
                  <p className="adm-row-title">{titleOf(item)}</p>
                  <p className="adm-row-sub clamp">
                    {contentType === 'book' ? item.author || item.description : item.bookTitle || item.intro}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {hasMore && (
        <div className="adm-form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary" onClick={() => setPage(p => p + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
