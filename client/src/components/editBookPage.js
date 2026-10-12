import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen } from 'react-feather';
import NewBookPage from './newBookPage';
import { catchError, authFetch } from "../utils.js";
import { AdminLayout, EmptyState, Loading } from './admin/AdminUI';

export default function EditBookPage() {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBook = async () => {
      const [err, data] = await catchError(authFetch({ path: `/book/${bookId}` }));
      if (data) setBook(data);
      if (err) setError(err.message || 'Could not load this book');
    };
    fetchBook();
  }, [bookId]);

  // Render the form only once the book has loaded, so it never shows (and saves as) a new book.
  if (book) return <NewBookPage book={book} />;

  return (
    <AdminLayout title="Edit book" back={{ to: `/admin/books/${bookId}`, label: 'Back to book' }} wide={false}>
      {error ? <EmptyState icon={BookOpen} title="Book not available" text={error} /> : <Loading label="Loading book…" />}
    </AdminLayout>
  );
}
