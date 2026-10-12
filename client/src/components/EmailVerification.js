import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { SERVER_URI } from '../constants';
import { Mail, CheckCircle, XCircle, Loader } from 'react-feather';
import { AuthHero } from './loginUser';
import './LoginUser.css';

export default function EmailVerification() {
  const [verificationStatus, setVerificationStatus] = useState('verifying');
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setVerificationStatus('error');
        return;
      }

      try {
        const response = await fetch(`${SERVER_URI}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (response.ok) {
          setVerificationStatus('success');
          toast.success('Email verified successfully!');
          setTimeout(() => navigate('/login'), 3000);
        } else {
          setVerificationStatus('error');
          toast.error(data.message || 'Verification failed');
        }
      } catch (error) {
        console.error('Verification error:', error);
        setVerificationStatus('error');
        toast.error('An error occurred during verification');
      }
    };

    verifyEmail();
  }, [token, navigate]);

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    try {
      const response = await fetch(`${SERVER_URI}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Verification email sent successfully');
      } else {
        toast.error(data.message || 'Failed to resend verification email');
      }
    } catch (error) {
      toast.error('An error occurred while resending verification email');
    }
  };

  return (
    <div className="auth-page">
      <AuthHero />

      <div className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-form-header">
            <h2 className="auth-form-title">Email Verification</h2>
          </div>

          {verificationStatus === 'verifying' && (
            <div className="verification-status">
              <div className="status-icon verifying">
                <Loader size={48} />
              </div>
              <h2>Verifying your email...</h2>
              <p className="auth-form-subtitle">Please wait while we confirm your email address.</p>
            </div>
          )}

          {verificationStatus === 'success' && (
            <div className="verification-status">
              <div className="status-icon success">
                <CheckCircle size={48} />
              </div>
              <h2>Email Verified!</h2>
              <p className="auth-form-subtitle">Your email has been confirmed. Redirecting to login...</p>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="verification-status">
              <div className="status-icon error">
                <XCircle size={48} />
              </div>
              <h2>Verification Failed</h2>
              <p className="auth-form-subtitle">The verification link may be invalid or expired.</p>

              <div className="auth-form" style={{ marginTop: '1.5rem' }}>
                <div className="auth-form-field">
                  <label className="auth-label">Email Address</label>
                  <div className="auth-input-group">
                    <Mail size={18} className="auth-input-icon" />
                    <input
                      className="auth-input"
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  className="auth-button primary"
                  onClick={handleResendVerification}
                >
                  Resend Verification Email
                </button>
                <button
                  className="auth-button secondary"
                  onClick={() => navigate('/login')}
                >
                  Back to Login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .verification-status {
          text-align: center;
          margin: 2rem 0;
        }
        .status-icon {
          margin: 1.5rem 0;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .status-icon.success { color: var(--success-color); }
        .status-icon.error { color: var(--danger-color); }
        .status-icon.verifying {
          color: var(--accent-color);
          animation: spin 1s linear infinite;
        }
        .verification-status h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 1rem 0 0.5rem 0;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
