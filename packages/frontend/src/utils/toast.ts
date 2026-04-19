const STYLES: Record<string, { bg: string; border: string; color: string }> = {
  success: { bg: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' },
  error: { bg: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' },
  info: { bg: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1' },
};

/**
 * Standardised API-failure toast: logs to console (with the full error for devtools) and
 * surfaces the backend's `{ error }` message if any, falling back to the caller-supplied
 * human-friendly label. Use in catch blocks to kill silent failures in one line.
 *
 * Only string error bodies are passed through — some routes (Zod failures, etc.) return an
 * object shape like `{ error: { code, message } }`, which would coerce to "[object Object]"
 * in the toast. Non-string bodies fall back to the caller's human-friendly fallback.
 */
export function toastApiError(err: unknown, fallback: string) {
  console.error(err);
  const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  const msg = typeof raw === 'string' ? raw : null;
  showToast(msg || fallback, 'error');
}

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();

  const style = STYLES[type];
  const toast = document.createElement('div');
  toast.id = 'app-toast';
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
