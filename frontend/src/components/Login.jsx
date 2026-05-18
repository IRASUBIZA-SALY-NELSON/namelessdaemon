import React, { useState, useRef, useEffect, useCallback } from 'react';
import { User, Lock, Eye, EyeOff, Moon, Sun, Star, Cloud, Mountain, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../config/api';

const Login = () => {
  const { login } = useAuth();
  const isSubmitting = useRef(false);
  const submissionTime = useRef(0);
  const formRef = useRef(null);
  const loginTimeoutRef = useRef(null);
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState({ username: false, password: false });
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [typedText, setTypedText] = useState('');
  const fullText = 'Irasubiza Saly Nelson';
  const [greeting, setGreeting] = useState({ text: 'Hello!', icon: 'sun' });
  const [typingDone, setTypingDone] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState({ type: '', text: '' });

  // Debounced login function to prevent React StrictMode double calls
  const debouncedLogin = useCallback(async (username, password) => {
    // Clear any existing timeout
    if (loginTimeoutRef.current) {
      clearTimeout(loginTimeoutRef.current);
    }

    // Return a promise that resolves after a short delay
    return new Promise((resolve) => {
      loginTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await login(username, password);
          resolve(result);
        } catch (error) {
          resolve(false);
        }
      }, 100); // 100ms delay to prevent double calls
    });
  }, [login]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = Date.now();
    if (isSubmitting.current || isLoading || (now - submissionTime.current < 2000)) {
      return;
    }

    if (!credentials.username || !credentials.password) {
      setError('Please enter username and password');
      return;
    }

    submissionTime.current = now;
    isSubmitting.current = true;
    setError('');
    setIsLoading(true);
    setLoadingMessage('Signing in...');

    const currentCredentials = { ...credentials };

    try {
      const success = await debouncedLogin(currentCredentials.username, currentCredentials.password);

      if (!success) {
        setError('Invalid username or password');
        setIsLoading(false);
        setLoadingMessage('');
        isSubmitting.current = false;
        submissionTime.current = 0;
        return;
      }

      setLoadingMessage('Welcome! Taking you in...');
      setCredentials({ username: '', password: '' });
      if (formRef.current) {
        formRef.current.reset();
      }
    } catch {
      setError('Login failed. Please try again.');
      setIsLoading(false);
      setLoadingMessage('');
      isSubmitting.current = false;
      submissionTime.current = 0;
    }
  };

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  // Update greeting based on time of day
  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      let newGreeting = { text: 'Hello!', icon: 'sun' };

      if (hour >= 5 && hour < 12) {
        newGreeting = { text: 'Good Morning', icon: 'sun' };
      } else if (hour >= 12 && hour < 17) {
        newGreeting = { text: 'Good Afternoon', icon: 'sun' };
      } else if (hour >= 17 && hour < 22) {
        newGreeting = { text: 'Good Evening', icon: 'moon' };
      } else {
        newGreeting = { text: 'Good Night', icon: 'moon' };
      }

      setGreeting(newGreeting);
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Typing animation effect
  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index <= fullText.length) {
        setTypedText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(typeInterval);
        setTypingDone(true);
      }
    }, 150);

    return () => clearInterval(typeInterval);
  }, []);

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setForgotLoading(true);
    setForgotMessage({ type: '', text: '' });

    try {
      const response = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await response.json();
      setForgotMessage({ type: 'success', text: data.message });
      // Keep it open for 3 seconds to let them read the message
      setTimeout(() => {
        if (response.ok) {
          setShowForgotPassword(false);
          setForgotEmail('');
          setForgotMessage({ type: '', text: '' });
        }
      }, 3000);
    } catch (err) {
      setForgotMessage({ type: 'error', text: 'Something went wrong. Please try again later.' });
    } finally {
      setForgotLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isSubmitting.current = false;
      submissionTime.current = 0;
      if (loginTimeoutRef.current) {
        clearTimeout(loginTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="login-wrapper">
      {/* Left Side - Background Image with Overlay */}
      <div className="login-left">
        <div className="login-left-bg"></div>
        <div className="login-left-overlay"></div>

        {/* Animated Decorations */}
        <div className="floating-elements">
          <div className="floating-star star-1"><Star size={16} fill="white" /></div>
          <div className="floating-star star-2"><Star size={12} fill="white" /></div>
          <div className="floating-star star-3"><Star size={20} fill="white" /></div>
          <div className="floating-star star-4"><Star size={14} fill="white" /></div>
          <div className="floating-star star-5"><Star size={10} fill="white" /></div>
          <div className="floating-cloud cloud-1"><Cloud size={48} /></div>
          <div className="floating-cloud cloud-2"><Cloud size={36} /></div>
          <div className="floating-moon">
            <div className="moon-glow"></div>
            <Moon size={80} fill="#fbbf24" stroke="#f59e0b" />
          </div>
        </div>

        <div className="login-left-content">
          <div className="brand-section">
            <h2 className="brand-title">{typedText}{!typingDone && <span className="typing-cursor">|</span>}</h2>
            <p className="brand-subtitle">Organize my day, achieve your goals</p>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="login-right">
        <div className={`login-form-container ${isLoading ? 'is-loading' : ''}`}>
          {isLoading && (
            <div className="login-inline-loader" role="status" aria-live="polite">
              <div className="login-inline-spinner">
                <Loader2 size={36} strokeWidth={2.5} />
              </div>
              <p className="login-inline-message">{loadingMessage}</p>
            </div>
          )}
          <div className={`login-form-panel ${isLoading ? 'dimmed' : ''}`}>
          <div className="login-header">
            <div className={`greeting-badge ${greeting.icon}`}>
              {greeting.icon === 'sun' ? <Sun size={16} /> : <Moon size={16} />}
              <span>{greeting.text}</span>
            </div>
            <h1 className="login-title">Login to your account</h1>
            <p className="login-subtitle">Welcome back! Please enter your details</p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className={`form-group ${isFocused.username ? 'focused' : ''}`}>
              <label htmlFor="username" className="form-label">Username</label>
              <div className="input-wrapper">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={credentials.username}
                  onChange={handleChange}
                  onFocus={() => setIsFocused({ ...isFocused, username: true })}
                  onBlur={() => setIsFocused({ ...isFocused, username: false })}
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className={`form-group ${isFocused.password ? 'focused' : ''}`}>
              <label htmlFor="password" className="form-label">Password</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={credentials.password}
                  onChange={handleChange}
                  onFocus={() => setIsFocused({ ...isFocused, password: true })}
                  onBlur={() => setIsFocused({ ...isFocused, password: false })}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="remember-me">
                <input type="checkbox" />
                <span className="checkmark"></span>
                <span className="remember-text">Remember me</span>
              </label>
              <button
                type="button"
                className="forgot-link"
                onClick={() => setShowForgotPassword(true)}
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={isLoading}
            >
              <span className="btn-text">{isLoading ? 'Signing in...' : 'Login'}</span>
              <div className="btn-shine"></div>
            </button>
          </form>

          <div className="login-footer">
            <p>Irasubiza Saly Nelson © 2026. All rights reserved.</p>
          </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="forgot-modal-overlay" onClick={() => setShowForgotPassword(false)}>
          <div className="forgot-modal" onClick={(e) => e.stopPropagation()}>
            <div className="forgot-modal-header">
              <div className="forgot-icon-wrapper">
                <div className="forgot-icon-pulse"></div>
                <Lock size={28} />
              </div>
              <h3 className="forgot-title">Reset Password</h3>
              <p className="forgot-subtitle">Enter your email and we'll send you reset instructions</p>
              <button
                className="forgot-close"
                onClick={() => setShowForgotPassword(false)}
              >
                ×
              </button>
            </div>

            <form className="forgot-form" onSubmit={handleForgotPassword}>
              {forgotMessage.text && (
                <div className={`modal-message ${forgotMessage.type}`} style={{
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginBottom: '16px',
                  textAlign: 'center',
                  background: forgotMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  color: forgotMessage.type === 'success' ? '#16a34a' : '#dc2626',
                  border: `1px solid ${forgotMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                }}>
                  {forgotMessage.text}
                </div>
              )}
              <div className="forgot-input-wrapper">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="forgot-input"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  disabled={forgotLoading}
                />
              </div>
              <button type="submit" className="forgot-submit" disabled={forgotLoading}>
                <span>{forgotLoading ? 'Sending...' : 'Send Reset Link'}</span>
                {!forgotLoading && <div className="forgot-btn-shine"></div>}
              </button>
            </form>

            <div className="forgot-back">
              <button onClick={() => setShowForgotPassword(false)}>
                ← Back to Login
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        .login-wrapper {
          min-height: 100vh;
          display: flex;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }

        /* Left Side Styles */
        .login-left {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .login-left-bg {
          position: absolute;
          inset: 0;
          background-image: url('/background.jpg');
          background-size: cover;
          background-position: center;
          filter: brightness(0.7);
          animation: slowZoom 20s ease-in-out infinite alternate;
        }

        @keyframes slowZoom {
          from { transform: scale(1); }
          to { transform: scale(1.1); }
        }

        .login-left-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(102, 126, 234, 0.9) 0%,
            rgba(118, 75, 162, 0.85) 50%,
            rgba(168, 85, 247, 0.8) 100%
          );
        }

        /* Floating Elements Animation */
        .floating-elements {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .floating-star {
          position: absolute;
          color: rgba(255, 255, 255, 0.8);
          animation: twinkle 3s ease-in-out infinite;
        }

        .star-1 { top: 15%; left: 20%; animation-delay: 0s; }
        .star-2 { top: 25%; right: 25%; animation-delay: 0.5s; }
        .star-3 { top: 10%; left: 50%; animation-delay: 1s; }
        .star-4 { top: 40%; left: 15%; animation-delay: 1.5s; }
        .star-5 { top: 20%; right: 15%; animation-delay: 2s; }

        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        .floating-cloud {
          position: absolute;
          color: rgba(255, 255, 255, 0.15);
          animation: float 8s ease-in-out infinite;
        }

        .cloud-1 { top: 30%; left: 10%; animation-delay: 0s; }
        .cloud-2 { top: 60%; right: 20%; animation-delay: 3s; }

        @keyframes float {
          0%, 100% { transform: translateX(0) translateY(0); }
          25% { transform: translateX(20px) translateY(-10px); }
          50% { transform: translateX(-10px) translateY(5px); }
          75% { transform: translateX(15px) translateY(-5px); }
        }

        .floating-moon {
          position: absolute;
          top: 20%;
          right: 30%;
          animation: moonFloat 6s ease-in-out infinite;
        }

        .moon-glow {
          position: absolute;
          inset: -20px;
          background: radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%);
          border-radius: 50%;
          animation: moonPulse 3s ease-in-out infinite;
        }

        @keyframes moonFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }

        @keyframes moonPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }

        .login-left-content {
          position: relative;
          z-index: 10;
          text-align: center;
          color: white;
          padding: 40px;
          max-width: 400px;
          animation: slideInLeft 1s ease-out;
        }

        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-50px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .brand-section {
          margin-bottom: 40px;
        }

        .brand-title {
          font-size: 36px;
          font-weight: 800;
          margin-bottom: 12px;
          text-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
        }

        .brand-subtitle {
          font-size: 16px;
          font-weight: 400;
          opacity: 0.9;
        }

        .features-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.1);
          padding: 14px 20px;
          border-radius: 12px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          transition: all 0.3s ease;
          animation: slideUp 0.8s ease-out;
          animation-fill-mode: both;
        }

        .feature-item:nth-child(1) { animation-delay: 0.2s; }
        .feature-item:nth-child(2) { animation-delay: 0.4s; }
        .feature-item:nth-child(3) { animation-delay: 0.6s; }

        .feature-item:hover {
          transform: translateX(10px);
          background: rgba(255, 255, 255, 0.2);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .feature-icon {
          width: 36px;
          height: 36px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .feature-item span {
          font-size: 15px;
          font-weight: 500;
        }

        /* Right Side Styles */
        .login-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          padding: 40px;
          position: relative;
        }

        .login-right::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 100px;
          background: linear-gradient(90deg, rgba(102, 126, 234, 0.05) 0%, transparent 100%);
        }

        .login-form-container {
          position: relative;
          width: 100%;
          max-width: 420px;
          animation: slideInRight 0.8s ease-out;
        }

        .login-form-panel.dimmed {
          opacity: 0.35;
          pointer-events: none;
          user-select: none;
          filter: blur(1px);
        }

        .login-inline-loader {
          position: absolute;
          inset: 0;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          background: rgba(255, 255, 255, 0.92);
          border-radius: 16px;
          animation: loginLoaderFadeIn 0.25s ease;
        }

        @keyframes loginLoaderFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .login-inline-spinner {
          color: #667eea;
          animation: loginSpin 0.9s linear infinite;
        }

        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }

        .login-inline-message {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          color: #334155;
          text-align: center;
        }

        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .login-header {
          margin-bottom: 40px;
        }

        .greeting-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 20px;
          animation: bounceIn 0.6s ease-out;
          transition: all 0.5s ease;
        }

        .greeting-badge.sun {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          color: #92400e;
        }

        .greeting-badge.moon {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          color: #e2e8f0;
        }

        @keyframes bounceIn {
          0% { opacity: 0; transform: scale(0.3); }
          50% { transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }

        .login-title {
          font-size: 32px;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }

        .login-subtitle {
          font-size: 15px;
          color: #64748b;
          font-weight: 400;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .error-message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 14px 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: shake 0.5s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: all 0.3s ease;
        }

        .form-group.focused {
          transform: translateY(-2px);
        }

        .form-label {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          color: #9ca3af;
          transition: all 0.3s ease;
          z-index: 1;
        }

        .form-group.focused .input-icon {
          color: #667eea;
        }

        .input-wrapper input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          border: 2px solid #e5e7eb;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 500;
          color: #1f2937;
          background: #fafafa;
          transition: all 0.3s ease;
          outline: none;
        }

        .input-wrapper input:focus {
          border-color: #667eea;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
        }

        .input-wrapper input::placeholder {
          color: #9ca3af;
          font-weight: 400;
        }

        .password-toggle {
          position: absolute;
          right: 16px;
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .password-toggle:hover {
          color: #667eea;
          background: rgba(102, 126, 234, 0.1);
        }

        .form-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: -8px;
        }

        .remember-me {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-size: 14px;
          color: #4b5563;
          font-weight: 500;
        }

        .remember-me input {
          display: none;
        }

        .checkmark {
          width: 20px;
          height: 20px;
          border: 2px solid #d1d5db;
          border-radius: 6px;
          position: relative;
          transition: all 0.2s ease;
        }

        .remember-me input:checked + .checkmark {
          background: #667eea;
          border-color: #667eea;
        }

        .remember-me input:checked + .checkmark::after {
          content: '';
          position: absolute;
          left: 5px;
          top: 1px;
          width: 6px;
          height: 12px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .forgot-link {
          font-size: 14px;
          font-weight: 600;
          color: #667eea;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .forgot-link:hover {
          color: #764ba2;
          text-decoration: underline;
        }

        .login-button {
          position: relative;
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 16px;
          font-weight: 700;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
          margin-top: 8px;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(102, 126, 234, 0.5);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent
          );
          animation: shine 3s infinite;
        }

        @keyframes shine {
          0% { left: -100%; }
          100% { left: 200%; }
        }

        .btn-text {
          position: relative;
          z-index: 1;
        }

        .login-footer {
          margin-top: 40px;
          text-align: center;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
        }

        .login-footer p {
          font-size: 13px;
          color: #9ca3af;
          font-weight: 500;
        }

        /* Typing Cursor */
        .typing-cursor {
          display: inline-block;
          animation: blink 1s infinite;
          color: rgba(255, 255, 255, 0.8);
          margin-left: 2px;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        /* Forgot Password Modal */
        .forgot-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: overlayFadeIn 0.3s ease;
          padding: 20px;
        }

        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .forgot-modal {
          background: white;
          border-radius: 24px;
          width: 100%;
          max-width: 420px;
          padding: 40px;
          position: relative;
          animation: modalSlideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
        }

        @keyframes modalSlideUp {
          from {
            opacity: 0;
            transform: translateY(60px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .forgot-modal-header {
          text-align: center;
          margin-bottom: 32px;
          position: relative;
        }

        .forgot-icon-wrapper {
          width: 70px;
          height: 70px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          color: white;
          position: relative;
        }

        .forgot-icon-pulse {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 2px solid #667eea;
          animation: iconPulse 2s ease-out infinite;
        }

        @keyframes iconPulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0; }
        }

        .forgot-title {
          font-size: 26px;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 8px;
        }

        .forgot-subtitle {
          font-size: 15px;
          color: #64748b;
          line-height: 1.5;
        }

        .forgot-close {
          position: absolute;
          top: -20px;
          right: -20px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: #f3f4f6;
          color: #6b7280;
          font-size: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .forgot-close:hover {
          background: #e5e7eb;
          color: #374151;
          transform: rotate(90deg);
        }

        .forgot-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .forgot-input-wrapper {
          position: relative;
        }

        .forgot-input {
          width: 100%;
          padding: 16px 20px;
          border: 2px solid #e5e7eb;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 500;
          color: #1f2937;
          background: #fafafa;
          transition: all 0.3s ease;
          outline: none;
        }

        .forgot-input:focus {
          border-color: #667eea;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
        }

        .forgot-input::placeholder {
          color: #9ca3af;
        }

        .forgot-submit {
          position: relative;
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 16px;
          font-weight: 700;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        }

        .forgot-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(102, 126, 234, 0.5);
        }

        .forgot-btn-shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          animation: shine 3s infinite;
        }

        .forgot-back {
          margin-top: 24px;
          text-align: center;
        }

        .forgot-back button {
          background: none;
          border: none;
          color: #667eea;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 8px 16px;
          border-radius: 8px;
        }

        .forgot-back button:hover {
          color: #764ba2;
          background: rgba(102, 126, 234, 0.1);
        }

        /* Responsive Design */
        @media (max-width: 900px) {
          .login-wrapper {
            flex-direction: column;
          }

          .login-left {
            min-height: 300px;
            padding: 30px;
          }

          .login-left-content {
            max-width: 100%;
          }

          .brand-section {
            margin-bottom: 20px;
          }

          .login-right {
            padding: 30px;
          }

          .login-right::before {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .login-left {
            min-height: 250px;
            padding: 20px;
          }

          .brand-title {
            font-size: 28px;
          }

          .login-title {
            font-size: 26px;
          }

          .login-right {
            padding: 24px;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;
