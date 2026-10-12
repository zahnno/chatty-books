import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, BookOpen, Film, MessageCircle, Headphones } from 'react-feather';
import { useTheme } from '../context/ThemeContext';

const LoginModal = ({ isOpen, onClose, title = "Keep reading", message = "You've reached the end of the free preview. Sign in to read the rest of the book." }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode } = useTheme();

  if (!isOpen) return null;

  const handleSignIn = () => {
    navigate('/login', { 
      state: { 
        from: location.pathname, 
        message: 'Sign in to continue reading this book.' 
      } 
    });
  };

  const handleRegister = () => {
    navigate('/register', { 
      state: { 
        from: location.pathname, 
        message: 'Create an account to continue reading this book.' 
      } 
    });
  };

  return (
    <>
      <style>{`
        .login-modal-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1002;
          background: var(--overlay);
          backdrop-filter: blur(4px);
        }

        .login-modal {
          position: relative;
          width: 90%;
          max-width: 440px;
          max-height: 90vh;
          overflow-y: auto;
          box-sizing: border-box;
          padding: 40px 32px 28px;
          border-radius: var(--radius-xl);
          background: var(--raised);
          color: var(--text-primary);
          box-shadow: var(--shadow-xl);
          animation: loginModalIn 0.25s ease-out;
        }

        @keyframes loginModalIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
        }

        .login-modal-content {
          text-align: center;
        }

        .login-modal-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .login-modal h2 {
          margin: 0 0 12px;
          font-family: var(--font-display);
          font-size: 28px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .login-modal-message {
          margin: 0 0 28px;
          color: var(--text-secondary);
          font-size: 15px;
          line-height: 1.6;
        }

        .login-modal-features {
          margin-bottom: 28px;
          padding: 16px 20px;
          border-radius: var(--radius-md);
          background: var(--surface);
          text-align: left;
        }

        .login-modal .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 0;
          color: var(--text-primary);
          font-size: 14px;
        }

        .login-modal .feature-icon {
          display: flex;
          flex-shrink: 0;
          color: var(--accent);
        }

        .login-modal-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .login-btn {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: var(--radius-pill);
          font: inherit;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s ease, background-color 0.15s ease;
        }

        .login-btn.primary {
          background: var(--ink);
          color: var(--on-ink);
        }

        .login-btn.primary:hover {
          opacity: 0.86;
        }

        .login-btn.secondary {
          background: transparent;
          border-color: var(--border-color);
          color: var(--text-primary);
        }

        .login-btn.secondary:hover {
          background: var(--hover-background);
        }

        .login-modal-footer {
          margin-top: 18px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .login-modal .modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .login-modal .modal-close:hover {
          background: var(--hover-background);
          color: var(--text-primary);
        }

        @media (max-width: 480px) {
          .login-modal {
            padding: 32px 20px 24px;
          }

          .login-modal h2 {
            font-size: 24px;
          }
        }
      `}</style>
      
      <div className="login-modal-overlay" onClick={onClose}>
        <div className={`login-modal ${isDarkMode ? 'dark-mode' : ''}`} onClick={e => e.stopPropagation()}>
          <button className={`modal-close ${isDarkMode ? 'dark-mode' : ''}`} onClick={onClose}>
            <X size={24} />
          </button>
          
          <div className="login-modal-content">
            <div className="login-modal-icon">
              <img
                src={isDarkMode ? '/book-logo-dark.png' : '/book-logo-light.png'}
                alt="Book logo"
                style={{ width: 64, height: 64 }}
              />
            </div>
            
            <h2>{title}</h2>
            <p className="login-modal-message">
              {message}
            </p>
            
            <div className="login-modal-features">
              <div className="feature-item">
                <span className="feature-icon"><BookOpen size={18} /></span>
                <span>Unlimited reading access</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon"><Film size={18} /></span>
                <span>AI-generated scene images & videos</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon"><MessageCircle size={18} /></span>
                <span>Chat with book characters</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon"><Headphones size={18} /></span>
                <span>Audiobook narration</span>
              </div>
            </div>
            
            <div className="login-modal-actions">
              <button
                className={`login-btn primary ${isDarkMode ? 'dark-mode' : ''}`}
                onClick={handleSignIn}
              >
                Sign in to continue
              </button>
              
              <button
                className={`login-btn secondary ${isDarkMode ? 'dark-mode' : ''}`}
                onClick={handleRegister}
              >
                Create a free account
              </button>
            </div>
            
            <div className="login-modal-footer">
              <span>Free pages: 1-2 • Full access with account</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginModal; 