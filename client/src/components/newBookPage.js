import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { catchError, authFetch } from "../utils.js";
import { AdminLayout, Field, FileDrop } from './admin/AdminUI';

const CATEGORIES = [
  'Fiction', 'Non-Fiction', 'Mystery', 'Science Fiction', 'Fantasy', 'Romance', 'Thriller',
  'Horror', 'Biography', 'History', 'Children', 'Young Adult', 'Educational'
];

const EMPTY_BOOK = {
  title: '',
  author: '',
  tagline: '',
  description: '',
  ageGroup: '',
  readingTime: '',
  categories: [],
  is_public: true,
  is_featured: false,
};

const toForm = (book) => ({
  ...EMPTY_BOOK,
  ...Object.fromEntries(Object.keys(EMPTY_BOOK).map(key => [key, book[key] ?? EMPTY_BOOK[key]])),
});

// Create a book, or edit one when `book` is passed (see editBookPage.js).
export default function NewBookPage({ book }) {
  const navigate = useNavigate();
  const isEdit = Boolean(book);
  const [form, setForm] = useState(() => (book ? toForm(book) : EMPTY_BOOK));
  const [cover, setCover] = useState(null); // { file, url }
  const [coverCleared, setCoverCleared] = useState(false);
  const [bookFile, setBookFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (book) setForm(toForm(book));
  }, [book]);

  useEffect(() => () => { if (cover?.url) URL.revokeObjectURL(cover.url); }, [cover]);

  const set = (name, value) => setForm(prev => ({ ...prev, [name]: value }));

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    set(name, type === 'checkbox' ? checked : value);
  };

  const toggleCategory = (category) => {
    set('categories', form.categories.includes(category)
      ? form.categories.filter(c => c !== category)
      : [...form.categories, category]);
  };

  const pickCover = (file) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.error('Use a JPG, PNG or WebP image');
    if (file.size > 5 * 1024 * 1024) return toast.error('Cover images must be under 5MB');
    setCover({ file, url: URL.createObjectURL(file) });
    setCoverCleared(false);
  };

  const pickBookFile = (file) => {
    const ok = ['text/plain', 'application/pdf', 'application/epub+zip'].includes(file.type) || /\.(txt|pdf|epub)$/i.test(file.name);
    if (!ok) return toast.error('Use a .txt, .pdf or .epub file');
    if (file.size > 10 * 1024 * 1024) return toast.error('Book files must be under 10MB');
    setBookFile(file);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Give the book a title');
    if (isEdit && bookFile && !window.confirm('Uploading a new book file replaces every existing page of this book. Continue?')) return;

    const body = new FormData();
    body.append('title', form.title.trim());
    body.append('author', form.author.trim());
    body.append('tagline', form.tagline.trim());
    body.append('description', form.description.trim());
    body.append('ageGroup', form.ageGroup.trim());
    if (form.readingTime !== '' && form.readingTime != null) body.append('readingTime', form.readingTime);
    body.append('categories', JSON.stringify(form.categories));
    body.append('is_public', form.is_public);
    body.append('is_featured', form.is_featured);
    if (cover) body.append('image', cover.file);
    else if (coverCleared && isEdit) body.append('clearImage', 'true');
    if (bookFile) body.append('bookFile', bookFile);

    setSaving(true);
    const [error, data] = await catchError(authFetch({
      path: isEdit ? `/book/${book._id}/edit` : '/book/new',
      method: 'POST',
      body,
    }));
    setSaving(false);

    if (error || !data?._id) {
      return toast.error(`Could not ${isEdit ? 'update' : 'create'} the book${error?.message ? `: ${error.message}` : ''}`);
    }
    toast.success(isEdit ? 'Book updated' : 'Book created');
    navigate(`/admin/books/${data._id}`);
  };

  const existingCover = isEdit && !coverCleared ? book.image_url : null;
  const coverPreview = cover?.url || existingCover;
  const cancelTo = isEdit ? `/admin/books/${book._id}` : '/admin/books';

  return (
    <AdminLayout
      title={isEdit ? 'Edit book' : 'New book'}
      eyebrow={isEdit ? book.title : 'Books'}
      back={{ to: cancelTo, label: isEdit ? 'Back to book' : 'All books' }}
      wide={false}
    >
      <form className="adm-card adm-form" onSubmit={save}>
        <Field label="Title" htmlFor="title">
          <input id="title" name="title" className="adm-input" value={form.title} onChange={handleChange} required autoFocus={!isEdit} />
        </Field>

        <div className="adm-form-row">
          <Field label="Author" htmlFor="author">
            <input id="author" name="author" className="adm-input" value={form.author} onChange={handleChange} />
          </Field>
          <Field label="Tagline" htmlFor="tagline">
            <input id="tagline" name="tagline" className="adm-input" value={form.tagline} onChange={handleChange} placeholder="One line that sells it" />
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <textarea id="description" name="description" className="adm-textarea" value={form.description} onChange={handleChange} rows={5} />
        </Field>

        <div className="adm-form-row">
          <Field label="Age group" htmlFor="ageGroup">
            <input id="ageGroup" name="ageGroup" className="adm-input" value={form.ageGroup} onChange={handleChange} placeholder="e.g. 8-12, Adult" />
          </Field>
          <Field label="Reading time (minutes)" htmlFor="readingTime">
            <input id="readingTime" name="readingTime" type="number" min="1" className="adm-input" value={form.readingTime} onChange={handleChange} />
          </Field>
        </div>

        <Field label="Categories">
          <div className="ui-chip-row adm-chip-select">
            {CATEGORIES.map(category => (
              <button
                key={category}
                type="button"
                className={`ui-chip${form.categories.includes(category) ? ' active' : ''}`}
                aria-pressed={form.categories.includes(category)}
                onClick={() => toggleCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Visibility">
          <div className="adm-checks">
            <label className="adm-check">
              <input type="checkbox" name="is_public" checked={!!form.is_public} onChange={handleChange} />
              Public
            </label>
            <label className="adm-check">
              <input type="checkbox" name="is_featured" checked={!!form.is_featured} onChange={handleChange} />
              Featured
            </label>
          </div>
        </Field>

        <Field label="Cover image" hint="2:3 ratio works best (600 x 900). JPG, PNG or WebP, up to 5MB.">
          <FileDrop
            accept="image/png, image/jpeg, image/webp"
            label={coverPreview ? 'Replace cover' : 'Upload a cover'}
            hint="Click to choose, or drop an image here"
            fileName={cover?.file.name}
            previewUrl={coverPreview}
            onFile={pickCover}
            onClear={() => { setCover(null); setCoverCleared(true); }}
          />
        </Field>

        <Field
          label="Book content"
          hint={isEdit
            ? 'Optional. A new file replaces all existing pages. .txt, .pdf or .epub, up to 10MB.'
            : 'Optional. Split into pages automatically. .txt, .pdf or .epub, up to 10MB.'}
        >
          <FileDrop
            accept=".txt,.pdf,.epub"
            label="Upload the book text"
            hint="Click to choose, or drop a file here"
            fileName={bookFile?.name}
            onFile={pickBookFile}
            onClear={() => setBookFile(null)}
          />
        </Field>

        <div className="adm-form-actions">
          <button type="submit" className="ui-btn ui-btn-primary" disabled={saving}>
            {saving ? (bookFile ? 'Saving and processing…' : 'Saving…') : isEdit ? 'Save changes' : 'Create book'}
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => navigate(cancelTo)} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
