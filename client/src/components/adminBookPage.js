import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AlignLeft, BookOpen, Edit3, ExternalLink, FileText, Trash2, UserPlus, Users } from 'react-feather';
import { authFetch, catchError } from "../utils.js";
import { AdminLayout, Badge, EmptyState, Loading, formatDate } from './admin/AdminUI';

export default function AdminBookPage() {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // 'characters' | 'reformat' | 'delete'

  useEffect(() => {
    const fetchBook = async () => {
      const [err, data] = await catchError(authFetch({ path: `/book/${bookId}` }));
      if (err) setError(err.message || 'Could not load this book');
      if (data) setBook(data);
    };
    fetchBook();
  }, [bookId]);

  const deleteBook = async () => {
    if (!window.confirm(`Delete "${book.title}"? Its pages and characters are deleted too. This cannot be undone.`)) return;
    setBusy('delete');
    const [err] = await catchError(authFetch({ path: `/book/${bookId}/delete`, method: 'POST' }));
    setBusy(null);
    if (err) return toast.error(err.message || 'Could not delete the book');
    toast.success('Book deleted');
    navigate('/admin/books');
  };

  const reformatBook = async () => {
    if (!window.confirm('Reformat this book? Clumped text is split into proper paragraphs on every page. This cannot be undone.')) return;
    setBusy('reformat');
    const [err, data] = await catchError(authFetch({ path: `/book/${bookId}/reformat`, method: 'POST' }));
    setBusy(null);
    if (err) return toast.error(err.message || 'Could not reformat the book');
    toast.success(`Reformatted ${data.pagesUpdated} page${data.pagesUpdated !== 1 ? 's' : ''}`);
  };

  const generateCharacters = async () => {
    setBusy('characters');
    const [err, data] = await catchError(authFetch({ path: `/book/${bookId}/generate-characters`, method: 'POST' }));
    setBusy(null);
    if (err) return toast.error(err.message || 'Could not generate characters');
    toast.success(`Generated ${data.length} new character${data.length !== 1 ? 's' : ''}`);
    navigate(`/admin/books/${bookId}/edit/characters`);
  };

  const back = { to: '/admin/books', label: 'All books' };

  if (error) {
    return (
      <AdminLayout title="Book" back={back}>
        <EmptyState icon={BookOpen} title="Book not available" text={error} />
      </AdminLayout>
    );
  }

  if (!book) {
    return <AdminLayout title="Book" back={back}><Loading label="Loading book…" /></AdminLayout>;
  }

  const meta = [
    ['Pages', book.totalPages ?? '-'],
    ['Characters', book.characterCount ?? '-'],
    ['Age group', book.ageGroup || 'Not set'],
    ['Reading time', book.readingTime ? `${book.readingTime} min` : 'Not set'],
    ['Created', formatDate(book.createdAt)],
    ['Updated', formatDate(book.updatedAt)],
  ];

  return (
    <AdminLayout
      title={book.title}
      eyebrow="Book"
      back={back}
      actions={(
        <>
          <Link className="ui-btn ui-btn-secondary" to={`/books/${bookId}`}><ExternalLink size={16} />View</Link>
          <Link className="ui-btn ui-btn-primary" to={`/admin/books/${bookId}/edit`}><Edit3 size={16} />Edit details</Link>
        </>
      )}
    >
      <div className="adm-book">
        <img className="adm-book-cover" src={book.image_url || '/placeholder-cover.jpg'} alt={`${book.title} cover`} />

        <div>
          <p className="adm-book-author" style={{ marginTop: 0 }}>{book.author || 'Unknown author'}</p>
          <div className="adm-row-meta">
            <Badge>{book.is_public ? 'Public' : 'Private'}</Badge>
            {book.is_featured && <Badge tone="accent">Featured</Badge>}
            {book.categories?.map(category => <span key={category} className="ui-tag">{category}</span>)}
          </div>

          {book.tagline && <p className="adm-book-tagline">{book.tagline}</p>}
          {book.description && <p className="adm-book-description">{book.description}</p>}

          <dl className="adm-book-meta">
            {meta.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="adm-tools">
            <Link className="adm-tool" to={`/admin/books/${bookId}/edit/pages`}>
              <FileText size={18} />
              <div><strong>Pages</strong><span>Edit page text and images, add or remove pages</span></div>
            </Link>
            <Link className="adm-tool" to={`/admin/books/${bookId}/edit/characters`}>
              <Users size={18} />
              <div><strong>Characters</strong><span>Profiles, portraits and chat voices</span></div>
            </Link>
            <button type="button" className="adm-tool" onClick={generateCharacters} disabled={!!busy}>
              {busy === 'characters' ? <span className="adm-spinner" /> : <UserPlus size={18} />}
              <div><strong>{busy === 'characters' ? 'Generating characters…' : 'Generate characters'}</strong><span>Find characters in the text with AI</span></div>
            </button>
            <button type="button" className="adm-tool" onClick={reformatBook} disabled={!!busy}>
              {busy === 'reformat' ? <span className="adm-spinner" /> : <AlignLeft size={18} />}
              <div><strong>{busy === 'reformat' ? 'Reformatting…' : 'Reformat text'}</strong><span>Split clumped text into paragraphs</span></div>
            </button>
          </div>

          <div className="adm-section">
            <button type="button" className="ui-btn ui-btn-danger" onClick={deleteBook} disabled={!!busy}>
              <Trash2 size={16} />
              {busy === 'delete' ? 'Deleting…' : 'Delete book'}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
