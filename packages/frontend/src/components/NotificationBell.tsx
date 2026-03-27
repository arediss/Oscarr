import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNotifications } from '@/hooks/useNotifications';

function timeAgo(dateStr: string, t: (key: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('notifications.just_now');
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAsRead, markAllRead, dismiss } = useNotifications();
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

  const typeIcon = (type: string) => {
    if (type === 'request_approved') return '✓';
    if (type === 'request_declined') return '✗';
    if (type === 'media_available') return '▶';
    if (type === 'support_reply') return '💬';
    return '•';
  };

  const typeColor = (type: string) => {
    if (type === 'request_approved') return 'text-green-400';
    if (type === 'request_declined') return 'text-red-400';
    if (type === 'media_available') return 'text-ndp-accent';
    if (type === 'support_reply') return 'text-blue-400';
    return 'text-ndp-text-muted';
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-ndp-accent text-[10px] font-bold text-white px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 card shadow-2xl shadow-black/50 border border-white/10 animate-fade-in overflow-hidden">
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
                className="p-1 text-ndp-text-dim hover:text-ndp-text rounded hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ndp-text-dim">
                {t('notifications.no_notifications')}
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={clsx(
                    'group flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0',
                    !notif.read && 'bg-ndp-accent/5'
                  )}
                  onClick={() => { if (!notif.read) markAsRead(notif.id); }}
                >
                  {/* Type indicator */}
                  <span className={clsx('text-lg mt-0.5 flex-shrink-0', typeColor(notif.type))}>
                    {typeIcon(notif.type)}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm truncate', notif.read ? 'text-ndp-text-muted' : 'text-ndp-text font-medium')}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-ndp-text-dim mt-0.5 line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-ndp-text-dim mt-1">{timeAgo(notif.createdAt, t)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {!notif.read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                        className="p-1 text-ndp-text-dim hover:text-ndp-accent rounded hover:bg-white/5"
                        title={t('notifications.mark_read')}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                      className="p-1 text-ndp-text-dim hover:text-ndp-danger rounded hover:bg-white/5"
                      title={t('notifications.dismiss')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
