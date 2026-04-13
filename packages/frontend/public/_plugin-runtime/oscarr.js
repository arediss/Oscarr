/**
 * Oscarr Plugin SDK
 * Lightweight helpers for plugin developers.
 * Import with: import { api, apiPost, formatSize, showToast } from '@oscarr/sdk';
 */

// ── API helpers ─────────────────────────────────────────────────────

/** GET request to an Oscarr API endpoint. Returns parsed JSON. */
export async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

/** POST request with JSON body. */
export async function apiPost(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** PUT request with JSON body. */
export async function apiPut(path, body) {
  return api(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** DELETE request. */
export async function apiDelete(path) {
  return api(path, { method: 'DELETE' });
}

// ── Formatting helpers ──────────────────────────────────────────────

/** Format bytes to human-readable string (e.g. 1.5 GB). */
export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

/** Format a date string to localized short date. */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString();
}

/** Format a date string to relative time (e.g. "2 hours ago"). */
export function formatRelative(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

// ── LocalStorage helpers (namespaced per plugin) ────────────────────

/** Get a value from localStorage, namespaced by plugin ID. */
export function storageGet(pluginId, key, fallback = null) {
  try {
    const raw = localStorage.getItem(`plugin-${pluginId}-${key}`);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Set a value in localStorage, namespaced by plugin ID. */
export function storageSet(pluginId, key, value) {
  try {
    localStorage.setItem(`plugin-${pluginId}-${key}`, JSON.stringify(value));
  } catch { /* quota exceeded or private mode */ }
}
