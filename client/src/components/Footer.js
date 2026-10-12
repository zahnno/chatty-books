import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import '../styles/footer.css';

const Footer = () => {
  const { isDarkMode } = useTheme();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="footer-wordmark">
            <img src={isDarkMode ? '/book-logo-dark.png' : '/book-logo-light.png'} alt="" />
            <span>Chatty Books</span>
          </Link>
          <p>Read the classics, then talk them over with the people inside them.</p>
        </div>
        <nav className="footer-columns" aria-label="Footer">
          <div className="footer-column">
            <h3>Explore</h3>
            <Link to="/books">Library</Link>
            <Link to="/characters">Characters</Link>
            <Link to="/gallery">Gallery</Link>
          </div>
          <div className="footer-column">
            <h3>Company</h3>
            <Link to="/about">About</Link>
            <Link to="/help">Help</Link>
          </div>
          <div className="footer-column">
            <h3>Legal</h3>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </nav>
      </div>
      <div className="footer-legal">
        © {new Date().getFullYear()} Hayden Bulk Tech Labs Inc.
      </div>
    </footer>
  );
};

export default Footer;
