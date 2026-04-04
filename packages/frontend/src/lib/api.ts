import axios from 'axios';
import i18n from '@/i18n';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Add token + language header
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect to login for setup routes (handled by InstallPage)
      const url = error.config?.url || '';
      const isSetupRoute = url.startsWith('/setup/') || url === '/setup';
      if (!isSetupRoute) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    if (error.response?.status === 403) {
      showErrorToast(i18n.t('common.forbidden', 'Access denied'));
    }
    return Promise.reject(error);
  }
);

// Debug profiler — tracks API call timings
export interface ApiTrace {
  method: string;
  url: string;
  startedAt: number;
  duration: number;
  status: number;
}

const _traces: ApiTrace[] = [];
let _pageLoadTime = Date.now();

export function resetTraces() { _traces.length = 0; _pageLoadTime = Date.now(); }
export function getTraces(): ApiTrace[] { return _traces; }
export function getPageLoadTime(): number { return _pageLoadTime; }

api.interceptors.request.use((config) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
(config as any)._startTime = Date.now();
  return config;
});

api.interceptors.response.use(
  (response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const start = (response.config as any)._startTime as number;
    if (start) {
      _traces.push({
        method: (response.config.method || 'get').toUpperCase(),
        url: response.config.url || '',
        startedAt: start - _pageLoadTime,
        duration: Date.now() - start,
        status: response.status,
      });
    }
    return response;
  },
  (error) => {
    const config = error.config;
    const start = config?._startTime as number;
    if (start) {
      _traces.push({
        method: (config.method || 'get').toUpperCase(),
        url: config.url || '',
        startedAt: start - _pageLoadTime,
        duration: Date.now() - start,
        status: error.response?.status || 0,
      });
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
