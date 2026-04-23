import i18n from '@/i18n';

/** Backend UPPER_SNAKE error token → localised message via `errors.<TOKEN>` key. */
export function translateBackendError(token: string | undefined, fallback: string): string {
  if (!token) return fallback;
  if (!/^[A-Z][A-Z0-9_]*$/.test(token)) return token;
  const key = `errors.${token}`;
  const translated = i18n.t(key);
  return translated === key ? fallback : translated;
}

const STYLES: Record<string, { bg: string; border: string; color: string }> = {
  success: { bg: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' },
  error: { bg: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' },
  info: { bg: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1' },
};

/** Extract backend error → localised string without popping a toast. */
export function extractApiError(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  const token = typeof raw === 'string' ? raw : null;
  return translateBackendError(token || undefined, fallback);
}

export function toastApiError(err: unknown, fallback: string) {
  console.error(err);
  showToast(extractApiError(err, fallback), 'error');
}

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();

  const style = STYLES[type];
  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999',
    padding: '12px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '500',
    background: style.bg, border: style.border, color: style.color,
    backdropFilter: 'blur(8px)', transition: 'opacity 0.3s',
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}
