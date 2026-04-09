import axios from 'axios';
import i18n from '@/i18n';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Add language header (auth is via httpOnly cookie, no Bearer token needed)
api.interceptors.request.use((config) => {
  config.headers['Accept-Language'] = i18n.language;
  // "View as role" simulation for admin testing
  const viewAsRole = sessionStorage.getItem('view-as-role');
  if (viewAsRole) {
    config.headers['X-View-As-Role'] = viewAsRole;
  }
  // Attach setup secret for install routes
  if (config.url?.startsWith('/setup/') || config.url === '/setup') {
    const setupSecret = sessionStorage.getItem('setup-secret');
    if (setupSecret) {
      config.headers['X-Setup-Secret'] = setupSecret;
    }
  }
  return config;
});

// Lightweight toast for global error feedback (no React dependency)
function showErrorToast(message: string) {
  const existing = document.getElementById('api-error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'api-error-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999',
    padding: '12px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '500',
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
    color: '#ef4444', backdropFilter: 'blur(8px)', transition: 'opacity 0.3s',
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// Global NSFW detection — any API response with nsfwTmdbIds automatically updates the filter
let _addNsfwIds: ((ids: number[]) => void) | null = null;
export function registerNsfwHandler(handler: (ids: number[]) => void) { _addNsfwIds = handler; }

api.interceptors.response.use(
  (response) => {
    const ids = response.data?.nsfwTmdbIds;
    if (Array.isArray(ids) && ids.length > 0 && _addNsfwIds) {
      _addNsfwIds(ids);
    }
    return response;
  },
  (error) => {
    // 401 handling is done by AuthContext + InstallGuard, not here
    if (error.response?.status === 403) {
      showErrorToast(i18n.t('common.forbidden', 'Access denied'));
    }
    return Promise.reject(error);
  }
);


export default api;

// TMDB image helpers
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function posterUrl(path: string | null, size = 'w500'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path; // Full URL (TVDB etc.)
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function backdropUrl(path: string | null, size = 'original'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
