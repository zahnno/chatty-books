import React from "react";
import { ArrowLeft } from "react-feather";
import { Link } from "react-router-dom";

// Slim top bar for screens inside a book (character picker, chat): back to the book.
export default function BookHeader({ book, children }) {
  return (
    <header className="app-header book-bar scrolled">
      <div className="header-content">
        <Link
          className="header-icon-button"
          to={book?._id ? `/books/${book._id}` : '/'}
          aria-label={book?.title ? `Back to ${book.title}` : 'Back'}
        >
          <ArrowLeft size={20} />
        </Link>
        <span className="book-bar-title">{book?.title || 'Chatty Books'}</span>
        {children}
      </div>
    </header>
  );
}
