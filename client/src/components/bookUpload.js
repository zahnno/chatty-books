import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Book, Image, Users } from 'react-feather';
import { authFetch, catchError } from '../utils.js';
import { AdminLayout, Field, FileDrop, Notice } from './admin/AdminUI';

const MAX_SIZE = 50 * 1024 * 1024;
const STEPS = [
  { icon: Book, title: 'Pages', text: 'The text is extracted and split into readable pages.' },
  { icon: Image, title: 'Cover', text: 'A matching cover is looked up by title and author.' },
  { icon: Users, title: 'Characters', text: 'Characters are found in the text and given profiles.' },
];

export default function BookUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pickFile = (selected) => {
    const ok = ['application/pdf', 'application/epub+zip', 'text/plain'].includes(selected.type) || /\.(pdf|epub|txt)$/i.test(selected.name);
    if (!ok) return setError('Use a PDF, EPUB or TXT file.');
    if (selected.size > MAX_SIZE) return setError('Files must be under 50MB.');
    setError('');
    setFile(selected);
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.append('bookFile', file);
    setUploading(true);
    setError('');
    const [err, data] = await catchError(authFetch({ path: '/book/upload', method: 'POST', body }));
    setUploading(false);
    if (err) return setError(err.message || 'The upload failed. Please try again.');
    toast.success(`Imported ${data.title || 'the book'}`);
    navigate(`/admin/books/${data._id}`);
  };

  return (
    <AdminLayout
      title="Import a book"
      eyebrow="Books"
      subtitle="Upload a manuscript and the book is set up automatically."
      back={{ to: '/admin/books', label: 'All books' }}
      wide={false}
    >
      <div className="adm-grid" style={{ marginBottom: 24 }}>
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="adm-tool" style={{ cursor: 'default' }}>
            <Icon size={18} />
            <div><strong>{title}</strong><span>{text}</span></div>
          </div>
        ))}
      </div>

      <form className="adm-card adm-form" onSubmit={upload}>
        {error && <Notice>{error}</Notice>}
        <Field label="Book file" hint="PDF, EPUB or TXT, up to 50MB. Processing can take a few minutes; keep this tab open.">
          <FileDrop
            accept=".pdf,.epub,.txt"
            label="Choose a file"
            hint="Click to choose, or drop it here"
            fileName={file ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)` : undefined}
            onFile={pickFile}
            onClear={uploading ? undefined : () => setFile(null)}
          />
        </Field>
        <div className="adm-form-actions">
          <button type="submit" className="ui-btn ui-btn-primary" disabled={!file || uploading}>
            {uploading && <span className="adm-spinner" />}
            {uploading ? 'Importing… this can take a few minutes' : 'Import book'}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
