import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  hasAccess: boolean;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      const { permissions: perms = [], ...userData } = data;
      setUser(userData);
      setPermissions(perms);
    } catch {
      setUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (_token: string, userData: User) => {
    // Token is now stored exclusively in httpOnly cookie by the backend
    setUser(userData);
    // Fetch full user data including permissions
    try {
      const { data } = await api.get('/auth/me');
      const { permissions: perms = [], ...rest } = data;
      setUser(rest);
      setPermissions(perms);
    } catch {
      // Fallback: user is set but permissions will be empty until next page load
    }
  }, []);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ }
    setUser(null);
  };

  const hasPermission = useCallback((permission: string): boolean => {
    if (permissions.length === 0) return false;
    // Admin wildcard
    if (permissions.includes('*')) return true;
    // Exact match
    if (permissions.includes(permission)) return true;
    // Wildcard match: 'admin.*' matches 'admin.users', 'admin.roles', etc.
    const parts = permission.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const wildcard = parts.slice(0, i).join('.') + '.*';
      if (permissions.includes(wildcard)) return true;
    }
    return false;
  }, [permissions]);

  const isAdmin = hasPermission('admin.*');
  const hasAccess = isAdmin || (user?.providers ?? []).length > 0;

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      isAdmin, hasAccess, permissions, hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
