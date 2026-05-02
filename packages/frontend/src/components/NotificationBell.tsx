import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationList from '@/components/NotificationList';

interface NotificationBellProps {
  dropdownDirection?: 'below' | 'above';
}

export default function NotificationBell({ dropdownDirection = 'below' }: NotificationBellProps = {}) {
  const { t } = useTranslation();
  const { unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative group" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={t('notifications.title')}
        className="relative p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-ndp-accent text-[10px] font-bold text-white px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {!open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded-md bg-ndp-surface border border-white/10 text-xs text-ndp-text whitespace-nowrap shadow-lg shadow-black/40 z-50 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-[opacity,transform] duration-100"
        >
          {t('notifications.title')}
        </span>
      )}

      {open && (
        <div className={clsx(
          'absolute right-0 w-80 sm:w-96 card shadow-2xl shadow-black/50 border border-white/10 animate-fade-in overflow-hidden',
          dropdownDirection === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h3 className="text-sm font-semibold text-ndp-text">{t('notifications.title')}</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  className="flex items-center gap-1 text-xs text-ndp-text-dim hover:text-ndp-accent transition-colors px-2 py-1 rounded hover:bg-white/5"
                  title={t('notifications.mark_all_read')}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('notifications.mark_all_read')}</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                className="p-1 text-ndp-text-dim hover:text-ndp-text rounded hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            <NotificationList onAction={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
