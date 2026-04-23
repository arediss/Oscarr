import { useState, useEffect } from 'react';
import api from '@/lib/api';

export interface UserNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

let cachedNotifications: UserNotification[] = [];
let cachedUnreadCount = 0;
let lastFetch = 0;
const listeners = new Set<() => void>();

async function fetchNotifications() {
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const [listRes, countRes] = await Promise.all([
      api.get('/notifications?page=1'),
      api.get('/notifications/unread-count'),
    ]);
    cachedNotifications = (listRes.data as { notifications: UserNotification[] }).notifications;
    cachedUnreadCount = (countRes.data as { count: number }).count;
    lastFetch = Date.now();
    listeners.forEach((cb) => cb());
  } catch { /* ignore */ }
}

let interval: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    if (Date.now() - lastFetch > 5000) fetchNotifications();
    interval = setInterval(fetchNotifications, 30000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

export function useNotifications() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribe(() => setTick((t) => t + 1));
  }, []);

  const markAsRead = async (id: number) => {
    await api.put(`/notifications/${id}/read`);
    cachedNotifications = cachedNotifications.map((n) => n.id === id ? { ...n, read: true } : n);
    cachedUnreadCount = Math.max(0, cachedUnreadCount - 1);
    listeners.forEach((cb) => cb());
  };

  const markAllRead = async () => {
    await api.put('/notifications/read-all');
    cachedNotifications = cachedNotifications.map((n) => ({ ...n, read: true }));
    cachedUnreadCount = 0;
    listeners.forEach((cb) => cb());
  };

  const dismiss = async (id: number) => {
    const wasUnread = cachedNotifications.find((n) => n.id === id && !n.read);
    await api.delete(`/notifications/${id}`);
    cachedNotifications = cachedNotifications.filter((n) => n.id !== id);
    if (wasUnread) cachedUnreadCount = Math.max(0, cachedUnreadCount - 1);
    listeners.forEach((cb) => cb());
  };

  return {
    notifications: cachedNotifications,
    unreadCount: cachedUnreadCount,
    markAsRead,
    markAllRead,
    dismiss,
  };
}
