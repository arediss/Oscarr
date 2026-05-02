import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Home } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Tooltip } from '@/components/ui/Tooltip';

export function AdminJumpButton() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!hasPermission('admin.*')) return null;

  const inAdmin = location.pathname.startsWith('/admin');
  const Icon = inAdmin ? Home : Shield;
  const label = inAdmin ? t('admin.back_to_app', 'Retour Oscarr') : t('nav.admin');

  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={() => navigate(inAdmin ? '/' : '/admin')}
        aria-label={label}
        className="p-2 rounded-xl text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors"
      >
        <Icon className="w-5 h-5" />
      </button>
    </Tooltip>
  );
}
