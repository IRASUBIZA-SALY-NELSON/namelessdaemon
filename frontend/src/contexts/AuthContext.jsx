import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { clearChatSessionToken } from '../api/chatSecurityApi';
import { getRoleFlags, isChatOnlyUser as checkChatOnlyUser } from '../utils/roles';
import { apiUrl } from '../config/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check authentication status on mount
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setIsAuthenticated(true);
        setUser(parsedUser);
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    setIsLoading(false);
  }, []);

  const fetchCurrentUser = async (token, { force = false } = {}) => {
    if (!token) return null;
    if (!force) {
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.id) {
            setUser(parsed);
            return parsed;
          }
        } catch {
          /* use network */
        }
      }
    }

    try {
      const response = await fetch(apiUrl('/api/users/me'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return null;
      }

      if (response.ok) {
        const userData = await response.json();
        const userInfo = {
          username: userData.username,
          role: userData.role,
          email: userData.email,
          id: userData.id,
          profilePicture: userData.profilePicture,
          chatEnabled: !!userData.chatEnabled,
          chatPasscodeMustChange: !!userData.chatPasscodeMustChange,
          chatPasscodeLocked: !!userData.chatPasscodeLocked,
          chatLockedUntil: userData.chatLockedUntil || null,
          webAuthnRegistered: !!userData.webAuthnRegistered,
          chatSessionActive: !!userData.chatSessionActive,
        };
        setUser(userInfo);
        localStorage.setItem('user', JSON.stringify(userInfo));
        return userInfo;
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
    return null;
  };

  const login = async (username, password) => {
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        const token = data.token;

        // Store JWT token
        localStorage.setItem('token', token);
        setIsAuthenticated(true);

        const userData = await fetchCurrentUser(token, { force: true });
        if (userData) {
          toast.success('Login successful!');
        } else {
          // Fallback to basic user data if /api/users/me fails
          const fallbackData = { username, role: data.role || 'USER' };
          setUser(fallbackData);
          localStorage.setItem('user', JSON.stringify(fallbackData));
          toast.success('Login successful!');
        }
        return true;
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Invalid credentials');
        return false;
      }
    } catch (error) {
      toast.error('Login failed');
      return false;
    }
  };


  const logout = async () => {
    try {
      const token = localStorage.getItem('token');

      if (token) {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          }
        });
      }
    } catch (error) {
      // Continue with local logout even if API call fails
    }

    // Always perform local logout regardless of API call success
    // Clear authentication state
    setIsAuthenticated(false);
    setUser(null);

    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('rememberMe');
    clearChatSessionToken();
    import('../api/chatCache').then((m) => m.clearChatApiCache());

    // Show success message
    toast.success('Logged out successfully', {
      position: 'top-right',
      autoClose: 2000
    });
  };

  const roleFlags = getRoleFlags(user?.role);
  const isChatOnlyUser = checkChatOnlyUser(user);

  const refreshUser = async (force = false) => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return fetchCurrentUser(token, { force });
  };

  const value = {
    isAuthenticated,
    user,
    isLoading,
    login,
    logout,
    refreshUser,
    roleFlags,
    isSuperAdmin: roleFlags.isSuperAdmin,
    isAdmin: roleFlags.isAdmin,
    isStaff: roleFlags.isStaff,
    isChatOnlyUser,
    canLeaveChat: roleFlags.canLeaveChat,
    canAccessAdminPortal: roleFlags.canAccessAdminPortal,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
