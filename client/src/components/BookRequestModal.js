import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { authFetch, catchError } from '../utils';

const BookRequestModal = ({ isOpen, onClose }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { isDarkMode } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const [error, data] = await catchError(authFetch({
        path: '/book-request',
        method: 'POST',
        body: { title, author }
      }));

      if (error) {
        setError(error.message || 'Failed to submit book request');
        return;
      }

      if (data.success) {
        setSuccess('Book request submitted successfully!');
        setTitle('');
        setAuthor('');
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit book request');
    }
  };

  if (!isOpen) return null;

  return (
    <div className={isOpen ? "book-request-modal-overlay" : "hidden"}>
      <div className={`book-request-modal-content${isDarkMode ? " dark" : ""}`}>
        <div className="book-request-modal-header">Request Book</div>
        <div className="book-request-modal-subtitle">We'll see what we can do to get your book on Chatty Books!</div>
        <form onSubmit={handleSubmit}>
          <div className="book-request-form-group">
            <label htmlFor="book-title">Title</label>
            <input
              id="book-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter book title"
            />
          </div>
          <div className="book-request-form-group">
            <label htmlFor="book-author">Author</label>
            <input
              id="book-author"
              type="text"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="Enter author name"
            />
          </div>
          {error && <div className="book-request-error-message">{error}</div>}
          {success && <div className="book-request-success-message">{success}</div>}
          <div className="book-request-modal-footer">
            <button type="button" className="book-request-cancel-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="book-request-submit-button">Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookRequestModal; 