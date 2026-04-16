import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { usePluginUI } from '@/plugins/usePlugins';
import { PluginAdminTab } from '@/plugins/PluginAdminTab';
import { ADMIN_TABS } from './admin/tabsConfig';

import { GeneralTab } from './admin/GeneralTab';
import { UsersTab } from './admin/UsersTab';
import { ServicesTab } from './admin/ServicesTab';
import { MediaConfigTab } from './admin/MediaConfigTab';
import { NotificationsTab } from './admin/NotificationsTab';
import { JobsTab } from './admin/JobsTab';
import { LogsTab } from './admin/LogsTab';
import { PluginsTab } from './admin/PluginsTab';
import { RolesTab } from './admin/RolesTab';
import { HomepageTab } from './admin/HomepageTab';

export default function AdminPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { contributions: pluginTabs } = usePluginUI('admin.tabs');

  const pluginTabIds = useMemo(
    () => pluginTabs.map((c) => `plugin:${c.pluginId}`),
    [pluginTabs]
  );

  const tabFromUrl = searchParams.get('tab');
  const allTabIds = [...ADMIN_TABS.map((tb) => tb.id), ...pluginTabIds];
  const activeTab = tabFromUrl && allTabIds.includes(tabFromUrl) ? tabFromUrl : 'general';

  if (!user) return null;
  if (!hasPermission('admin.*')) {
    navigate('/');
    return null;
  }

  const activePluginTab = activeTab.startsWith('plugin:') ? activeTab.replace('plugin:', '') : null;

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-6" key={activeTab}>
      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'homepage' && <HomepageTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'services' && <ServicesTab />}
      {activeTab === 'media' && <MediaConfigTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'logs' && <LogsTab />}
      {activeTab === 'plugins' && <PluginsTab />}
      {activePluginTab && <PluginAdminTab pluginId={activePluginTab} />}
    </div>
  );
}
