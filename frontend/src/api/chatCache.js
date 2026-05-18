import {
  getChatUsers,
  getChannelMessages,
  getDirectMessages,
  getUnreadCounts,
  getChatProfile,
} from './chatApi';

/** In-flight + session cache — each resource fetched once until logout / passcode reset. */

const inflight = new Map();
let usersCache = null;
let unreadCache = null;
let chatBootstrapped = false;
const channelCache = new Map();
const dmCache = new Map();
const profileCache = new Map();

function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve(fn()).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export function clearChatApiCache() {
  usersCache = null;
  unreadCache = null;
  chatBootstrapped = false;
  channelCache.clear();
  dmCache.clear();
  profileCache.clear();
  inflight.clear();
}

export function isChatBootstrapped() {
  return chatBootstrapped;
}

export function markChatBootstrapped() {
  chatBootstrapped = true;
}

/** Sidebar list already loaded — avoid another GET /api/chat/users */
export function getCachedChatUsers() {
  return usersCache;
}

export async function fetchChatUsersCached({ force = false } = {}) {
  if (!force && usersCache) return usersCache;
  return dedupe('chat-users', async () => {
    const res = await getChatUsers();
    usersCache = res.data || [];
    return usersCache;
  });
}

export async function fetchUnreadCountsCached({ force = false } = {}) {
  if (!force && unreadCache) return unreadCache;
  return dedupe('chat-unread', async () => {
    const res = await getUnreadCounts();
    unreadCache = res.data || {};
    return unreadCache;
  });
}

export async function fetchChannelMessagesCached(channelId, { force = false } = {}) {
  if (!force && channelCache.has(channelId)) {
    return channelCache.get(channelId);
  }
  return dedupe(`channel-${channelId}`, async () => {
    const res = await getChannelMessages(channelId);
    const data = res.data || [];
    channelCache.set(channelId, data);
    return data;
  });
}

export async function fetchDirectMessagesCached(userId1, userId2, { force = false } = {}) {
  const key = [userId1, userId2].sort().join(':');
  if (!force && dmCache.has(key)) return dmCache.get(key);
  return dedupe(`dm-${key}`, async () => {
    const res = await getDirectMessages(userId1, userId2);
    const data = res.data || [];
    dmCache.set(key, data);
    return data;
  });
}

/** After sending a message, append locally instead of refetching the whole channel. */
export function appendToChannelCache(channelId, message) {
  const list = channelCache.get(channelId);
  if (list) channelCache.set(channelId, [...list, message]);
}

export function appendToDmCache(userId1, userId2, message) {
  const key = [userId1, userId2].sort().join(':');
  const list = dmCache.get(key);
  if (list) dmCache.set(key, [...list, message]);
}

export function patchUnreadCache(updater) {
  unreadCache = updater(unreadCache || {});
  return unreadCache;
}

export async function fetchChatProfileCached(userId, { force = false } = {}) {
  if (!userId) return null;
  if (!force && profileCache.has(userId)) {
    return profileCache.get(userId);
  }
  return dedupe(`profile-${userId}`, async () => {
    const res = await getChatProfile(userId);
    const data = res.data;
    profileCache.set(userId, data);
    return data;
  });
}

/** Build a minimal profile DTO from sidebar row (no network). */
export function profileFromChatUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    profilePicture: u.profilePicture,
    chatEnabled: u.chatEnabled,
    online: u.online,
    lastSeenAt: u.lastSeenAt,
    email: null,
  };
}
