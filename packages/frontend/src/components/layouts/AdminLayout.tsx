import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ArrowLeft, Menu, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_TABS } from '@/pages/admin/tabsConfig';
import { usePluginUI } from '@/plugins/usePlugins';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { UserCluster } from '@/components/nav/UserCluster';
import NotificationBell from '@/components/NotificationBell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contributions: pluginTabs } = usePluginUI('admin.tabs');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [warnings, setWarnings] = useState<Record<string, boolean>>({});
  const [viewAsRole, setViewAsRoleState] = useState<string | null>(sessionStorage.getItem('view-as-role'));

  const setViewAsRole = (role: string | null) => {
    if (role) sessionStorage.setItem('view-as-role', role);
    else sessionStorage.removeItem('view-as-role');
    setViewAsRoleState(role);
  };

  const refreshWarnings = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/setup-status');
      setWarnings(data.warnings || {});
    } catch { /* ignore */ }
  }, []);

  const currentTab = searchParams.get('tab');
  useEffect(() => { refreshWarnings(); }, [currentTab, refreshWarnings]);
  useEffect(() => { setDrawerOpen(false); }, [currentTab]);

  const pluginTabItems = useMemo(
    () =>
      pluginTabs.map((c) => ({
        id: `plugin:${c.pluginId}`,
        label: typeof c.props.label === 'string' ? c.props.label : c.pluginId,
        pluginIcon: typeof c.props.icon === 'string' ? c.props.icon : 'Puzzle',
      })),
    [pluginTabs]
  );

  const allTabIds = [...ADMIN_TABS.map((tb) => tb.id), ...pluginTabItems.map((tb) => tb.id)];
  const activeTab = currentTab && allTabIds.includes(currentTab) ? currentTab : 'general';
  const activeTabLabel =
    ADMIN_TABS.find((tb) => tb.id === activeTab)?.label ??
    pluginTabItems.find((tb) => tb.id === activeTab)?.label ??
    'admin.title';

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  if (!hasPermission('admin.*')) {
    navigate('/');
    return null;
  }

  const renderTabButton = (id: string, label: string, iconEl: React.ReactNode) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      aria-current={activeTab === id ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left',
        activeTab === id
          ? 'bg-ndp-accent/15 text-ndp-accent'
          : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
      )}
    >
      {iconEl}
      <span className="flex-1 truncate">{label}</span>
      {warnings[id] && activeTab !== id && (
        <span className="w-1.5 h-1.5 rounded-full bg-ndp-danger flex-shrink-0" />
      )}
    </button>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-4 pb-2">
        <Link
          to="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ndp-text-muted hover:text-ndp-accent hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('admin.back_to_app', 'Retour Oscarr')}</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-2 space-y-0.5 pb-4">
        {ADMIN_TABS.map(({ id, label, icon: Icon }) =>
          renderTabButton(id, t(label), <Icon className="w-4 h-4 flex-shrink-0" />)
        )}
        {pluginTabItems.length > 0 && (
          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-[10px] text-ndp-text-dim uppercase tracking-wider px-3 mb-2 font-semibold">
              {t('admin.tab.plugins')}
            </p>
            {pluginTabItems.map((tb) =>
              renderTabButton(tb.id, tb.label, <DynamicIcon name={tb.pluginIcon} className="w-4 h-4 flex-shrink-0" />)
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-white/5 p-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <UserCluster
            viewAsRole={viewAsRole}
            onViewAsRoleChange={setViewAsRole}
            variant="expanded"
            dropdownDirection="above"
          />
        </div>
        <NotificationBell dropdownDirection="above" />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ndp-bg flex">
      <aside className="hidden md:flex md:flex-col w-60 flex-shrink-0 bg-ndp-surface/40 border-r border-white/5 sticky top-0 h-dvh">
        {sidebarContent}
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-ndp-surface/95 backdrop-blur-xl border-b border-white/5 flex items-center h-14 px-3 gap-2">
        <Link
          to="/"
          className="p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors"
          aria-label={t('admin.back_to_app', 'Retour Oscarr')}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors"
          aria-label={t('admin.open_menu', 'Open admin menu')}
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-semibold text-ndp-text truncate flex-1 min-w-0">
          {t(activeTabLabel)}
        </h1>
      </div>

      <div
        className={clsx(
          'md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      <aside
        className={clsx(
          'md:hidden fixed left-0 top-0 bottom-0 z-50 w-72 bg-ndp-surface border-r border-white/5 transform transition-transform duration-300 flex flex-col',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-hidden={!drawerOpen}
      >
        <button
          onClick={() => setDrawerOpen(false)}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/5 transition-colors z-10"
          aria-label={t('common.close', 'Close')}
        >
          <X className="w-4 h-4 text-ndp-text-muted" />
        </button>
        {sidebarContent}
      </aside>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">{children}</main>
    </div>
  );
}
