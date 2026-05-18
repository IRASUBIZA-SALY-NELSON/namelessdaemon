import { apiUrl } from '../config/api';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const CHAT_SESSION_KEY = 'chatSessionToken';

export const getChatSessionToken = () => localStorage.getItem(CHAT_SESSION_KEY);

export const setChatSessionToken = (token) => {
  if (token) {
    localStorage.setItem(CHAT_SESSION_KEY, token);
  } else {
    localStorage.removeItem(CHAT_SESSION_KEY);
  }
};

export const clearChatSessionToken = () => localStorage.removeItem(CHAT_SESSION_KEY);

export const verifyChatPasscode = async (passcode) => {
  const res = await fetch(apiUrl('/api/users/verify-chat-passcode'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ passcode }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

export const changeChatPasscode = async (newPasscode) => {
  const res = await fetch(apiUrl('/api/users/change-chat-passcode'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ newPasscode }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};

export const fetchWebAuthnRegisterOptions = async () => {
  const res = await fetch(apiUrl('/api/users/webauthn/register-options'), {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Could not start biometric registration');
  return res.json();
};

export const completeWebAuthnRegister = async (credentialId, challenge) => {
  const res = await fetch(apiUrl('/api/users/webauthn/register'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ credentialId, challenge }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};

export const fetchWebAuthnVerifyOptions = async () => {
  const res = await fetch(apiUrl('/api/users/webauthn/verify-options'), {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Biometric not registered');
  return res.json();
};

export const completeWebAuthnVerify = async (credentialId, challenge) => {
  const res = await fetch(apiUrl('/api/users/webauthn/verify'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ credentialId, challenge }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};
