import React, { useState, useEffect } from 'react';
import { X, Zap, Clock, ArrowUp } from 'react-feather';
import { useNavigate } from 'react-router-dom';
import { authFetch, catchError } from '../utils.js';
import { useTheme } from '../context/ThemeContext';

export default function UsageExhaustedModal({ isOpen, onClose }) {
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchSubscriptionDetails();
    }
  }, [isOpen]);

  const fetchSubscriptionDetails = async () => {
    setLoading(true);
    const [error, data] = await catchError(authFetch({ 
      path: '/subscription/details', 
      method: 'GET' 
    }));
    
    if (data) {
      setSubscriptionDetails(data);
    }
    setLoading(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysUntilRenewal = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleUpgradeClick = () => {
    onClose();
    navigate('/settings', { state: { openSubscriptionModal: true } });
  };

  if (!isOpen) return null;

  return (
    <div className={`token-modal-overlay ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className={`token-modal ${isDarkMode ? 'dark-mode' : ''}`}>
        <button 
          className={`token-modal-close ${isDarkMode ? 'dark-mode' : ''}`}
          onClick={onClose}
        >
          <X size={24} />
        </button>

        <div className="token-modal-content">
          <div className={`token-modal-icon ${isDarkMode ? 'dark-mode' : ''}`}>
            <Zap size={48} />
          </div>

          <h2 className={`token-modal-title ${isDarkMode ? 'dark-mode' : ''}`}>
            You've reached your usage limit
          </h2>

          {loading ? (
            <div className="token-modal-loading">
              <p>Loading your subscription details...</p>
            </div>
          ) : subscriptionDetails ? (
            <div className="token-modal-details">
              <p className={`token-modal-description ${isDarkMode ? 'dark-mode' : ''}`}>
                You've reached the monthly limit for your <strong>{subscriptionDetails.subscription?.plan?.name || 'current'}</strong> subscription plan.
              </p>

              <div className={`token-modal-stats ${isDarkMode ? 'dark-mode' : ''}`}>
                {subscriptionDetails.subscription?.endDate && (
                  <div className="token-stat">
                    <span className="token-stat-label">Renews in</span>
                    <span className={`token-stat-value ${isDarkMode ? 'dark-mode' : ''}`}>
                      <Clock size={16} />
                      {getDaysUntilRenewal(subscriptionDetails.subscription.endDate)} days
                    </span>
                  </div>
                )}
              </div>

              <div className={`token-modal-options ${isDarkMode ? 'dark-mode' : ''}`}>
                <h3>What you can do:</h3>
                <ul>
                  <li>
                    <Clock size={16} />
                    <span>
                      Wait for your subscription to renew
                      {subscriptionDetails.subscription?.endDate && 
                        ` on ${formatDate(subscriptionDetails.subscription.endDate)}`
                      }
                    </span>
                  </li>
                  <li>
                    <ArrowUp size={16} />
                    <span>Upgrade to a higher tier plan for more monthly usage</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="token-modal-error">
              <p>Unable to load subscription details. Please try again later.</p>
            </div>
          )}

          <div className="token-modal-actions">
            <button 
              className={`token-modal-button primary ${isDarkMode ? 'dark-mode' : ''}`}
              onClick={handleUpgradeClick}
            >
              <ArrowUp size={16} />
              Upgrade plan
            </button>
            <button 
              className={`token-modal-button secondary ${isDarkMode ? 'dark-mode' : ''}`}
              onClick={onClose}
            >
              Got it
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .token-modal-overlay {
          position: fixed;
          inset: 0;
          background: var(--overlay);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1001;
          backdrop-filter: blur(4px);
        }

        .token-modal {
          position: relative;
          width: 90%;
          max-width: 440px;
          max-height: 90vh;
          overflow-y: auto;
          box-sizing: border-box;
          padding: 36px 32px 28px;
          border-radius: var(--radius-xl);
          background: var(--raised);
          color: var(--text-primary);
          box-shadow: var(--shadow-xl);
          animation: modalSlideIn 0.25s ease-out;
        }

        @keyframes modalSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
        }

        .token-modal-close {
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

        .token-modal-close:hover {
          background: var(--hover-background);
          color: var(--text-primary);
        }

        .token-modal-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .token-modal-icon {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          border-radius: 50%;
          background: var(--accent-soft);
          color: var(--accent);
        }

        .token-modal-icon svg {
          width: 28px;
          height: 28px;
        }

        .token-modal-title {
          margin: 0 0 12px;
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 600;
          line-height: 1.2;
          color: var(--text-primary);
        }

        .token-modal-description,
        .token-modal-loading p,
        .token-modal-error p {
          margin: 0 0 20px;
          color: var(--text-secondary);
          font-size: 15px;
          line-height: 1.6;
        }

        .token-modal-details {
          width: 100%;
        }

        .token-modal-stats {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .token-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px 20px;
          border-radius: var(--radius-md);
          background: var(--surface);
        }

        .token-stat-label {
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .token-stat-value {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: var(--text-primary);
          font-size: 16px;
          font-weight: 600;
        }

        .token-modal-options {
          margin-bottom: 24px;
          text-align: left;
        }

        .token-modal-options h3 {
          margin: 0 0 10px;
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
        }

        .token-modal-options ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .token-modal-options li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.5;
        }

        .token-modal-options li svg {
          flex-shrink: 0;
          margin-top: 2px;
          color: var(--text-muted);
        }

        .token-modal-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .token-modal-button {
          width: 100%;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: var(--radius-pill);
          font: inherit;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s ease, background-color 0.15s ease;
        }

        .token-modal-button.primary {
          border: none;
          background: var(--ink);
          color: var(--on-ink);
        }

        .token-modal-button.primary:hover {
          opacity: 0.86;
        }

        .token-modal-button.secondary {
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-primary);
        }

        .token-modal-button.secondary:hover {
          background: var(--hover-background);
        }
      `}</style>
    </div>
  );
} 