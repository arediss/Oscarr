const STYLES: Record<string, { bg: string; border: string; color: string }> = {
  success: { bg: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' },
  error: { bg: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' },
  info: { bg: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1' },
};

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
