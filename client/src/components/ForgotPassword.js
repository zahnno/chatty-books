import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Mail } from 'react-feather';
import { SERVER_URI } from '../constants';
import { AuthHero } from './loginUser';
import './LoginUser.css';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${SERVER_URI}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Password reset instructions sent to your email');
        navigate('/login');
      } else {
        toast.error(data.message || 'Failed to process request');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthHero />
      <div className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-form-header">
            <h2 className="auth-form-title">Reset password</h2>
            <p className="auth-form-subtitle">Enter your email address and we'll send you instructions to reset your password</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-form-field">
              <label className="auth-label">Email</label>
              <div className="auth-input-group">
                <Mail size={18} className="auth-input-icon" />
                <input
                  type="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <button
              type="submit"
              className="auth-button primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Reset Instructions'}
            </button>

            <button
              type="button"
              className="auth-button secondary"
              onClick={() => navigate('/login')}
              disabled={isSubmitting}
            >
              Back to Login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
