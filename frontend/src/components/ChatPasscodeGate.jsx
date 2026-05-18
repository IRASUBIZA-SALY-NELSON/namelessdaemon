import { useState, useEffect, useRef } from 'react';
import { Shield, Fingerprint, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  verifyChatPasscode,
  changeChatPasscode,
  setChatSessionToken,
  fetchWebAuthnRegisterOptions,
  completeWebAuthnRegister,
  fetchWebAuthnVerifyOptions,
  completeWebAuthnVerify,
} from '../api/chatSecurityApi';
import { registerPlatformBiometric, verifyPlatformBiometric, isWebAuthnSupported } from '../utils/webauthn';

const PASSCODE_LEN = 6;

const ChatPasscodeGate = ({ user, onVerified, showExit, onExit }) => {
  const { logout } = useAuth();
  const [digits, setDigits] = useState(Array(PASSCODE_LEN).fill(''));
  const [mode, setMode] = useState('verify'); // verify | setup
  const [confirmDigits, setConfirmDigits] = useState(Array(PASSCODE_LEN).fill(''));
  const [setupStep, setSetupStep] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(user?.chatLockedUntil || null);
  const inputRefs = useRef([]);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const mustSetup = user?.chatPasscodeMustChange && !isSuperAdmin;
  const biometricAvailable = isWebAuthnSupported();
  const hasBiometric = user?.webAuthnRegistered;

  useEffect(() => {
    if (mustSetup) {
      setMode('setup');
    }
  }, [mustSetup]);

  useEffect(() => {
    if (lockedUntil && Date.now() >= lockedUntil) {
      setLockedUntil(null);
    }
  }, [lockedUntil]);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  const focusIndex = (index) => {
    inputRefs.current[index]?.focus();
  };

  const handleDigitChange = (index, value, setter, values, nextSetter) => {
    if (isLocked || busy) return;
    const char = value.replace(/[^a-zA-Z0-9]/g, '').slice(-1);
    const next = [...values];
    next[index] = char;
    setter(next);
    setError('');
    if (char && index < PASSCODE_LEN - 1) {
      focusIndex(index + 1);
    }
    if (char && index === PASSCODE_LEN - 1 && setter === setDigits && mode === 'verify') {
      const code = next.join('');
      if (code.length === PASSCODE_LEN) {
        submitVerify(code);
      }
    }
  };

  const handleKeyDown = (index, e, values, setter) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      focusIndex(index - 1);
    }
  };

  const finishSession = (token, mustChange) => {
    if (token) setChatSessionToken(token);
    if (mustChange) {
      setMode('setup');
      setDigits(Array(PASSCODE_LEN).fill(''));
      return;
    }
    onVerified(token);
  };

  const submitVerify = async (code) => {
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await verifyChatPasscode(code);
      if (ok && data.success) {
        finishSession(data.chatSessionToken, data.mustChangePasscode);
      } else {
        setError(data.message || 'Incorrect passcode');
        if (data.lockedUntil) setLockedUntil(data.lockedUntil);
        setDigits(Array(PASSCODE_LEN).fill(''));
        focusIndex(0);
      }
    } catch {
      setError('Verification unavailable');
    } finally {
      setBusy(false);
    }
  };

  const submitSetup = async () => {
    const code = digits.join('');
    const confirm = confirmDigits.join('');
    if (!/^[a-zA-Z0-9]{6}$/.test(code)) {
      setError('Use exactly 6 letters or numbers');
      return;
    }
    if (code === '123456') {
      setError('Choose a personal passcode — not the default 123456');
      return;
    }
    if (code !== confirm) {
      setError('Passcodes do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await changeChatPasscode(code);
      if (ok && data.success) {
        finishSession(data.chatSessionToken, false);
      } else {
        setError(data.message || 'Could not save passcode');
      }
    } catch {
      setError('Could not save passcode');
    } finally {
      setBusy(false);
    }
  };

  const handleBiometricRegister = async () => {
    if (!biometricAvailable) {
      setError('Fingerprint / Face ID is not available on this device');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const options = await fetchWebAuthnRegisterOptions();
      const { credentialId, challenge } = await registerPlatformBiometric(options, user.username);
      const { ok, data } = await completeWebAuthnRegister(credentialId, challenge);
      if (ok && data.success) {
        finishSession(data.chatSessionToken, false);
      } else {
        setError(data.message || 'Biometric setup failed');
      }
    } catch (err) {
      setError(err.message || 'Biometric setup failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBiometricVerify = async () => {
    setBusy(true);
    setError('');
    try {
      const options = await fetchWebAuthnVerifyOptions();
      const { credentialId, challenge } = await verifyPlatformBiometric(options);
      const { ok, data } = await completeWebAuthnVerify(credentialId, challenge);
      if (ok && data.success) {
        finishSession(data.chatSessionToken, data.mustChangePasscode);
      } else {
        setError(data.message || 'Biometric verification failed');
        if (data.lockedUntil) setLockedUntil(data.lockedUntil);
      }
    } catch (err) {
      setError(err.message || 'Biometric verification failed');
    } finally {
      setBusy(false);
    }
  };

  const renderDigitInputs = (values, setter, startIdx = 0) => (
    <div className="passcode-digits" role="group" aria-label="Passcode">
      {values.map((d, i) => (
        <input
          key={`${startIdx}-${i}`}
          ref={(el) => { inputRefs.current[startIdx + i] = el; }}
          type="password"
          inputMode="text"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d}
          disabled={isLocked || busy}
          className="passcode-digit"
          onChange={(e) => handleDigitChange(i, e.target.value, setter, values, setter)}
          onKeyDown={(e) => handleKeyDown(i, e, values, setter)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );

  return (
    <div className="passcode-auth-overlay">
      <div className="passcode-card glass-morphism animate-fade-in">
        <div className="passcode-header">
          <div className="lock-icon-container">
            <Shield size={40} color="#2563eb" />
          </div>
          <h2>{mode === 'setup' ? 'Create your chat passcode' : 'Enter chat passcode'}</h2>
          <p>
            {mode === 'setup'
              ? 'First-time setup: choose a 6-character passcode (letters or numbers), or use fingerprint / Face ID.'
              : 'Enter your 6-digit passcode to open secure chat — like unlocking your phone.'}
          </p>
          {isLocked && (
            <p className="passcode-error" style={{ marginTop: 12 }}>
              Locked until {new Date(lockedUntil).toLocaleTimeString()}
            </p>
          )}
        </div>

        {mode === 'verify' && (
          <>
            {renderDigitInputs(digits, setDigits)}
            {error && <div className="passcode-error">{error}</div>}

            {hasBiometric && biometricAvailable && (
              <button
                type="button"
                className="passcode-biometric-btn"
                onClick={handleBiometricVerify}
                disabled={busy || isLocked}
              >
                <Fingerprint size={20} />
                Use fingerprint / Face ID
              </button>
            )}

            <button
              type="button"
              className="verify-submit-btn"
              disabled={busy || isLocked || digits.join('').length !== PASSCODE_LEN}
              onClick={() => submitVerify(digits.join(''))}
            >
              {busy ? <div className="spinner-small" /> : 'Unlock chat'}
            </button>
          </>
        )}

        {mode === 'setup' && (
          <>
            <p className="setup-step-label">
              <KeyRound size={14} /> Step {setupStep}: {setupStep === 1 ? 'New passcode' : 'Confirm passcode'}
            </p>
            {setupStep === 1 ? renderDigitInputs(digits, setDigits) : renderDigitInputs(confirmDigits, setConfirmDigits, 6)}
            {error && <div className="passcode-error">{error}</div>}

            {setupStep === 1 ? (
              <button
                type="button"
                className="verify-submit-btn"
                disabled={digits.join('').length !== PASSCODE_LEN}
                onClick={() => {
                  if (!/^[a-zA-Z0-9]{6}$/.test(digits.join(''))) {
                    setError('Use exactly 6 letters or numbers');
                    return;
                  }
                  if (digits.join('') === '123456') {
                    setError('Choose a personal passcode — not the default 123456');
                    return;
                  }
                  setSetupStep(2);
                  setError('');
                  setTimeout(() => focusIndex(6), 50);
                }}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="verify-submit-btn"
                disabled={busy || confirmDigits.join('').length !== PASSCODE_LEN}
                onClick={submitSetup}
              >
                {busy ? <div className="spinner-small" /> : 'Save passcode'}
              </button>
            )}

            {biometricAvailable && (
              <button
                type="button"
                className="passcode-biometric-btn"
                onClick={handleBiometricRegister}
                disabled={busy}
              >
                <Fingerprint size={20} />
                Use fingerprint / Face ID instead
              </button>
            )}
          </>
        )}

        <div className="passcode-footer-actions">
          {showExit && onExit && (
            <button type="button" className="passcode-back-btn" onClick={onExit}>
              Exit Secure Chat
            </button>
          )}
          <button type="button" className="passcode-logout-btn" onClick={logout}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </div>

      <style>{`
        .passcode-auth-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%);
          backdrop-filter: blur(40px);
          z-index: 1000;
          padding: 20px;
        }
        .passcode-card {
          background: rgba(255, 255, 255, 0.9);
          padding: 40px 36px;
          border-radius: 28px;
          width: 100%;
          max-width: 440px;
          text-align: center;
          box-shadow: 0 32px 64px -16px rgba(0,0,0,0.1);
          border: 1px solid rgba(255,255,255,0.6);
        }
        .lock-icon-container {
          width: 72px;
          height: 72px;
          background: #eff6ff;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }
        .passcode-header h2 {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 8px;
        }
        .passcode-header p {
          color: #64748b;
          font-size: 14px;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        .passcode-error {
          color: #ef4444;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .verify-submit-btn {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          margin-bottom: 12px;
        }
        .verify-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .passcode-footer-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 8px;
        }
        .passcode-back-btn {
          background: none;
          border: none;
          color: #64748b;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }
        .passcode-logout-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #dc2626;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }
        .passcode-logout-btn:hover {
          background: #fee2e2;
        }
        .spinner-small {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .passcode-digits {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-bottom: 20px;
        }
        .passcode-digit {
          width: 44px;
          height: 52px;
          border-radius: 12px;
          border: 2px solid #e2e8f0;
          background: #fff;
          font-size: 22px;
          font-weight: 700;
          text-align: center;
          text-transform: uppercase;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .passcode-digit:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
        }
        .passcode-biometric-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px;
          margin-bottom: 12px;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #334155;
          font-weight: 600;
          cursor: pointer;
        }
        .passcode-biometric-btn:hover:not(:disabled) {
          background: #f1f5f9;
        }
        .passcode-biometric-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .setup-step-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 13px;
          color: #64748b;
          margin-bottom: 16px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default ChatPasscodeGate;
