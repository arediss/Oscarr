import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, User as UserIcon, Sliders, LogOut, ChevronRight, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { useModal } from '@/hooks/useModal';
import { usePluginUI } from '@/plugins/usePlugins';
import { PluginHookComponent } from '@/plugins/PluginHookComponent';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import type { PluginUIContribution } from '@/plugins/types';
import { AccountSection } from './sections/AccountSection';
import { PreferencesSection } from './sections/PreferencesSection';

type BuiltInId = 'account' | 'preferences';

interface BuiltInSection {
  kind: 'builtin';
  id: BuiltInId;
  labelKey: string;
  icon: LucideIcon;
  order: number;
}

interface PluginSection {
  kind: 'plugin';
  /** Unique key across the merged list — `plugin:<pluginId>:<sectionId>`. */
  key: string;
  contribution: PluginUIContribution;
  label: string;
  iconName: string;
  permission?: string;
  order: number;
}

type Section = BuiltInSection | PluginSection;

const BUILT_IN_SECTIONS: BuiltInSection[] = [
  { kind: 'builtin', id: 'account', labelKey: 'account.sections.account', icon: UserIcon, order: 0 },
  { kind: 'builtin', id: 'preferences', labelKey: 'account.sections.preferences', icon: Sliders, order: 100 },
];

interface AccountSectionProps {
  id: string;
  label: string;
  icon: string;
  permission?: string;
}

function toPluginSection(c: PluginUIContribution): PluginSection | null {
  const props = c.props as Partial<AccountSectionProps>;
  if (!props || typeof props.id !== 'string' || typeof props.label !== 'string' || typeof props.icon !== 'string') {
    return null;
  }
  return {
    kind: 'plugin',
    key: `plugin:${c.pluginId}:${props.id}`,
    contribution: c,
    label: props.label,
    iconName: props.icon,
    permission: props.permission,
    order: typeof c.order === 'number' ? c.order : 1000,
  };
}

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  viewAsRole: string | null;
  onViewAsRoleChange: (role: string | null) => void;
}

export default function AccountModal({ open, onClose, viewAsRole, onViewAsRoleChange }: AccountModalProps) {
  const { t } = useTranslation();
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { dialogRef, titleId } = useModal({ open, onClose });
  const [activeKey, setActiveKey] = useState<string>('account');
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu');

  const { contributions } = usePluginUI('account.section');

  const sections = useMemo<Section[]>(() => {
    const pluginSections = contributions
      .map(toPluginSection)
      .filter((s): s is PluginSection => s !== null)
      .filter((s) => !s.permission || hasPermission(s.permission));
    return [...BUILT_IN_SECTIONS, ...pluginSections].sort((a, b) => a.order - b.order);
  }, [contributions, hasPermission]);

  const activeSection = useMemo<Section>(() => {
    const found = sections.find((s) => (s.kind === 'builtin' ? s.id : s.key) === activeKey);
    return found ?? BUILT_IN_SECTIONS[0];
  }, [activeKey, sections]);

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login');
  };

  const handleSelect = (key: string) => {
    setActiveKey(key);
    setMobileView('content');
  };

  if (!open || !user) return null;

  const avatarEl = user.avatar ? (
    <img src={user.avatar} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-white/10" />
  ) : (
    <div className="w-12 h-12 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent text-base font-bold ring-2 ring-white/10">
      {(user.displayName || user.email || '?')[0].toUpperCase()}
    </div>
  );

  const sectionContent = activeSection.kind === 'plugin'
    ? <PluginHookComponent
        pluginId={activeSection.contribution.pluginId}
        hookPoint="account.section"
        contribution={activeSection.contribution}
        context={{ user, hasPermission, close: onClose }}
      />
    : activeSection.id === 'account'
      ? <AccountSection />
      : <PreferencesSection viewAsRole={viewAsRole} onViewAsRoleChange={onViewAsRoleChange} />;

  const activeLabel = activeSection.kind === 'plugin'
    ? t(activeSection.label, activeSection.label)
    : t(activeSection.labelKey);
  const activeSubtitle = activeSection.kind === 'plugin'
    ? ''
    : t(`account.sections.${activeSection.id}.subtitle`, '');

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in p-0 md:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-ndp-bg w-full h-full md:w-full md:h-[78vh] md:max-w-5xl md:rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex border border-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside
          className={clsx(
            'w-full md:w-72 bg-ndp-surface/60 md:bg-white/[0.02] md:border-r border-white/5 flex flex-col flex-shrink-0',
            mobileView === 'content' ? 'hidden md:flex' : 'flex',
          )}
        >
          {/* User header */}
          <div className="px-5 py-5 flex items-center gap-3 border-b border-white/5">
            {avatarEl}
            <div className="flex-1 min-w-0">
              <p id={titleId} className="text-sm font-semibold text-ndp-text truncate">
                {user.displayName || user.email}
              </p>
              {user.role && (
                <p className="text-xs text-ndp-text-dim truncate capitalize">{user.role}</p>
              )}
            </div>
          </div>

          {/* Section list */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
            <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ndp-text-dim">
              {t('account.sections.settings', 'Paramètres')}
            </p>
            {sections.map((s) => {
              const key = s.kind === 'builtin' ? s.id : s.key;
              const label = s.kind === 'builtin' ? t(s.labelKey) : t(s.label, s.label);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelect(key)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                    activeKey === key
                      ? 'bg-ndp-accent/10 text-ndp-accent'
                      : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5',
                  )}
                >
                  {s.kind === 'builtin'
                    ? <s.icon className="w-4 h-4 flex-shrink-0" />
                    : <DynamicIcon name={s.iconName} className="w-4 h-4 flex-shrink-0" />}
                  <span className="flex-1 truncate">{label}</span>
                  <ChevronRight className="w-4 h-4 text-ndp-text-dim md:hidden" />
                </button>
              );
            })}

          </nav>

          {/* Logout */}
          <div className="px-3 py-3 border-t border-white/5">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors text-left"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{t('nav.logout')}</span>
            </button>
          </div>
        </aside>

        {/* Content */}
        <section
          className={clsx(
            'flex-1 min-w-0 flex flex-col relative',
            mobileView === 'menu' ? 'hidden md:flex' : 'flex',
          )}
        >
          <button
            type="button"
            onClick={() => setMobileView('menu')}
            className="md:hidden absolute top-4 left-4 z-10 p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
            aria-label={t('common.back', 'Retour')}
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="absolute top-4 right-4 z-10 p-2 rounded-xl text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 overflow-y-auto px-6 md:px-8 pt-6 pb-6">
            <div className="mb-6 pl-10 md:pl-0 pr-12">
              <h2 className="text-lg font-bold text-ndp-text truncate">{activeLabel}</h2>
              {activeSubtitle && (
                <p className="text-xs text-ndp-text-dim mt-0.5">{activeSubtitle}</p>
              )}
            </div>
            {sectionContent}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
