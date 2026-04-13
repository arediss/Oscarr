import { useEffect, useCallback, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Users,
  Shield,
  Server,
  Bell,
  Film,
  RefreshCw,
  ScrollText,
  Plug,
  ExternalLink,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePluginUI } from '@/plugins/usePlugins';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { PluginAdminTab } from '@/plugins/PluginAdminTab';

// Tab components
import { GeneralTab } from './admin/GeneralTab';
import { UsersTab } from './admin/UsersTab';
import { ServicesTab } from './admin/ServicesTab';
import { MediaConfigTab } from './admin/MediaConfigTab';
import { NotificationsTab } from './admin/NotificationsTab';
import { JobsTab } from './admin/JobsTab';
import { LogsTab } from './admin/LogsTab';
import { PluginsTab } from './admin/PluginsTab';
import { RolesTab } from './admin/RolesTab';

type Tab = 'users' | 'services' | 'media' | 'support' | 'notifications' | 'jobs' | 'logs' | 'general' | (string & {});

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'admin.tab.general', icon: Settings },
  { id: 'users', label: 'admin.tab.users', icon: Users },
  { id: 'roles', label: 'admin.tab.roles', icon: Shield },
  { id: 'services', label: 'admin.tab.services', icon: Server },
  { id: 'media', label: 'admin.tab.media', icon: Film },
  { id: 'notifications', label: 'admin.tab.notifications', icon: Bell },
  { id: 'jobs', label: 'admin.tab.jobs', icon: RefreshCw },
  { id: 'logs', label: 'admin.tab.logs', icon: ScrollText },
  { id: 'plugins', label: 'admin.tab.plugins', icon: Plug },
];

export default function AdminPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contributions: pluginTabs } = usePluginUI('admin.tabs');

  // Warnings per tab (e.g. missing config)
  const [warnings, setWarnings] = useState<Record<string, boolean>>({});
  const refreshWarnings = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/setup-status');
      setWarnings(data.warnings || {});
    } catch { /* ignore */ }
  }, []);
  const currentTab = searchParams.get('tab');
  useEffect(() => { refreshWarnings(); }, [currentTab, refreshWarnings]);

  const pluginTabItems = useMemo(() =>
    pluginTabs.map((c) => ({
      id: `plugin:${c.pluginId}`,
      label: typeof c.props.label === 'string' ? c.props.label : c.pluginId,
      pluginIcon: typeof c.props.icon === 'string' ? c.props.icon : 'Puzzle',
    })),
    [pluginTabs]
  );

  const tabFromUrl = searchParams.get('tab') as string | null;
  const allTabIds = [...TABS.map(t => t.id), ...pluginTabItems.map(t => t.id)];
  const activeTab = tabFromUrl && allTabIds.includes(tabFromUrl) ? tabFromUrl : 'general';

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  if (!hasPermission('admin.*')) { navigate('/'); return null; }

  const activePluginTab = activeTab.startsWith('plugin:') ? activeTab.replace('plugin:', '') : null;

  const renderSidebarItem = (id: string, label: string, icon: React.ReactNode, isPlugin = false) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      aria-current={activeTab === id ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left',
        activeTab === id
          ? 'bg-ndp-accent text-white'
          : 'text-ndp-text-muted hover:bg-ndp-surface-light'
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {!isPlugin && warnings[id] && activeTab !== id && (
        <span className="ml-auto w-2 h-2 bg-ndp-danger rounded-full flex-shrink-0" />
      )}
    </button>
  );

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-6">
      {/* Mobile: header + horizontal tabs */}
      <div className="md:hidden flex items-center gap-3 mb-4">
        <Shield className="w-5 h-5 text-ndp-accent" />
        <h1 className="text-xl font-bold text-ndp-text">{t('admin.title')}</h1>
      </div>

      {/* Mobile: horizontal tabs */}
      <div className="md:hidden flex gap-3 mb-6 overflow-x-auto pb-2 pt-1" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              activeTab === id ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light',
              warnings[id] && activeTab !== id && 'ring-1 ring-ndp-danger/50'
            )}
          >
            <Icon className="w-4 h-4" />
            {t(label)}
            {warnings[id] && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-ndp-danger rounded-full flex items-center justify-center text-[10px] font-bold text-white">!</span>
            )}
          </button>
        ))}
        {pluginTabItems.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              activeTab === tab.id ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
            )}
          >
            <DynamicIcon name={tab.pluginIcon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-0">
        {/* Desktop: sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <nav className="sticky top-24 space-y-0.5">
            <div className="flex items-center gap-2.5 px-3 mb-4">
              <Shield className="w-5 h-5 text-ndp-accent flex-shrink-0" />
              <h1 className="text-lg font-bold text-ndp-text">{t('admin.title')}</h1>
            </div>
            {TABS.map(({ id, label, icon: Icon }) =>
              renderSidebarItem(id, t(label), <Icon className="w-4 h-4 flex-shrink-0" />)
            )}

            {pluginTabItems.length > 0 && (
              <div className="mt-6 pt-5 border-t border-white/5 mx-1">
                <p className="text-[10px] text-ndp-text-dim uppercase tracking-wider px-2 mb-3 font-semibold">{t('admin.tab.plugins')}</p>
                <div className="space-y-0.5">
                  {pluginTabItems.map((tab) =>
                    renderSidebarItem(tab.id, tab.label, <DynamicIcon name={tab.pluginIcon} className="w-4 h-4 flex-shrink-0" />, true)
                  )}
                </div>
              </div>
            )}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 md:pl-8" key={activeTab}>
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'roles' && <RolesTab />}
          {activeTab === 'services' && <ServicesTab />}
          {activeTab === 'media' && <MediaConfigTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'jobs' && <JobsTab />}
          {activeTab === 'logs' && <LogsTab />}
          {activeTab === 'plugins' && <PluginsTab />}
          {activePluginTab && <PluginAdminTab pluginId={activePluginTab} />}
        </main>
      </div>
    </div>
  );
}
