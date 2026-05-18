/**
 * Single API base for all environments.
 *
 * Dev (vite): empty base → relative /api/* proxied to backend on :8081.
 * Works for http://localhost:3000 and http://10.x.x.x:3000 (LAN).
 *
 * Prod frontends (Vercel): nelsonsaly.vercel.app, namelessdaemon.vercel.app
 * Prod API (Render): task-manager-1-2xsi.onrender.com
 * Override with VITE_API_BASE_URL in .env if needed.
 */
const PRODUCTION_API = 'https://task-manager-1-2xsi.onrender.com';

export const API_BASE = (() => {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.PROD) return PRODUCTION_API;
  return '';
})();

/** Build a full API path, e.g. apiUrl('/api/auth/login') */
export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

/** WebSocket / SockJS endpoint (dev uses same host as the page + vite /ws proxy). */
export function getWsUrl() {
  const fromEnv = import.meta.env.VITE_WS_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (import.meta.env.PROD) {
    return `${PRODUCTION_API}/ws`;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.host}/ws`;
  }

  return 'http://localhost:8081/ws';
}

/** Dev helper: true when API (via Vite proxy or direct) responds. */
export async function isBackendReachable() {
  try {
    const res = await fetch(apiUrl('/actuator/health'), { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Wait for Spring Boot on :8081 (dev only). */
export async function waitForBackend(maxAttempts = 40, intervalMs = 1500) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isBackendReachable()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
