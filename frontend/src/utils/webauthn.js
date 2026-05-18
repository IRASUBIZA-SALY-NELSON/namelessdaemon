const bufferFromBase64Url = (value) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const bufferToBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const isWebAuthnSupported = () =>
  typeof window !== 'undefined'
  && window.PublicKeyCredential
  && typeof window.PublicKeyCredential === 'function';

export const registerPlatformBiometric = async (options, username) => {
  if (!isWebAuthnSupported()) {
    throw new Error('Biometric authentication is not supported on this device');
  }

  const publicKey = {
    challenge: bufferFromBase64Url(options.challenge),
    rp: {
      name: options.rp?.name || 'TaskFlow',
      id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    },
    user: {
      id: new TextEncoder().encode(username),
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    },
    timeout: options.timeout || 60000,
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) {
    throw new Error('Biometric registration was cancelled');
  }

  return {
    credentialId: bufferToBase64Url(credential.rawId),
    challenge: options.challenge,
  };
};

export const verifyPlatformBiometric = async (options) => {
  if (!isWebAuthnSupported()) {
    throw new Error('Biometric authentication is not supported on this device');
  }

  const allowCredentials = (options.allowCredentials || []).map((cred) => ({
    type: 'public-key',
    id: bufferFromBase64Url(cred.id),
  }));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: bufferFromBase64Url(options.challenge),
      allowCredentials,
      timeout: options.timeout || 60000,
      userVerification: 'required',
    },
  });

  if (!assertion) {
    throw new Error('Biometric verification was cancelled');
  }

  return {
    credentialId: bufferToBase64Url(assertion.rawId),
    challenge: options.challenge,
  };
};
