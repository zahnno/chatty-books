import React, { useState } from 'react'
import { SERVER_URI } from "../constants.js";
import Cookies from "universal-cookie";
import { useNavigate, NavLink } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { toast } from 'react-toastify';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Eye, EyeOff } from 'react-feather';
import { AuthHero } from './loginUser';
import './LoginUser.css';

export default function RegisterUser() {
  const navigate = useNavigate();
  const cookies = new Cookies();
  const { authenticate } = useAuth();
  const { isDarkMode } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const registerUser = async () => {
    if (!email) return toast.error('Please provide email.');
    if (!password) return toast.error('Please provide password');
    if (password.length < 6) return toast.error('Password must be at least 6 characters long');
    if (password !== confirmPassword) return toast.error('Passwords do not match');

    try {
      const response = await fetch(`${SERVER_URI}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data?.message || "Unknown Error Occurred");
        return;
      }

      if (data.requiresVerification) {
        localStorage.setItem('pendingVerificationEmail', email);
        setVerificationSent(true);
        toast.success(data.message);
      } else {
        toast.success(`Hello ${email}! Sign up successful!`);
        const previousRoute = localStorage.getItem('previousRoute');
        if (previousRoute) {
          localStorage.setItem('postLoginRoute', previousRoute);
        }
        navigate('/login');
      }
    } catch (error) {
      toast.error(error.message || "An error occurred during registration");
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const response = await fetch(`${SERVER_URI}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });

      if (!response.ok) throw new Error('Google authentication failed');

      const data = await response.json();
      cookies.set('token', data.token, { path: '/' });
      await authenticate();

      const postLoginRoute = localStorage.getItem('postLoginRoute');
      const previousRoute = localStorage.getItem('previousRoute');

      let redirectTo = '/settings';
      if (postLoginRoute &&
          !postLoginRoute.includes('verify-email') &&
          !postLoginRoute.includes('reset-password') &&
          !postLoginRoute.includes('forgot-password')) {
        redirectTo = postLoginRoute;
      } else if (previousRoute &&
                 !previousRoute.includes('verify-email') &&
                 !previousRoute.includes('reset-password') &&
                 !previousRoute.includes('forgot-password')) {
        redirectTo = previousRoute;
      }

      localStorage.removeItem('previousRoute');
      localStorage.removeItem('postLoginRoute');
      navigate(redirectTo);
      toast.success('Account created successfully!');
    } catch (error) {
      console.error('Google auth error:', error);
      toast.error('Google authentication failed');
    }
  };

  const handleResendVerification = async () => {
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

  if (verificationSent) {
    return (
      <div className="auth-page">
        <AuthHero />
        <div className="auth-form-panel">
          <div className="auth-form-container">
            <div className="auth-form-header">
              <h2 className="auth-form-title">Check your email</h2>
              <p className="auth-form-subtitle">We've sent a verification link to your email address.</p>
            </div>

            <div className="auth-verification-box">
              <p>Please check your email and click the verification link to complete your registration.</p>
              <p>If you don't see the email, check your spam folder.</p>
            </div>

            <div className="auth-form">
              <button className="auth-button primary" onClick={handleResendVerification}>
                Resend verification email
              </button>
              <button className="auth-button secondary" onClick={() => navigate('/login')}>
                Back to sign in
              </button>
            </div>
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
            <h2 className="auth-form-title">Create your account</h2>
            <p className="auth-form-subtitle">Join thousands of readers bringing stories to life</p>
          </div>

          <div className="auth-form">
            <div className="auth-form-field">
              <label className="auth-label">Email</label>
              <div className="auth-input-group">
                <Mail size={18} className="auth-input-icon" />
                <input
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="auth-form-field">
              <label className="auth-label">Password</label>
              <div className="auth-input-group">
                <Lock size={18} className="auth-input-icon" />
                <input
                  className="auth-input"
                  type={isPasswordVisible ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  className="auth-visibility-toggle"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  type="button"
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
                  className="auth-input"
                  type={isConfirmPasswordVisible ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
                <button
                  className="auth-visibility-toggle"
                  onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
                  type="button"
                >
                  {isConfirmPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button className="auth-button primary" onClick={registerUser}>
              Create account
            </button>

            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            <div className="auth-oauth-buttons">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google authentication failed')}
                theme={isDarkMode ? "filled_black" : "outline"}
                shape="pill"
                text="continue_with"
                width="100%"
              />
            </div>

            <p className="auth-legal">
              By continuing, you agree to our <NavLink to="/terms" className="auth-link">Terms of Service</NavLink> and{' '}
              <NavLink to="/privacy" className="auth-link">Privacy Policy</NavLink>, including our community rules.
            </p>

            <p className="auth-footer">
              Already have an account?
              <NavLink to="/login" className="auth-link">
                Sign in
              </NavLink>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
