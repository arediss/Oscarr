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
  // Attach setup secret for install routes
  if (config.url?.startsWith('/setup/') || config.url === '/setup') {
    const setupSecret = sessionStorage.getItem('setup-secret');
    if (setupSecret) {
      config.headers['X-Setup-Secret'] = setupSecret;
    }
  }
  return config;
});

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
