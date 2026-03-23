import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldX, MessageSquare, Server } from 'lucide-react';

export default function NoAccessPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="card p-8">
        <ShieldX className="w-16 h-16 text-ndp-warning mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-ndp-text mb-2">{t('noAccess.title')}</h1>
        <p className="text-ndp-text-muted mb-6">
          {t('noAccess.greeting', { username: user?.plexUsername || user?.email })}
        </p>

        <div className="space-y-4 text-left mb-8">
          <div className="flex items-start gap-3 p-4 bg-ndp-danger/5 border border-ndp-danger/20 rounded-xl">
            <Server className="w-5 h-5 text-ndp-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-ndp-danger">{t('noAccess.no_server_access')}</p>
              <p className="text-xs text-ndp-text-muted mt-1">
                {t('noAccess.no_server_description')}
              </p>
            </div>
          </div>
        </div>

        <p className="text-ndp-text-muted text-sm mb-6">
          {t('noAccess.support_help')}
        </p>

        <Link to="/support" className="btn-primary inline-flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {t('noAccess.contact_support')}
        </Link>
      </div>
    </div>
  );
}
