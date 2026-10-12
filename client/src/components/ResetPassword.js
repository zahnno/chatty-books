import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Lock, Eye, EyeOff } from 'react-feather';
import { SERVER_URI } from '../constants';
import { AuthHero } from './loginUser';
import './LoginUser.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const token = searchParams.get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${SERVER_URI}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Password reset successfully');
        navigate('/login');
      } else {
        toast.error(data.message || 'Failed to reset password');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <AuthHero />
        <div className="auth-form-panel">
          <div className="auth-form-container">
            <div className="auth-form-header">
              <h2 className="auth-form-title">Invalid reset link</h2>
              <p className="auth-form-subtitle">This password reset link is invalid or has expired.</p>
            </div>
            <button
              className="auth-button primary"
              onClick={() => navigate('/forgot-password')}
            >
              Request New Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <AuthHero />
      <div className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-form-header">
            <h2 className="auth-form-title">Reset your password</h2>
            <p className="auth-form-subtitle">Enter your new password below</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-form-field">
              <label className="auth-label">New password</label>
              <div className="auth-input-group">
                <Lock size={18} className="auth-input-icon" />
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  className="auth-input"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="auth-visibility-toggle"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                >
                  {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="auth-form-field">
              <label className="auth-label">Confirm password</label>
              <div className="auth-input-group">
                <Lock size={18} className="auth-input-icon" />
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  className="auth-input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <button
              type="submit"
              className="auth-button primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
