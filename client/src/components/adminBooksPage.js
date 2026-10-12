import React, { useEffect, useMemo, useState } from "react";
import { Link } from 'react-router-dom';
import { Book, ChevronRight, Plus, Upload } from 'react-feather';
import { authFetch, catchError } from "../utils.js";
import { AdminLayout, Badge, EmptyState, Loading, Notice, SearchInput, formatDate } from './admin/AdminUI';
import { thumbUrl } from '@talkingbook/shared';

const VISIBILITY = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'featured', label: 'Featured' },
];

export default function AdminBooksPage() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');

  const fetchBooks = async () => {
    setLoading(true);
    setError(null);
    const [err, data] = await catchError(authFetch({ path: '/admin/books' }));
    if (err) setError(err.message || 'Could not load books');
    if (data) setBooks(data);
    setLoading(false);
  };

  useEffect(() => { fetchBooks(); }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter(book => {
      const matchesQuery = !q || [book.title, book.author, book.description]
        .some(text => text?.toLowerCase().includes(q));
      const matchesVisibility = visibility === 'all'
        || (visibility === 'public' && book.is_public)
        || (visibility === 'private' && !book.is_public)
        || (visibility === 'featured' && book.is_featured);
      return matchesQuery && matchesVisibility;
    });
  }, [books, query, visibility]);

  return (
    <AdminLayout
      title="Books"
      subtitle={books.length ? `${books.length} book${books.length !== 1 ? 's' : ''} in the library.` : 'Create and manage books, pages and characters.'}
      actions={(
        <>
          <Link className="ui-btn ui-btn-secondary" to="/upload"><Upload size={16} />Import file</Link>
          <Link className="ui-btn ui-btn-primary" to="/admin/new/book"><Plus size={16} />New book</Link>
        </>
      )}
    >
      {error && <Notice onRetry={fetchBooks}>{error}</Notice>}

      {books.length > 0 && (
        <div className="adm-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search title, author or description" />
          <div className="ui-chip-row">
            {VISIBILITY.map(v => (
              <button
                key={v.value}
                type="button"
                className={`ui-chip${visibility === v.value ? ' active' : ''}`}
                aria-pressed={visibility === v.value}
                onClick={() => setVisibility(v.value)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Loading label="Loading books…" />
      ) : books.length === 0 && !error ? (
        <EmptyState
          icon={Book}
          title="No books yet"
          text="Create a book by hand, or import a PDF, EPUB or TXT file and let the pages, cover and characters be generated."
          action={<Link className="ui-btn ui-btn-primary" to="/admin/new/book"><Plus size={16} />New book</Link>}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Book} title="No matches" text="Try a different search or filter." />
      ) : (
        <div className="adm-list">
          {shown.map(book => (
            <Link key={book._id} to={`/admin/books/${book._id}`} className="adm-row">
              <img className="adm-thumb" src={thumbUrl(book.image_url || '/placeholder-cover.jpg', 100)} alt="" loading="lazy" />
              <div className="adm-row-body">
                <p className="adm-row-title">{book.title || 'Untitled'}</p>
                <p className="adm-row-sub">{book.author || 'Unknown author'}</p>
                <div className="adm-row-meta">
                  <Badge>{book.is_public ? 'Public' : 'Private'}</Badge>
                  {book.is_featured && <Badge tone="accent">Featured</Badge>}
                  {book.categories?.slice(0, 3).map(c => <span key={c} className="ui-tag">{c}</span>)}
                  <span className="adm-hint">Updated {formatDate(book.updatedAt)}</span>
                </div>
              </div>
              <ChevronRight size={18} className="adm-muted" />
            </Link>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
