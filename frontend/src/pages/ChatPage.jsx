import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Send, Search, User, MessageSquare, Hash, Check, CheckCheck,
  MoreVertical, Phone, Video, Info, Paperclip, Smile, Shield,
  Mic, Square, Image, File, Download, X, Play, Pause, LogOut
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ChatPasscodeGate from '../components/ChatPasscodeGate';
import { getChatSessionToken, setChatSessionToken, clearChatSessionToken } from '../api/chatSecurityApi';
import { canAppearInChatList } from '../utils/roles';
import { markAllAsRead, markAsUnread, markAsRead, sendPresenceHeartbeat } from '../api/chatApi';
import {
  clearChatApiCache,
  fetchChatUsersCached,
  fetchChannelMessagesCached,
  fetchDirectMessagesCached,
  fetchUnreadCountsCached,
  isChatBootstrapped,
  markChatBootstrapped,
  getCachedChatUsers,
} from '../api/chatCache';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { format, formatDistanceToNow } from 'date-fns';
import { getWsUrl, waitForBackend } from '../config/api';
import { encryptMessage, decryptMessage } from '../utils/chatCrypto';
import ChatProfilePanel from '../components/ChatProfilePanel';

const formatPresence = (online, lastSeenAt) => {
  if (online) return 'Active now';
  if (!lastSeenAt) return 'Offline';
  return `Last seen ${formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true })}`;
};

const MessageReceipt = ({ status }) => {
  if (status === 'READ') {
    return <CheckCheck size={14} className="msg-receipt read" />;
  }
  if (status === 'DELIVERED') {
    return <CheckCheck size={14} className="msg-receipt delivered" />;
  }
  return <Check size={14} className="msg-receipt sent" />;
};

const mergeMessage = (prev, body) => {
  // If we already have this real message ID, just update it in place.
  if (body.id && prev.some((m) => m.id === body.id)) {
    return prev.map((m) => (m.id === body.id ? { ...m, ...body } : m));
  }

  // Find a matching optimistic placeholder to replace (same sender, within 5s).
  if (body.id) {
    const optIdx = prev.findIndex(
      (m) =>
        String(m.id || '').startsWith('opt-') &&
        m.senderId === body.senderId &&
        Math.abs(new Date(m.timestamp) - new Date(body.timestamp)) < 5000
  );
    if (optIdx !== -1) {
      // Replace the optimistic entry with the confirmed message.
      const next = [...prev];
      next[optIdx] = { ...prev[optIdx], ...body };
      return next;
    }
  }

  // No match — just append.
  return [...prev, body];
};

