import React, { useState, useEffect } from 'react'
import { SERVER_URI } from "../constants.js";
import Cookies from "universal-cookie";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { toast } from 'react-toastify';
import { Eye, EyeOff, Mail, Lock } from 'react-feather';
import { useAuth } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { useTheme } from '../context/ThemeContext';
import './LoginUser.css';

// Left-hand panel shared by the sign-in, sign-up and password screens.
function AuthHero() {
  return (
    <aside className="auth-hero">
      <figure className="auth-hero-quote">
        <blockquote>
          “I declare after all there is no enjoyment like reading! How much sooner one tires
          of any thing than of a book!”
        </blockquote>
        <figcaption>Caroline Bingley, <cite>Pride and Prejudice</cite></figcaption>
      </figure>
      <p className="auth-hero-subtitle">
        Read the classics, listen along, and talk them over with the characters themselves.
      </p>
    </aside>
  );
}

export { AuthHero };

export default function LoginUser() {
  const navigate = useNavigate();
  const location = useLocation();
  const cookies = new Cookies();
  const { authenticate } = useAuth();
  const { isDarkMode } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (token) {
      cookies.set('token', token, { path: '/' });
      authenticate();
      navigate('/settings');
    }
  }, [location]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      loginUser();
    }
  };

  const loginUser = async () => {
    if (!email) return toast.error('Please provide email.');
    if (!password) return toast.error('Please provide password');

    try {
      const response = await fetch(`${SERVER_URI}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.requiresVerification) {
        setVerificationEmail(email);
        setShowVerification(true);
        toast.info(data.message);
        return;
      }

      if (!response.ok) {
        toast.error(data?.message || "Login failed");
        return;
      }

      cookies.set('token', data.token, { path: '/' });
      await authenticate();
      toast.success('Login successful!');

      const postLoginRoute = localStorage.getItem('postLoginRoute');
      const previousRoute = localStorage.getItem('previousRoute');

      let redirectTo = '/settings';
      if (postLoginRoute && !postLoginRoute.includes('verify-email') && !postLoginRoute.includes('reset-password')) {
        redirectTo = postLoginRoute;
      } else if (previousRoute && !previousRoute.includes('verify-email') && !previousRoute.includes('reset-password')) {
        redirectTo = previousRoute;
      }

      localStorage.removeItem('previousRoute');
      localStorage.removeItem('postLoginRoute');
      navigate(redirectTo);
    } catch (error) {
      toast.error(error.message || "An error occurred during login");
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
      toast.success('Login successful!');
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
        body: JSON.stringify({ email: verificationEmail })
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

  if (showVerification) {
    return (
      <div className="auth-page">
        <AuthHero />
        <div className="auth-form-panel">
          <div className="auth-form-container">
            <div className="auth-form-header">
              <h2 className="auth-form-title">Verify your email</h2>
              <p className="auth-form-subtitle">Please check your email and verify your account before logging in.</p>
            </div>

            <div className="auth-verification-box">
              <p>We sent a verification link to: <strong>{verificationEmail}</strong></p>
              <p>If you don't see the email, check your spam folder.</p>
            </div>

            <div className="auth-form">
              <button className="auth-button primary" onClick={handleResendVerification}>
                Resend verification email
              </button>
              <button className="auth-button secondary" onClick={() => setShowVerification(false)}>
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
            <h2 className="auth-form-title">Welcome back</h2>
            <p className="auth-form-subtitle">Sign in to continue your reading journey</p>
          </div>

          <div className="auth-form">
            <div className="auth-form-field">
              <label className="auth-label">Email</label>
              <div className="auth-input-group">
                <Mail size={18} className="auth-input-icon" />
                <input
                  type="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>
            </div>

            <div className="auth-form-field">
              <label className="auth-label">Password</label>
              <div className="auth-input-group">
                <Lock size={18} className="auth-input-icon" />
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  className="auth-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <button
                  className="auth-visibility-toggle"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  type="button"
                >
                  {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <NavLink to="/forgot-password" className="auth-forgot-password">
                Forgot password?
              </NavLink>
            </div>

            <button className="auth-button primary" onClick={loginUser}>
              Sign in
            </button>

            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            <div className="auth-oauth-buttons">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google authentication failed')}
                useOneTap
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
              Don't have an account?
              <NavLink to="/register" className="auth-link">
                Sign up
              </NavLink>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
