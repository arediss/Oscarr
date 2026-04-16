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
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

export type AdminTabId =
  | 'general'
  | 'homepage'
  | 'users'
  | 'roles'
  | 'services'
  | 'media'
  | 'notifications'
  | 'jobs'
  | 'logs'
  | 'plugins'
  | (string & {});

export interface AdminTabDef {
  id: AdminTabId;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_TABS: AdminTabDef[] = [
  { id: 'general', label: 'admin.tab.general', icon: Settings },
  { id: 'homepage', label: 'admin.tab.homepage', icon: LayoutDashboard },
  { id: 'users', label: 'admin.tab.users', icon: Users },
  { id: 'roles', label: 'admin.tab.roles', icon: Shield },
  { id: 'services', label: 'admin.tab.services', icon: Server },
  { id: 'media', label: 'admin.tab.media', icon: Film },
  { id: 'notifications', label: 'admin.tab.notifications', icon: Bell },
  { id: 'jobs', label: 'admin.tab.jobs', icon: RefreshCw },
  { id: 'logs', label: 'admin.tab.logs', icon: ScrollText },
  { id: 'plugins', label: 'admin.tab.plugins', icon: Plug },
];
