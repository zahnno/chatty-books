import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FileText, Image, Plus, Save, Trash2 } from 'react-feather';
import { catchError, authFetch } from '../utils.js';
import { AdminLayout, EmptyState, Field, FileDrop, Loading, Notice } from './admin/AdminUI';

// One editable page: text with unsaved-change tracking, an optional image swap, delete.
function PageCard({ bookId, page, onSaved, onDelete }) {
  const [text, setText] = useState(page.pageText || '');
  const [image, setImage] = useState(null); // { file, url }
  const [saving, setSaving] = useState(false);
  const imageInput = useRef(null);
  const dirty = text !== (page.pageText || '') || Boolean(image);

  useEffect(() => { setText(page.pageText || ''); }, [page.pageText]);
  useEffect(() => () => { if (image?.url) URL.revokeObjectURL(image.url); }, [image]);

  const save = async () => {
    const body = new FormData();
    body.append('pageText', text);
    body.append('pageNumber', page.pageNumber);
    if (image) body.append('image', image.file);
    setSaving(true);
    const [error, data] = await catchError(authFetch({
      path: `/book/${bookId}/page/${page._id}/edit`,
      method: 'POST',
      body,
    }));
    setSaving(false);
    if (error) return toast.error(error.message || `Could not save page ${page.pageNumber}`);
    setImage(null);
    onSaved(data);
    toast.success(`Page ${page.pageNumber} saved`);
  };

  const imageUrl = image?.url || page.image_url;

  return (
    <article className={`adm-page${imageUrl ? '' : ' no-image'}`} id={`page-${page.pageNumber}`}>
      <div>
        <div className="adm-page-head">
          <span className="adm-page-number">
            Page {page.pageNumber}
            {dirty && <span className="adm-hint"> · unsaved changes</span>}
          </span>
          <div className="adm-row-actions">
            <input
              ref={imageInput}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setImage({ file, url: URL.createObjectURL(file) });
                e.target.value = '';
              }}
            />
            <button type="button" className="adm-icon-btn" title={imageUrl ? 'Replace image' : 'Add image'} aria-label={imageUrl ? 'Replace image' : 'Add image'} onClick={() => imageInput.current?.click()}>
              <Image size={16} />
            </button>
            <button type="button" className="adm-icon-btn danger" title="Delete page" aria-label={`Delete page ${page.pageNumber}`} onClick={() => onDelete(page)}>
              <Trash2 size={16} />
            </button>
            <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={save} disabled={!dirty || saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <textarea
          className="adm-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Page ${page.pageNumber} text`}
        />
      </div>
      {imageUrl && <img className="adm-page-image" src={imageUrl} alt={`Page ${page.pageNumber} art`} loading="lazy" />}
    </article>
  );
}

export default function AdminPagesPage() {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newText, setNewText] = useState('');
  const [newImage, setNewImage] = useState(null); // { file, url }
  const [creating, setCreating] = useState(false);
  const formRef = useRef(null);

  const fetchPages = async () => {
    setLoading(true);
    setError(null);
    const [err, data] = await catchError(authFetch({ path: `/book/${bookId}/page` }));
    if (err) setError(err.message || 'Could not load pages');
    if (data) setPages([...data].sort((a, b) => a.pageNumber - b.pageNumber));
    setLoading(false);
  };

  useEffect(() => {
    fetchPages();
    catchError(authFetch({ path: `/book/${bookId}` })).then(([, data]) => data && setBook(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const deletePage = async (page) => {
    if (!window.confirm(`Delete page ${page.pageNumber}? Later pages move up by one. This cannot be undone.`)) return;
    const [err] = await catchError(authFetch({ path: `/book/${bookId}/page/${page._id}/delete`, method: 'POST' }));
    if (err) return toast.error(err.message || 'Could not delete the page');
    toast.success(`Page ${page.pageNumber} deleted`);
    fetchPages(); // the server renumbers the pages after it
  };

  const createPage = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return toast.error('Write some text for the page');
    const pageNumber = (pages[pages.length - 1]?.pageNumber || 0) + 1;
    const body = new FormData();
    body.append('pageText', newText);
    body.append('pageNumber', pageNumber);
    if (newImage) body.append('image', newImage.file);
    setCreating(true);
    const [err, data] = await catchError(authFetch({ path: `/book/${bookId}/page/new`, method: 'POST', body }));
    setCreating(false);
    if (err) return toast.error(err.message || 'Could not add the page');
    setPages(prev => [...prev, data]);
    setNewText('');
    setNewImage(null);
    toast.success(`Page ${pageNumber} added`);
  };

  const nextNumber = (pages[pages.length - 1]?.pageNumber || 0) + 1;

  return (
    <AdminLayout
      title="Pages"
      eyebrow={book?.title || 'Book'}
      subtitle={pages.length ? `${pages.length} page${pages.length !== 1 ? 's' : ''}. Edit text in place and save each page.` : undefined}
      back={{ to: `/admin/books/${bookId}`, label: 'Back to book' }}
      actions={pages.length > 0 && (
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          <Plus size={16} />Add page
        </button>
      )}
    >
      {error && <Notice onRetry={fetchPages}>{error}</Notice>}

      {loading ? (
        <Loading label="Loading pages…" />
      ) : pages.length === 0 && !error ? (
        <EmptyState icon={FileText} title="No pages yet" text="Add pages one at a time below, or upload the book text from Edit details." />
      ) : (
        <div className="adm-pages">
          {pages.map(page => (
            <PageCard
              key={page._id}
              bookId={bookId}
              page={page}
              onDelete={deletePage}
              onSaved={(saved) => setPages(prev => prev.map(p => (p._id === saved._id ? saved : p)))}
            />
          ))}
        </div>
      )}

      {!loading && (
        <section className="adm-section" ref={formRef}>
          <div className="adm-section-head">
            <h2 className="adm-section-title">Add page {nextNumber}</h2>
          </div>
          <form className="adm-card adm-form" onSubmit={createPage}>
            <Field label="Text" htmlFor="new-page-text">
              <textarea id="new-page-text" className="adm-textarea" value={newText} onChange={(e) => setNewText(e.target.value)} rows={8} />
            </Field>
            <Field label="Image" hint="Optional. PNG, JPG or WebP.">
              <FileDrop
                accept="image/png, image/jpeg, image/webp"
                label="Add an illustration"
                hint="Click to choose, or drop an image here"
                fileName={newImage?.file.name}
                previewUrl={newImage?.url}
                onFile={(file) => setNewImage({ file, url: URL.createObjectURL(file) })}
                onClear={() => setNewImage(null)}
              />
            </Field>
            <div className="adm-form-actions">
              <button type="submit" className="ui-btn ui-btn-primary" disabled={creating}>
                <Plus size={16} />
                {creating ? 'Adding…' : 'Add page'}
              </button>
            </div>
          </form>
        </section>
      )}
    </AdminLayout>
  );
}
