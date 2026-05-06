import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Globe, Eye, EyeOff } from 'lucide-react';
import i18n from '@/i18n';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface PreferencesSectionProps {
  viewAsRole: string | null;
  onViewAsRoleChange: (role: string | null) => void;
}

export function PreferencesSection({ viewAsRole, onViewAsRoleChange }: Readonly<PreferencesSectionProps>) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const push = usePushNotifications();
  const canManageRoles = hasPermission('admin.roles');
  const [availableRoles, setAvailableRoles] = useState<{ name: string }[]>([]);

  useEffect(() => {
    if (!canManageRoles) return;
    api.get('/admin/roles')
      .then(({ data }) => setAvailableRoles(data))
      .catch((err) => console.warn('[PreferencesSection] roles fetch failed', err));
  }, [canManageRoles]);

  return (
    <div className="space-y-6">
      {push.supported && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-ndp-accent/10 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-ndp-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ndp-text">
                {t('account.preferences.notifications.title', 'Notifications push')}
              </h3>
              <p className="text-xs text-ndp-text-dim mt-1">
                {push.subscribed
                  ? t('account.preferences.notifications.on', 'Activées sur cet appareil.')
                  : t('account.preferences.notifications.off', 'Recevez des alertes même quand Oscarr est fermé.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => push.subscribed ? push.unsubscribe() : push.subscribe()}
              disabled={push.loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                push.subscribed
                  ? 'bg-ndp-success/15 text-ndp-success hover:bg-ndp-success/25'
                  : 'bg-ndp-accent/15 text-ndp-accent hover:bg-ndp-accent/25'
              } disabled:opacity-50`}
            >
              {push.subscribed ? t('account.preferences.notifications.disable', 'Désactiver') : t('account.preferences.notifications.enable', 'Activer')}
            </button>
          </div>
        </div>
      )}

      {import.meta.env.DEV && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5 text-ndp-text-dim" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ndp-text">
                {t('account.preferences.language.title', 'Langue (dev)')}
              </h3>
              <p className="text-xs text-ndp-text-dim mt-1">
                {t('account.preferences.language.help', 'En production, la langue suit le réglage instance.')}
              </p>
            </div>
            <select
              value={i18n.language.split('-')[0]}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 cursor-pointer flex-shrink-0"
            >
              {Object.keys(i18n.options.resources || {}).map((code) => (
                <option key={code} value={code}>
                  {new Intl.DisplayNames([code], { type: 'language' }).of(code)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {canManageRoles && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              {viewAsRole
                ? <EyeOff className="w-5 h-5 text-purple-400" />
                : <Eye className="w-5 h-5 text-purple-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-ndp-text">
                {t('account.preferences.view_as.title', 'Voir comme rôle')}
              </h3>
              <p className="text-xs text-ndp-text-dim mt-1">
                {t('account.preferences.view_as.help', "Prévisualisez l'app avec les permissions d'un autre rôle.")}
              </p>
            </div>
            <select
              value={viewAsRole || ''}
              onChange={(e) => onViewAsRoleChange(e.target.value || null)}
              className="bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/40 cursor-pointer flex-shrink-0"
            >
              <option value="">{t('admin.view_as.off', 'View as role...')}</option>
              {availableRoles.filter((r) => r.name !== 'admin').map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
