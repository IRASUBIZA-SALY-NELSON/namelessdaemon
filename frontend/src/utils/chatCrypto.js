/**
 * Client-side chat encryption (opaque payload, not readable as plain base64 text).
 * v2: AES-256-GCM with app pepper. Legacy: double-base64 (still decryptable).
 */

const PEPPER = import.meta.env.VITE_CHAT_PEPPER || 'rca-taskflow-secure-v2';
const PREFIX = 'v2:';

let keyPromise;

function b64Encode(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function b64Decode(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey() {
  if (!keyPromise) {
    const material = new TextEncoder().encode(PEPPER);
    const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
    keyPromise = crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('rca-chat-salt'),
        iterations: 120000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  return keyPromise;
}

function legacyEncode(msg) {
  try {
    return btoa(btoa(unescape(encodeURIComponent(msg))));
  } catch {
    return btoa(btoa(msg));
  }
}

function legacyDecode(encoded) {
  try {
    const stage1 = atob(encoded);
    const stage2 = atob(stage1);
    try {
      return decodeURIComponent(escape(stage2));
    } catch {
      return stage2;
    }
  } catch {
    return encoded;
  }
}

export async function encryptMessage(plain) {
  if (!plain) return '';
  if (!crypto?.subtle) return legacyEncode(plain);

  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plain)
    );
    return `${PREFIX}${b64Encode(iv)}.${b64Encode(new Uint8Array(cipher))}`;
  } catch {
    return legacyEncode(plain);
  }
}

export async function decryptMessage(encoded) {
  if (!encoded) return '';

  if (!encoded.startsWith(PREFIX)) {
    return legacyDecode(encoded);
  }

  if (!crypto?.subtle) {
    return legacyDecode(encoded.replace(PREFIX, ''));
  }

  try {
    const payload = encoded.slice(PREFIX.length);
    const [ivPart, dataPart] = payload.split('.');
    if (!ivPart || !dataPart) return legacyDecode(encoded);

    const key = await getKey();
    const iv = b64Decode(ivPart);
    const data = b64Decode(dataPart);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    return legacyDecode(encoded);
  }
}

export function looksEncrypted(content) {
  if (!content) return false;
  return content.startsWith(PREFIX) || /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 32));
}
