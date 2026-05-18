import axios from 'axios';

import { apiUrl } from '../config/api';

const API_URL = apiUrl('/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  const chatSession = localStorage.getItem('chatSessionToken');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (chatSession) headers['X-Chat-Session'] = chatSession;
  return headers;
};

const onChatApiError = (error) => {
  const status = error.response?.status;
  const code = error.response?.data?.code;

  if (status === 401 && code === 'JWT_SESSION_EXPIRED') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('chatSessionToken');
    window.dispatchEvent(new CustomEvent('auth:session-expired'));
    return Promise.reject(error);
  }

  if (status === 403 && code === 'CHAT_SESSION_REQUIRED') {
    localStorage.removeItem('chatSessionToken');
    import('./chatCache').then((m) => m.clearChatApiCache());
    window.dispatchEvent(new CustomEvent('chat:session-required'));
  }
  return Promise.reject(error);
};

const chatGet = (url) => axios.get(url, { headers: getAuthHeader() }).catch(onChatApiError);
const chatPost = (url, body) =>
  axios.post(url, body ?? {}, { headers: getAuthHeader() }).catch(onChatApiError);

export const getChatUsers = () => chatGet(`${API_URL}/chat/users`);

export const getDirectMessages = (userId1, userId2) =>
  chatGet(`${API_URL}/chat/messages/direct/${userId1}/${userId2}`);

export const getChannelMessages = (channelId) =>
  chatGet(`${API_URL}/chat/messages/channel/${channelId}`);

export const markAsRead = (messageId) =>
  chatPost(`${API_URL}/chat/messages/${messageId}/read`);

export const markAsUnread = (messageId) =>
  chatPost(`${API_URL}/chat/messages/${messageId}/unread`);

export const markAllAsRead = (recipientId, senderId) =>
  chatPost(`${API_URL}/chat/messages/read-all/${recipientId}/${senderId}`);

export const getChatProfile = (userId) =>
  chatGet(`${API_URL}/chat/users/${userId}/profile`);

export const getUnreadCounts = () =>
  chatGet(`${API_URL}/chat/unread`);

export const sendPresenceHeartbeat = () =>
  chatPost(`${API_URL}/chat/presence/heartbeat`);