const ChatPage = ({ onBack, canLeaveChat = false }) => {
  const { user, isSuperAdmin, roleFlags, refreshUser, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState({ id: 'GENERAL', isChannel: true, username: 'General Channel' });
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stompClient, setStompClient] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callType, setCallType] = useState(null);
  const [pendingAttachment, setPendingAttachment] = useState(null); // { type, data, name, size }
  const [revealedMessages, setRevealedMessages] = useState({});
  const [decryptedCache, setDecryptedCache] = useState({});
  const [profileUserId, setProfileUserId] = useState(null);
  const [unreadBySender, setUnreadBySender] = useState({});

  const stompClientRef = useRef(null);
  useEffect(() => { stompClientRef.current = stompClient; }, [stompClient]);
  const messagesEndRef = useRef(null);
  const messageObserverRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesCacheRef = useRef({});
  const unreadRefreshTimerRef = useRef(null);
  const [isVerified, setIsVerified] = useState(() => roleFlags.canBypassChatPasscode);
  const chatUnlocked = roleFlags.canBypassChatPasscode || isVerified;

  const scheduleUnreadRefresh = useCallback(() => {
    if (unreadRefreshTimerRef.current) clearTimeout(unreadRefreshTimerRef.current);
    unreadRefreshTimerRef.current = setTimeout(async () => {
      try {
        const counts = await fetchUnreadCountsCached({ force: true });
        setUnreadBySender(counts);
      } catch {
        /* ignore */
      }
    }, 2000);
  }, []);

  const bootstrapChat = useCallback(async () => {
    if (!user?.id || !chatUnlocked) return;
    if (!roleFlags.canBypassChatPasscode && !getChatSessionToken()) return;
    if (isChatBootstrapped()) {
      const cachedUsers = getCachedChatUsers();
      if (cachedUsers?.length) {
        setUsers(
          cachedUsers.filter(
            (u) => u.id !== user.id && canAppearInChatList(u.role, u.chatEnabled)
          )
        );
      }
      const cachedGeneral = messagesCacheRef.current['ch:GENERAL'];
      if (cachedGeneral && selectedChatRef.current?.id === 'GENERAL') {
        setMessages(cachedGeneral);
      }
      return;
    }
    markChatBootstrapped();

    setUsersLoading(true);
    try {
      const [rawUsers, unread] = await Promise.all([
        fetchChatUsersCached(),
        fetchUnreadCountsCached(),
      ]);
      setUsers(
        (rawUsers || []).filter(
          (u) => u.id !== user.id && canAppearInChatList(u.role, u.chatEnabled)
        )
      );
      setUnreadBySender(unread);

      const general = await fetchChannelMessagesCached('GENERAL');
      messagesCacheRef.current['ch:GENERAL'] = general;
      if (selectedChatRef.current?.id === 'GENERAL') {
        setMessages(general);
        setMessageLoading(false);
      }
    } catch (err) {
      console.error('Error loading chat data:', err);
      clearChatApiCache();
    } finally {
      setUsersLoading(false);
    }
  }, [user?.id, chatUnlocked, roleFlags.canBypassChatPasscode]);

  const handleChatVerified = async (sessionToken) => {
    if (sessionToken) setChatSessionToken(sessionToken);
    clearChatApiCache();

    const me = await refreshUser?.(true);
    if (!roleFlags.canBypassChatPasscode && !getChatSessionToken()) {
      setIsVerified(false);
      return;
    }
    setIsVerified(true);
    if (me?.chatSessionActive === false && !roleFlags.canBypassChatPasscode) {
      clearChatSessionToken();
      setIsVerified(false);
    }
  };

  const getMessagesCacheKey = useCallback((chat, userId) => {
    if (!chat?.id || !userId) return null;
    if (chat.isChannel) return `ch:${chat.id}`;
    return `dm:${[userId, chat.id].sort().join(':')}`;
  }, []);

  useEffect(() => {
    if (roleFlags.canBypassChatPasscode) {
      setIsVerified(true);
      return;
    }
    if (user?.chatSessionActive && getChatSessionToken()) {
      setIsVerified(true);
    }
  }, [roleFlags.canBypassChatPasscode, user?.chatSessionActive]);

  useEffect(() => {
    const onSessionRequired = () => {
      if (!roleFlags.canBypassChatPasscode) {
        clearChatApiCache();
        setIsVerified(false);
      }
    };
    const onAuthExpired = () => {
      setIsVerified(false);
      logout();
    };
    window.addEventListener('chat:session-required', onSessionRequired);
    window.addEventListener('auth:session-expired', onAuthExpired);
    return () => {
      window.removeEventListener('chat:session-required', onSessionRequired);
      window.removeEventListener('auth:session-expired', onAuthExpired);
    };
  }, [roleFlags.canBypassChatPasscode, logout]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const selectedChatRef = useRef(selectedChat);
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  const appendIncomingMessage = useCallback((body) => {
    if (!body?.senderId && !body?.recipientId) return;
    const currentChat = selectedChatRef.current;
    const isChannelMsg = body.isChannel && body.recipientId === 'GENERAL';
    const isDmForOpen =
      currentChat &&
      !currentChat.isChannel &&
      ((body.senderId === currentChat.id && body.recipientId === user?.id) ||
        (body.senderId === user?.id && body.recipientId === currentChat.id));

    if (isChannelMsg && currentChat?.id === 'GENERAL') {
      setMessages((prev) => {
        const next = mergeMessage(prev, body);
        messagesCacheRef.current['ch:GENERAL'] = next;
        return next;
      });
    } else if (isDmForOpen) {
      setMessages((prev) => {
        const next = mergeMessage(prev, body);
        const key = getMessagesCacheKey(currentChat, user?.id);
        if (key) messagesCacheRef.current[key] = next;
        return next;
      });
      if (body.senderId !== user?.id && body.id) {
        markAsRead(body.id).catch(() => {});
      }
    }

    if (!body.isChannel && body.senderId && body.senderId !== user?.id) {
      setUnreadBySender((prev) => {
        const openDm =
          currentChat && !currentChat.isChannel && currentChat.id === body.senderId;
        if (openDm) return prev;
        return { ...prev, [body.senderId]: (prev[body.senderId] || 0) + 1 };
      });
    }
  }, [user?.id, getMessagesCacheKey]);

  const applyReadReceipt = useCallback((receipt) => {
    if (!receipt) return;
    if (receipt.messageId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === receipt.messageId ? { ...m, status: 'READ' } : m))
      );
    } else if (receipt.senderId === user?.id && receipt.readerId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === user?.id && m.recipientId === receipt.readerId
            ? { ...m, status: 'READ' }
            : m
        )
      );
    }
  }, [user?.id]);

  // Keep stable refs to callbacks so the WebSocket effect never needs to re-run
  // due to closure changes — avoids tearing down the connection on every render.
  const appendIncomingMessageRef = useRef(appendIncomingMessage);
  const applyReadReceiptRef = useRef(applyReadReceipt);
  const scheduleUnreadRefreshRef = useRef(scheduleUnreadRefresh);
  useEffect(() => { appendIncomingMessageRef.current = appendIncomingMessage; }, [appendIncomingMessage]);
  useEffect(() => { applyReadReceiptRef.current = applyReadReceipt; },[applyReadReceipt]);
  useEffect(() => { scheduleUnreadRefreshRef.current = scheduleUnreadRefresh; }, [scheduleUnreadRefresh]);

  // WebSocket — wait for API so Vite proxy does not spam ECONNREFUSED during backend startup
  useEffect(() => {
    if (!user?.id || !chatUnlocked) return;

    let cancelled = false;
    let client = null;

    (async () => {
      if (import.meta.env.DEV) {
        const ready = await waitForBackend(40, 1500);
        if (!ready && !cancelled) {
          console.warn('[Chat] Backend not ready on :8081 — run: cd backend && mvn spring-boot:run');
          return;
        }
      }
      if (cancelled) return;

      const userId = user.id;
      client = new Client({
        webSocketFactory: () => new SockJS(getWsUrl()),
        reconnectDelay: 5000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        onConnect: () => {
          // Use refs so subscriptions always call the latest callbacks
          // without needing to re-subscribe on every render.
          client.subscribe('/topic/channel.GENERAL', (msg) => {
            const body = JSON.parse(msg.body);
            if (body.messageId) {
              applyReadReceiptRef.current(body);
            } else {
              appendIncomingMessageRef.current(body);
            }
          });

          client.subscribe(`/topic/chat.user.${userId}`, (msg) => {
            const body = JSON.parse(msg.body);
            if (body.messageId && body.status === 'READ') {
              applyReadReceiptRef.current(body);
              scheduleUnreadRefreshRef.current();
            } else if (body.senderId || body.recipientId) {
              appendIncomingMessageRef.current(body);
              scheduleUnreadRefreshRef.current();
            }
          });

          // Mark client as connected in state after subscriptions are ready
          stompClientRef.current = client;
          if (!cancelled) setStompClient(client);
        },
        onDisconnect: () => {
          // Don't null out stompClient here — the STOMP client fires onDisconnect
          // during normal reconnection cycles too. The ref always holds the live
          // client object; use client.connected as the source of truth when sending.
        },
        onStompError: (frame) => {
          if (import.meta.env.DEV) {
            console.warn('[Chat] STOMP error (is backend running on 8081?)', frame.headers?.message);
          }
        },
      });

      client.activate();
    })();

    return () => {
      cancelled = true;
      if (client) client.deactivate();
    };
  // Only re-run when user identity or unlock state changes — NOT on callback changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, chatUnlocked]);

  useEffect(() => {
    if (!chatUnlocked || !user?.id) return;
    sendPresenceHeartbeat().catch(() => {});
    const id = setInterval(() => sendPresenceHeartbeat().catch(() => {}), 60000);
    return () => clearInterval(id);
  }, [chatUnlocked, user?.id]);

  useEffect(() => {
    if (!chatUnlocked) return;
    bootstrapChat();
  }, [chatUnlocked, bootstrapChat]);

  useEffect(() => {
    if (!chatUnlocked) return;
    const id = setInterval(() => {
      fetchChatUsersCached({ force: true }).then((raw) => {
        setUsers(
          (raw || []).filter(
            (u) => u.id !== user?.id && canAppearInChatList(u.role, u.chatEnabled)
          )
        );
      }).catch(() => {});
      scheduleUnreadRefresh();
    }, 120000);
    return () => clearInterval(id);
  }, [chatUnlocked, user?.id, scheduleUnreadRefresh]);

  useEffect(() => {
    if (!selectedChat?.id || selectedChat.isChannel) return;
    const match = users.find((u) => u.id === selectedChat.id);
    if (match) {
      setSelectedChat((prev) => ({ ...prev, online: match.online, lastSeenAt: match.lastSeenAt }));
    }
  }, [users, selectedChat?.id, selectedChat?.isChannel]);

  useEffect(() => {
    if (!messageObserverRef.current) {
      messageObserverRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = entry.target.getAttribute('data-message-id');
            const senderId = entry.target.getAttribute('data-sender-id');
            if (id && senderId && senderId !== user?.id) {
              markAsRead(id).catch(() => {});
            }
          });
        },
        { threshold: 0.6 }
      );
    }
    return () => messageObserverRef.current?.disconnect();
  }, [user?.id]);

  // Fetch messages for selected chat (uses session cache — no repeat fetch for GENERAL)
  useEffect(() => {
    const fetchMessages = async () => {
      if (!user?.id || !selectedChat?.id || !chatUnlocked) return;
      const cacheKey = getMessagesCacheKey(selectedChat, user.id);
      const cached = cacheKey ? messagesCacheRef.current[cacheKey] : null;
      if (cached) {
        setMessages(cached);
        setMessageLoading(false);
      } else {
        // Clear immediately so previous chat's messages don't bleed through
        setMessages([]);
        setMessageLoading(true);
      }

      try {
        let data;
        if (selectedChat.isChannel) {
          data = await fetchChannelMessagesCached(selectedChat.id);
        } else {
          // Always force-fetch DMs so we get messages sent since last visit
          data = await fetchDirectMessagesCached(user.id, selectedChat.id, { force: true });
          await markAllAsRead(user.id, selectedChat.id).catch(() => {});
          setUnreadBySender((prev) => {
            const next = { ...prev };
            delete next[selectedChat.id];
            return next;
          });
        }
        if (cacheKey) messagesCacheRef.current[cacheKey] = data;
        // Only apply if the user hasn't switched away while the fetch was in-flight
        if (selectedChatRef.current?.id === selectedChat.id) {
          // Merge with any real-time messages that arrived during the fetch
          setMessages((prev) => {
            const fetchedIds = new Set(data.map((m) => m.id).filter(Boolean));
            const realtimeOnly = prev.filter(
              (m) => m.id && !fetchedIds.has(m.id) && !String(m.id).startsWith('opt-')
            );
            const merged = realtimeOnly.length > 0 ? [...data, ...realtimeOnly] : data;
            if (cacheKey) messagesCacheRef.current[cacheKey] = merged;
            return merged;
          });
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
        if (!cached) setMessages([]);
      } finally {
        setMessageLoading(false);
      }
    };
    fetchMessages();
  }, [selectedChat?.id, selectedChat?.isChannel, user?.id, chatUnlocked, getMessagesCacheKey]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();

    const client = stompClientRef.current;
    if (!client) {
      alert('Chat not connected. Please wait a moment or refresh the page.');
      return;
    }

    // If client exists but isn't connected yet, wait up to 4s for it to connect
    if (!client.connected) {
      const connected = await new Promise((resolve) => {
        let elapsed = 0;
        const interval = setInterval(() => {
          elapsed += 100;
          if (client.connected) { clearInterval(interval); resolve(true); }
          else if (elapsed >= 4000) { clearInterval(interval); resolve(false); }
        }, 100);
      });
      if (!connected) {
        alert('Chat not connected. Please wait a moment or refresh the page.');
        return;
      }
    }

    if (!newMessage.trim() && !pendingAttachment) return;

    const text = newMessage.trim();
    const attachment = pendingAttachment;

    try {
      const encrypted = text ? await encryptMessage(text) : '';
      const chatMsg = {
        id: `opt-${Date.now()}`,
        senderId: user?.id,
        senderUsername: user?.username,
        senderProfilePicture: user?.profilePicture,
        recipientId: selectedChat.id,
        content: encrypted,
        fileUrl: attachment?.data || null,
        fileName: attachment?.name || null,
        fileSize: attachment?.size || null,
        type: attachment ? attachment.type : 'CHAT',
        isChannel: selectedChat.isChannel,
        timestamp: new Date().toISOString(),
        status: 'SENT',
      };

      setMessages((prev) => {
        const next = [...prev, chatMsg];
        const key = getMessagesCacheKey(selectedChat, user?.id);
        if (key) messagesCacheRef.current[key] = next;
        return next;
      });

      setNewMessage('');
      setPendingAttachment(null);

      const { id: _tempId, ...wirePayload } = chatMsg;
      client.publish({
        destination: '/app/chat.sendMessage',
        body: JSON.stringify(wirePayload),
      });
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please check your connection.');
    }
  };

  const [mediaSending, setMediaSending] = useState(false);

  const sendMediaMessage = async (type, fileData, fileName = null) => {
    const client = stompClientRef.current;
    if (!client) return;
    setMediaSending(true);
    try {
      const encrypted = type === 'CHAT' ? await encryptMessage(fileData) : '';
      const chatMsg = {
        id: `opt-${Date.now()}`,
        senderId: user.id,
        senderUsername: user.username,
        senderProfilePicture: user.profilePicture,
        recipientId: selectedChat.id,
        content: encrypted,
        fileUrl: type !== 'CHAT' ? fileData : null,
        fileName: fileName,
        type: type,
        isChannel: selectedChat.isChannel,
        timestamp: new Date().toISOString(),
        status: 'SENT',
      };

      setMessages((prev) => {
        const next = [...prev, chatMsg];
        const key = getMessagesCacheKey(selectedChat, user?.id);
        if (key) messagesCacheRef.current[key] = next;
        return next;
      });

      const { id: _tempId, ...wirePayload } = chatMsg;
      client.publish({
        destination: '/app/chat.sendMessage',
        body: JSON.stringify(wirePayload),
      });
    } catch (err) {
      console.error('Error sending media:', err);
    } finally {
      setMediaSending(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validation: 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      alert('File is too large! Maximum size is 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const type = file.type.startsWith('image/') ? 'IMAGE' : 'FILE';
      setPendingAttachment({
        type: type,
        data: event.target.result,
        name: file.name,
        size: file.size
      });
    };
    reader.onerror = () => alert('Error reading file. Please try again.');
    reader.readAsDataURL(file);
    e.target.value = null; // Reset input
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
        const reader = new FileReader();
        reader.onload = (event) => {
          setPendingAttachment({
            type: 'AUDIO',
            data: event.target.result,
            name: 'voice-note.ogg',
            size: blob.size
          });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error('Error recording audio:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const toggleReveal = (id) => {
    setRevealedMessages(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const startCall = (type) => {
    setCallType(type);
    setIsCalling(true);
    // Auto-close after 10s for simulation
    setTimeout(() => setIsCalling(false), 10000);
  };

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          canAppearInChatList(u.role, u.chatEnabled)
          && u.username?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [users, searchQuery]
  );

  const getUnreadCount = (chatId) => unreadBySender[chatId] || 0;

  const openProfile = (userId, e) => {
    e?.stopPropagation();
    if (!userId || userId === 'GENERAL') return;
    if (profileUserId === userId) return;
    setProfileUserId(userId);
  };

  const handleRevealMessage = async (msg) => {
    const id = msg.id || msg.timestamp;
    if (revealedMessages[id]) {
      setRevealedMessages((prev) => ({ ...prev, [id]: false }));
      return;
    }
    if (!decryptedCache[id] && msg.content) {
      const plain = await decryptMessage(msg.content);
      setDecryptedCache((prev) => ({ ...prev, [id]: plain }));
    }
    setRevealedMessages((prev) => ({ ...prev, [id]: true }));
  };

  const handleMarkAsUnread = async (messageId) => {
    try {
      await markAsUnread(messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'SENT' } : m));
    } catch (err) {
      console.error('Error marking as unread:', err);
    }
  };

  if (roleFlags.isUser && !user?.chatEnabled) {
    return (
      <div className="chat-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h2 style={{ color: '#0f172a', marginBottom: 8 }}>Chat not enabled</h2>
          <p style={{ color: '#64748b', marginBottom: 20 }}>Your account does not have chat access yet. Contact your super admin.</p>
          <button type="button" className="chat-logout-btn" onClick={logout} style={{ width: 'auto', padding: '12px 24px' }}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container glass-morphism">
      {!chatUnlocked ? (
        <ChatPasscodeGate
          user={user}
          onVerified={handleChatVerified}
          showExit={canLeaveChat}
          onExit={onBack}
        />
      ) : (
        <>
          {/* Sidebar */}
          <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div className="sidebar-title-row">
            <div className="sidebar-title-left">
              {canLeaveChat && (
                <button type="button" className="back-to-app-btn" onClick={onBack} title="Back to App">
                  <X size={20} />
                </button>
              )}
              <h2>Messages</h2>
            </div>
            <button
              type="button"
              className="chat-header-logout-btn"
              onClick={logout}
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
          <div className="search-bar">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="chat-list">
          <p className="chat-section-label">Channels</p>
          <div
            className={`chat-item ${selectedChat.id === 'GENERAL' ? 'active' : ''}`}
            onClick={() => setSelectedChat({ id: 'GENERAL', isChannel: true, username: 'General Channel' })}
          >
            <div className="chat-avatar channel-avatar">
              <Hash size={20} />
            </div>
            <div className="chat-info">
              <span className="chat-name">General Channel</span>
              <span className="chat-preview">Public chat for everyone</span>
            </div>
          </div>

          <p className="chat-section-label">Direct Messages</p>
          {usersLoading && filteredUsers.length === 0 && (
            <p className="chat-users-loading">Loading contacts…</p>
          )}
          {filteredUsers.map(u => {
            const unreadCount = getUnreadCount(u.id);
            return (
              <div
                key={u.id}
                className={`chat-item ${selectedChat.id === u.id ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
                onClick={() => setSelectedChat({ ...u, isChannel: false })}
              >
                <div
                  className="chat-avatar clickable"
                  onClick={(e) => openProfile(u.id, e)}
                  role="button"
                  tabIndex={0}
                >
                  {u.profilePicture ? (
                    <img src={u.profilePicture} alt={u.username} />
                  ) : (
                    <User size={20} />
                  )}
                  <div className={`online-indicator ${u.online ? 'online' : 'offline'}`} />
                </div>
                <div className="chat-info">
                  <span className="chat-name">{u.username}</span>
                  <span className="chat-preview">
                    {unreadCount > 0
                      ? `${unreadCount} new message${unreadCount > 1 ? 's' : ''}`
                      : formatPresence(u.online, u.lastSeenAt)}
                  </span>
                </div>
                {unreadCount > 0 && <div className="unread-badge">{unreadCount}</div>}
              </div>
            );
          })}
        </div>

        <div className="chat-sidebar-footer">
          <button type="button" className="chat-logout-btn" onClick={logout}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-content-row">
      <div className="chat-main">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <div
                className="header-user-info clickable"
                onClick={() => !selectedChat.isChannel && openProfile(selectedChat.id)}
                role={selectedChat.isChannel ? undefined : 'button'}
                tabIndex={selectedChat.isChannel ? undefined : 0}
              >
                <div className="chat-avatar">
                  {selectedChat.isChannel ? (
                    <Hash size={24} />
                  ) : selectedChat.profilePicture ? (
                    <img src={selectedChat.profilePicture} alt={selectedChat.username} />
                  ) : (
                    <User size={24} />
                  )}
                </div>
                <div>
                  <h3>{selectedChat.username}</h3>
                  <p>
                    {selectedChat.isChannel
                      ? 'Channel'
                      : formatPresence(selectedChat.online, selectedChat.lastSeenAt)}
                  </p>
                </div>
              </div>
              <div className="header-actions">
                <button className="icon-btn-header" onClick={() => startCall('audio')} title="Voice Call"><Phone size={24} /></button>
                <button className="icon-btn-header" onClick={() => startCall('video')} title="Video Call"><Video size={24} /></button>
                <button
                  type="button"
                  className="icon-btn-header"
                  title="View profile"
                  onClick={() => !selectedChat.isChannel && openProfile(selectedChat.id)}
                >
                  <Info size={24} />
                </button>
              </div>
            </div>

            <div className="messages-area">
              {messageLoading && messages.length === 0 ? (
                <div className="messages-loader">
                  <div className="spinner"></div>
                  <span>Loading messages…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-conversation">
                  <MessageSquare size={48} />
                  <p>No messages yet in this conversation.</p>
                  <span>End-to-end encrypted messages.</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === user?.id;
                  const msgKey = msg.id || `${msg.senderId}-${msg.timestamp}`;
                  const revealed = revealedMessages[msgKey];
                  const content = revealed ? (decryptedCache[msgKey] || '') : msg.content;

                  const handleMessageClick = (e) => {
                    if (e.detail === 3 && msg.type === 'CHAT' && msg.content) {
                      handleRevealMessage(msg);
                    }
                  };

                  return (
                    <div
                      key={msgKey}
                      className={`message-wrapper ${isMe ? 'me' : 'them'}`}
                      data-message-id={msg.id}
                      data-sender-id={msg.senderId}
                    >
                      {(!isMe || selectedChat.id === 'GENERAL') && (
                        <div
                          className="message-avatar clickable"
                          onClick={() => !isMe && openProfile(msg.senderId)}
                          role={!isMe ? 'button' : undefined}
                        >
                          {msg.senderProfilePicture ? (
                            <img src={msg.senderProfilePicture} alt="" />
                          ) : (
                            <div className="chat-item-icon">{msg.senderUsername?.charAt(0)}</div>
                          )}
                        </div>
                      )}
                      <div className="message-content-group">
                        {selectedChat.id === 'GENERAL' && !isMe && (
                          <span className="sender-username">{msg.senderUsername}</span>
                        )}
                        <div className="message-bubble-container">
                          <div
                            className={`message-bubble ${!revealed && msg.type === 'CHAT' ? 'is-encrypted' : ''}`}
                            onClick={handleMessageClick}
                          >
                            {!revealed && msg.type === 'CHAT' ? (
                              <div className="text-content is-encrypted">
                                <Shield size={12} style={{ marginBottom: 4 }} />
                                <div className="encrypted-text">{msg.content?.slice(0, 64)}…</div>
                              </div>
                            ) : (
                              <div className="text-content">
                                {msg.type === 'IMAGE' ? (
                                  <img src={msg.fileUrl} alt="Sent" className="sent-image" style={{maxWidth: '200px', borderRadius: '12px'}} />
                                ) : msg.type === 'AUDIO' ? (
                                  <div className="audio-bubble">
                                    <Mic size={18} />
                                    <audio controls src={msg.fileUrl} className="mini-player" />
                                  </div>
                                ) : msg.type === 'FILE' ? (
                                  <a href={msg.fileUrl} download={msg.fileName} className="file-link">
                                    <File size={20} />
                                    <div className="file-meta">
                                      <span>{msg.fileName}</span>
                                      <small>{(msg.fileSize / 1024).toFixed(1)} KB</small>
                                    </div>
                                  </a>
                                ) : (
                                  content
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            className="msg-more-btn"
                            onClick={() => handleMarkAsUnread(msg.id)}
                            title="Mark as Unread"
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>
                        <div className="message-footer">
                          <span className="message-time">
                            {format(new Date(msg.timestamp), 'HH:mm')}
                          </span>
                          {isMe && !selectedChat.isChannel && <MessageReceipt status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSendMessage}>
              {pendingAttachment && (
                <div className="attachment-preview animate-fade-in">
                  <div className="preview-content">
                    {pendingAttachment.type === 'IMAGE' ? (
                      <img src={pendingAttachment.data} alt="Preview" />
                    ) : pendingAttachment.type === 'AUDIO' ? (
                      <div className="audio-preview-info">
                        <Mic size={24} />
                        <span>Voice Note Ready</span>
                      </div>
                    ) : (
                      <div className="file-preview-info">
                        <File size={24} />
                        <span>{pendingAttachment.name}</span>
                      </div>
                    )}
                    <button type="button" className="close-preview" onClick={() => setPendingAttachment(null)}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="icon-btn-chat"
                onClick={() => fileInputRef.current.click()}
                title="Attach File"
              >
                <Paperclip size={24} />
              </button>
              <div className="input-wrapper">
                <input
                  type="text"
                  placeholder={isRecording ? "Recording..." : pendingAttachment ? "Add a caption..." : "Type a message..."}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={isRecording}
                />
                <button type="button" className="emoji-btn"><Smile size={20} /></button>
              </div>

              {(!newMessage.trim() && !pendingAttachment) ? (
                <button
                  type="button"
                  className={`mic-btn ${isRecording ? 'recording' : ''}`}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? <Square size={24} /> : <Mic size={24} />}
                </button>
              ) : (
                <button type="submit" className="send-btn" disabled={mediaSending} title="Send Message">
                  <Send size={24} />
                </button>
              )}
            </form>

            {/* Simulated Call Modal */}
            {isCalling && (
              <div className="call-overlay animate-fade-in">
                <div className="call-modal glass-morphism animate-bounce-in">
                  <div className="call-avatar-large">
                    {selectedChat.profilePicture ? (
                      <img src={selectedChat.profilePicture} alt="" />
                    ) : (
                      <User size={64} />
                    )}
                  </div>
                  <h2>{selectedChat.username}</h2>
                  <p>{callType === 'video' ? 'Incoming Video Call...' : 'Incoming Audio Call...'}</p>
                  <div className="call-actions">
                    <button className="call-btn accept"><Phone size={24} /></button>
                    <button className="call-btn reject" onClick={() => setIsCalling(false)}><X size={24} /></button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="no-chat-selected">
            <div className="empty-state-icon">
              <MessageSquare size={64} />
            </div>
            <h2>Select a conversation</h2>
            <p>Choose a channel or user from the sidebar to start chatting.</p>
          </div>
        )}
      </div>

      {profileUserId && (
        <ChatProfilePanel
          userId={profileUserId}
          initialUser={users.find((u) => u.id === profileUserId)}
          onClose={() => setProfileUserId(null)}
          onMessage={(p) => {
            setProfileUserId(null);
            setSelectedChat({ ...p, isChannel: false });
          }}
        />
      )}
      </div>
        </>
      )}

      <style>{`
        .chat-content-row {
          display: flex;
          flex: 1;
          min-width: 0;
          height: 100%;
        }
        .clickable { cursor: pointer; }
        .msg-receipt.sent { color: #94a3b8; }
        .msg-receipt.delivered { color: #94a3b8; }
        .msg-receipt.read { color: #3b82f6; }
        .online-indicator.offline { background: #64748b; box-shadow: none; }
        .chat-container {
          display: flex;
          height: 100vh;
          width: 100vw;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px);
          border-radius: 0;
          border: none;
          overflow: hidden;
          box-shadow: none;
          margin-top: 0;
        }

        .back-to-app-btn {
          background: #2563eb;
          color: #fff;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-to-app-btn:hover {
          background: #1d4ed8;
          transform: translateY(-2px);
        }

        .sidebar-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .sidebar-title-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .sidebar-title-row h2 {
          margin-bottom: 0 !important;
        }

        .chat-header-logout-btn {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #dc2626;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, transform 0.2s;
        }

        .chat-header-logout-btn:hover {
          background: #fee2e2;
          transform: translateY(-1px);
        }

        .chat-sidebar-footer {
          margin-top: auto;
          padding: 16px 20px 20px;
          border-top: 1px solid #f1f5f9;
        }

        .chat-logout-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #dc2626;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s;
        }

        .chat-logout-btn:hover {
          background: #fee2e2;
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.12);
        }

        .chat-sidebar {
          width: 320px;
          border-right: 1px solid #f2f2f2;
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }

        .chat-sidebar-header {
          padding: 24px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        .chat-sidebar-header h2 {
          margin-bottom: 16px;
          font-size: 24px;
          font-weight: 800;
          color: #1e293b;
          letter-spacing: -0.02em;
        }

        .search-bar {
          display: flex;
          align-items: center;
          background: #f5f5f5;
          padding: 10px 16px;
          border-radius: 12px;
          gap: 10px;
          border: 1px solid transparent;
          transition: all 0.2s;
        }

        .search-bar:focus-within {
          border-color: #2563eb;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(37,99,235,0.1);
        }

        .search-bar input {
          border: none;
          background: transparent;
          outline: none;
          width: 100%;
          font-size: 14px;
          color: #1e293b;
        }

        .chat-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .chat-section-label {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: #94a3b8;
          margin: 20px 12px 8px;
          letter-spacing: 0.1em;
        }

        .chat-users-loading {
          margin: 8px 16px 12px;
          font-size: 13px;
          color: #94a3b8;
        }

        .chat-item {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-radius: 18px;
          gap: 14px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          margin-bottom: 4px;
          position: relative;
        }

        .chat-item:hover {
          background: rgba(241, 245, 249, 0.8);
          transform: translateX(4px);
        }

        .chat-item.active {
          background: #2563eb;
          color: white;
          box-shadow: 0 8px 16px rgba(37, 99, 235, 0.2);
        }

        .chat-item.active .chat-preview,
        .chat-item.active .chat-name {
          color: white;
        }

        .chat-item.active .chat-preview {
          opacity: 0.8;
        }

        .chat-avatar {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
          border: 2px solid white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .chat-item.active .chat-avatar {
          border-color: rgba(255, 255, 255, 0.2);
        }

        .chat-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .channel-avatar {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
        }

        .online-indicator {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 12px;
          height: 12px;
          background: #10b981;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .unread-badge {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          background: #ef4444;
          color: white;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 10px;
          min-width: 18px;
          text-align: center;
          box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
        }

        .chat-info {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          gap: 2px;
        }

        .chat-name {
          font-weight: 700;
          font-size: 15px;
          color: #1e293b;
        }

        .chat-preview {
          font-size: 13px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.2);
          position: relative;
        }

        .chat-header {
          padding: 16px 32px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          z-index: 10;
        }

        .header-user-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-avatar {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #2563eb;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .header-user-info h3 {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
          letter-spacing: -0.01em;
        }

        .header-user-info p {
          font-size: 12px;
          color: #10b981;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .header-user-info p::before {
          content: '';
          display: block;
          width: 6px;
          height: 6px;
          background: currentColor;
          border-radius: 50%;
        }

        .messages-loader, .empty-conversation {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: #94a3b8;
          animation: fadeIn 0.5s ease;
        }

        .empty-conversation p {
          font-size: 18px;
          font-weight: 700;
          color: #64748b;
        }

        .empty-conversation span {
          font-size: 12px;
          opacity: 0.6;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(37, 99, 235, 0.1);
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scroll-behavior: smooth;
        }

        .messages-area::-webkit-scrollbar {
          width: 6px;
        }

        .messages-area::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
        }

        .encryption-notice {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          background: rgba(37, 99, 235, 0.08);
          color: #2563eb;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          margin: 0 auto 32px;
          width: fit-content;
          border: 1px solid rgba(37, 99, 235, 0.1);
        }

        .message-wrapper {
          display: flex;
          gap: 12px;
          max-width: 75%;
          animation: messageAppear 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        @keyframes messageAppear {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message-wrapper.me {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .message-wrapper.them {
          align-self: flex-start;
        }

        .sender-username {
          font-size: 12px;
          font-weight: 800;
          color: #000;
          margin-bottom: 4px;
          display: block;
          letter-spacing: -0.01em;
        }

        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          align-self: flex-end;
          border: 1px solid #eee;
        }

        .message-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .message-content-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: relative;
        }

        .message-bubble-container {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .me .message-bubble-container {
          flex-direction: row-reverse;
        }

        .msg-more-btn {
          opacity: 0;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          transition: all 0.2s;
        }

        .message-bubble-container:hover .msg-more-btn {
          opacity: 1;
        }

        .msg-more-btn:hover {
          background: rgba(0,0,0,0.05);
          color: #64748b;
        }

        .sender-username {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          margin: 0 4px;
        }

        .message-bubble {
          padding: 12px 18px;
          border-radius: 18px;
          font-size: 14.5px;
          line-height: 1.6;
          position: relative;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          font-weight: 500;
        }

        .message-bubble.is-encrypted {
          background: #f8fafc !important;
          border: 1px dashed #e2e8f0 !important;
          opacity: 0.9;
        }

        .encrypted-text {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 11px;
          color: #94a3b8;
          word-break: break-all;
          max-height: 40px;
          overflow: hidden;
          mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
        }

        .me .message-bubble {
          background: #ffffff;
          color: #1a1a1a;
          border: 1px solid #2563eb;
          border-bottom-right-radius: 4px;
          box-shadow: 0 4px 15px rgba(37, 99, 235, 0.08);
          position: relative;
        }

        .me .message-bubble::after {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: 4px;
          background: #2563eb;
          border-radius: 0 16px 16px 0;
        }

        .them .message-bubble {
          background: #fff;
          color: #1a1a1a;
          border-bottom-left-radius: 4px;
          border: 1px solid #f0f0f0;
        }

        .message-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          margin-top: 6px;
          opacity: 0.8;
        }

        .message-time {
          font-size: 10px;
          font-weight: 600;
        }

        .chat-input-area {
          padding: 24px 32px;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          align-items: center;
          gap: 16px;
          position: relative;
        }

        .attachment-preview {
          position: absolute;
          bottom: 100%;
          left: 32px;
          right: 32px;
          background: white;
          padding: 16px;
          border-radius: 20px 20px 0 0;
          box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-bottom: none;
          z-index: 10;
        }

        .preview-content {
          display: flex;
          align-items: center;
          gap: 16px;
          position: relative;
        }

        .preview-content img {
          height: 60px;
          width: 60px;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.1);
        }

        .file-preview-info, .audio-preview-info {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #000;
          font-weight: 700;
          font-size: 14px;
        }

        .close-preview {
          position: absolute;
          top: -24px;
          right: -8px;
          background: #ef4444;
          color: white;
          border: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
          transition: transform 0.2s;
        }

        .close-preview:hover {
          transform: scale(1.1);
        }

        .animate-fade-in {
          animation: fadeInUp 0.3s ease-out;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .mic-btn {
          width: 50px;
          height: 50px;
          border-radius: 12px;
          background: #f5f5f5;
          color: #000;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .mic-btn:hover {
          background: #ef4444;
          color: #fff;
          transform: scale(1.1);
        }

        .icon-btn-chat {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          border: none;
          background: #f8fafc;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .icon-btn-chat:hover {
          background: #2563eb;
          color: #fff;
          transform: rotate(15deg) scale(1.1);
        }

        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        .call-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .call-modal {
          width: 300px;
          padding: 40px;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 32px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }

        .call-avatar-large {
          width: 100px;
          height: 100px;
          border-radius: 30px;
          background: #f1f5f9;
          overflow: hidden;
          border: 4px solid white;
          box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }

        .call-avatar-large img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .header-actions {
          display: flex;
          gap: 16px;
        }

        .icon-btn-header {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid #f1f5f9;
          background: #fff;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .icon-btn-header:hover {
          background: #2563eb;
          color: #fff;
          transform: translateY(-3px) scale(1.1);
          box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2);
          border-color: #2563eb;
        }

        .icon-btn-header:active {
          transform: scale(0.95);
        }

        .call-actions {
          display: flex;
          gap: 24px;
          margin-top: 20px;
        }

        .call-btn {
          width: 60px;
          height: 60px;
          border-radius: 20px;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .call-btn:hover {
          transform: scale(1.1);
        }

        .call-btn.accept { background: #10b981; }
        .call-btn.reject { background: #ef4444; }

        .animate-bounce-in {
          animation: bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        @keyframes bounceIn {
          from { opacity: 0; transform: scale(0.3); }
          to { opacity: 1; transform: scale(1); }
        }

        .input-wrapper {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
        }

        .chat-input-area input {
          width: 100%;
          padding: 14px 50px 14px 20px;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #f8fafc;
          outline: none;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .chat-input-area input:focus {
          border-color: var(--blue);
          background: white;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.05);
        }

        .emoji-btn {
          position: absolute;
          right: 12px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .emoji-btn:hover {
          color: #64748b;
          background: rgba(0, 0, 0, 0.05);
        }

        .send-btn {
          width: 50px;
          height: 50px;
          border-radius: 12px;
          background: #2563eb;
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
        }

        .send-btn:hover:not(:disabled) {
          background: #1d4ed8;
          transform: scale(1.05);
        }

        .send-btn:active {
          transform: scale(0.95);
        }

        .send-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          background: #000;
        }

        .empty-state-icon {
          width: 100px;
          height: 100px;
          background: rgba(37, 99, 235, 0.08);
          border-radius: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2563eb;
          margin-bottom: 24px;
        }

        .theme-dark .chat-container {
          background: rgba(15, 23, 42, 0.8);
          border-color: rgba(255, 255, 255, 0.05);
        }

        .theme-dark .chat-sidebar {
          background: rgba(15, 23, 42, 0.4);
          border-right-color: rgba(255, 255, 255, 0.05);
        }

        .theme-dark .chat-sidebar-header h2,
        .theme-dark .chat-name,
        .theme-dark .header-user-info h3,
        .theme-dark .no-chat-selected h2 {
          color: #f1f5f9;
        }

        .theme-dark .search-bar {
          background: rgba(30, 41, 59, 0.6);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .theme-dark .search-bar input {
          color: white;
        }

        .theme-dark .chat-item:not(.active):hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .theme-dark .chat-header {
          background: rgba(15, 23, 42, 0.9);
          border-bottom-color: rgba(255, 255, 255, 0.05);
        }

        .theme-dark .them .message-bubble {
          background: #1e293b;
          color: #f1f5f9;
          border-color: rgba(255, 255, 255, 0.05);
        }

        .theme-dark .chat-input-area {
          background: rgba(15, 23, 42, 0.9);
          border-top-color: rgba(255, 255, 255, 0.05);
        }

        .theme-dark .chat-input-area input {
          background: #1e293b;
          border-color: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .text-content {
          cursor: pointer;
          position: relative;
          word-break: break-all;
        }

        .text-content.is-encrypted {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
          background: rgba(0, 0, 0, 0.15);
          padding: 10px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-left: 2px solid rgba(255,255,255,0.2);
        }

        .them .text-content.is-encrypted {
          color: #64748b;
          background: rgba(0, 0, 0, 0.05);
          border-left-color: var(--blue);
        }

        .lock-icon {
          opacity: 0.6;
          margin-bottom: 2px;
        }

        .enc-label {
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.15em;
          opacity: 0.5;
          text-align: right;
          margin-top: 4px;
          color: inherit;
        }

        .audio-bubble {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 220px;
          padding: 4px 0;
        }

        .mini-player {
          height: 32px;
          border-radius: 20px;
          filter: brightness(0.9);
        }

        .me .mini-player {
          filter: invert(1) brightness(1.5);
        }

        .file-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          background: rgba(0, 0, 0, 0.04);
          border-radius: 16px;
          text-decoration: none;
          color: inherit;
          transition: background 0.2s;
        }

        .file-link:hover {
          background: rgba(0, 0, 0, 0.08);
        }

        .file-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .file-meta span {
          font-size: 13px;
          font-weight: 700;
        }

        .file-meta small {
          font-size: 10px;
          opacity: 0.6;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default ChatPage;
