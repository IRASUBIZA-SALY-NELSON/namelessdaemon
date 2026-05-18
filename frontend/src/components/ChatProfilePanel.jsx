import { useEffect, useState } from 'react';
import { X, User, Mail, Shield, MessageSquare, Loader2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fetchChatProfileCached, profileFromChatUser } from '../api/chatCache';

function formatPresence(online, lastSeenAt) {
  if (online) return 'Active now';
  if (!lastSeenAt) return 'Offline';
  return `Last seen ${formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true })}`;
}

const ChatProfilePanel = ({ userId, initialUser, onClose, onMessage }) => {
  const [profile, setProfile] = useState(() => profileFromChatUser(initialUser));
  const [loading, setLoading] = useState(!initialUser);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const cached = profileFromChatUser(initialUser);
    if (cached) {
      setProfile(cached);
      setLoading(false);
    }

    fetchChatProfileCached(userId)
      .then((data) => {
        if (!cancelled && data) setProfile(data);
      })
      .catch(() => {
        if (!cancelled && !cached) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId, initialUser]);

  if (!userId) return null;

  return (
    <aside className="chat-profile-panel">
      <div className="chat-profile-panel-header">
        <h3>Profile</h3>
        <button type="button" className="icon-btn-header" onClick={onClose} aria-label="Close profile">
          <X size={20} />
        </button>
      </div>

      {loading ? (
        <div className="chat-profile-loading">
          <Loader2 size={28} className="spin" />
        </div>
      ) : profile ? (
        <div className="chat-profile-body">
          <div className="chat-profile-hero">
            <div className="chat-profile-avatar-lg">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt={profile.username} />
              ) : (
                <User size={48} />
              )}
              <span className={`presence-dot ${profile.online ? 'online' : 'offline'}`} />
            </div>
            <h2>{profile.username}</h2>
            <p className="chat-profile-role">{profile.role?.replace('_', ' ')}</p>
            <p className={`chat-profile-presence ${profile.online ? 'is-online' : ''}`}>
              {formatPresence(profile.online, profile.lastSeenAt)}
            </p>
            {profile.lastSeenAt && !profile.online && (
              <p className="chat-profile-lastseen-detail">
                {format(new Date(profile.lastSeenAt), 'PPpp')}
              </p>
            )}
          </div>

          <div className="chat-profile-fields">
            {profile.email && (
              <div className="chat-profile-field">
                <Mail size={16} />
                <div>
                  <label>Email</label>
                  <span>{profile.email}</span>
                </div>
              </div>
            )}
            <div className="chat-profile-field">
              <Shield size={16} />
              <div>
                <label>Chat access</label>
                <span>{profile.chatEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {onMessage && (
            <button type="button" className="chat-profile-message-btn" onClick={() => onMessage(profile)}>
              <MessageSquare size={18} />
              Message
            </button>
          )}
        </div>
      ) : (
        <p className="chat-profile-error">Could not load profile.</p>
      )}

      <style>{`
        .chat-profile-panel {
          width: 320px;
          min-width: 280px;
          border-left: 1px solid rgba(255,255,255,0.08);
          background: rgba(15, 23, 42, 0.95);
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .chat-profile-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .chat-profile-panel-header h3 { margin: 0; font-size: 1rem; color: #f1f5f9; }
        .chat-profile-loading {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
        }
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .chat-profile-body { padding: 24px 20px; overflow-y: auto; flex: 1; }
        .chat-profile-hero { text-align: center; margin-bottom: 24px; }
        .chat-profile-avatar-lg {
          position: relative;
          width: 96px;
          height: 96px;
          margin: 0 auto 16px;
          border-radius: 50%;
          overflow: hidden;
          background: #334155;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .chat-profile-avatar-lg img { width: 100%; height: 100%; object-fit: cover; }
        .presence-dot {
          position: absolute;
          bottom: 4px;
          right: 4px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid #0f172a;
        }
        .presence-dot.online { background: #22c55e; }
        .presence-dot.offline { background: #64748b; }
        .chat-profile-hero h2 { margin: 0 0 4px; color: #f8fafc; font-size: 1.25rem; }
        .chat-profile-role { margin: 0 0 8px; color: #94a3b8; font-size: 0.875rem; text-transform: capitalize; }
        .chat-profile-presence { margin: 0; color: #94a3b8; font-size: 0.8rem; }
        .chat-profile-presence.is-online { color: #22c55e; }
        .chat-profile-lastseen-detail { margin: 4px 0 0; font-size: 0.75rem; color: #64748b; }
        .chat-profile-fields { display: flex; flex-direction: column; gap: 12px; }
        .chat-profile-field {
          display: flex;
          gap: 12px;
          padding: 12px;
          background: rgba(255,255,255,0.04);
          border-radius: 10px;
          color: #cbd5e1;
        }
        .chat-profile-field label {
          display: block;
          font-size: 0.7rem;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 2px;
        }
        .chat-profile-field span { font-size: 0.9rem; color: #e2e8f0; }
        .chat-profile-message-btn {
          width: 100%;
          margin-top: 20px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }
        .chat-profile-message-btn:hover { background: #1d4ed8; }
        .chat-profile-error { padding: 24px; color: #94a3b8; text-align: center; }
      `}</style>
    </aside>
  );
};

export default ChatProfilePanel;
