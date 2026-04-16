import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { ChevronDown, Shield, Eye, Globe, Bell, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { PluginSlot } from '@/plugins/PluginSlot';

interface UserClusterProps {
  viewAsRole: string | null;
  onViewAsRoleChange: (role: string | null) => void;
  variant?: 'compact' | 'expanded';
  dropdownDirection?: 'below' | 'above';
}

export function UserCluster({
  viewAsRole,
  onViewAsRoleChange,
  variant = 'compact',
  dropdownDirection = 'below',
}: UserClusterProps) {
  const { t } = useTranslation();
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<{ name: string }[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const canManageRoles = hasPermission('admin.roles');

  useEffect(() => {
    if (canManageRoles) {
      api.get('/admin/roles').then(({ data }) => setAvailableRoles(data)).catch(() => {});
    }
  }, [canManageRoles]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/login');
  };

  const avatarEl = user?.avatar ? (
    <img
      src={user.avatar}
      alt={user.displayName || ''}
      className="w-8 h-8 rounded-full ring-2 ring-white/10 flex-shrink-0"
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent text-sm font-bold flex-shrink-0">
      {(user?.displayName || user?.email || '?')[0].toUpperCase()}
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex items-center gap-2 rounded-xl hover:bg-white/5 transition-colors text-left',
          variant === 'expanded' ? 'p-2 w-full' : 'p-1'
        )}
      >
        {avatarEl}
        {variant === 'expanded' && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ndp-text truncate">
              {user?.displayName || user?.email}
            </p>
            {user?.role && (
              <p className="text-xs text-ndp-text-dim truncate">{user.role}</p>
            )}
          </div>
        )}
        <ChevronDown className={clsx(
          'w-3.5 h-3.5 text-ndp-text-dim transition-transform flex-shrink-0',
          variant === 'compact' && 'hidden sm:block',
          open && (dropdownDirection === 'above' ? '-rotate-180' : 'rotate-180')
        )} />
      </button>

      {open && (
        <div className={clsx(
          'absolute w-56 card shadow-2xl shadow-black/50 border border-white/10 animate-fade-in py-1',
          dropdownDirection === 'below' ? 'right-0 top-full mt-2' : 'left-0 bottom-full mb-2'
        )}>
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-semibold text-ndp-text truncate">{user?.displayName || user?.email}</p>
            <p className="text-xs text-ndp-text-dim truncate">{user?.email}</p>
          </div>

          {hasPermission('admin.*') && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ndp-text-muted hover:text-ndp-accent hover:bg-white/5 transition-colors"
            >
              <Shield className="w-4 h-4" />
              {t('nav.admin')}
            </Link>
          )}

          {canManageRoles && (
            <div className="px-4 py-2 border-t border-white/5">
              <div className="flex items-center gap-2.5">
                <Eye className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                <select
                  value={viewAsRole || ''}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    onViewAsRoleChange(v);
                    if (v) setOpen(false);
                  }}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/40 cursor-pointer appearance-none"
                >
                  <option value="">{t('admin.view_as.off', 'View as role...')}</option>
                  {availableRoles.filter(r => r.name !== 'admin').map(r => (
                    <option key={r.name} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="px-4 py-2.5 border-t border-white/5">
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
              <select
                value={i18n.language.split('-')[0]}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 cursor-pointer appearance-none"
              >
                {Object.keys(i18n.options.resources || {}).map((code) => (
                  <option key={code} value={code}>
                    {new Intl.DisplayNames([code], { type: 'language' }).of(code)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <PluginSlot hookPoint="avatar.menu" context={{ user, isAdmin: hasPermission('admin.*'), hasPermission }} />

          {push.supported && (
            <button
              onClick={() => push.subscribed ? push.unsubscribe() : push.subscribe()}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-ndp-text-muted hover:bg-white/5 transition-colors"
              disabled={push.loading}
            >
              <Bell className="w-4 h-4" />
              <span>{push.subscribed ? t('push.enabled', 'Notifications enabled') : t('push.enable', 'Enable notifications')}</span>
              {push.subscribed && <span className="ml-auto w-2 h-2 rounded-full bg-ndp-success" />}
            </button>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ndp-text-muted hover:text-ndp-danger hover:bg-white/5 transition-colors w-full text-left"
          >
            <LogOut className="w-4 h-4" />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
