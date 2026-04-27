export const DASHBOARD_ICONS = [
  'Home', 'LayoutDashboard', 'BarChart3', 'PieChart', 'Activity', 'TrendingUp',
  'Server', 'Cpu', 'HardDrive', 'Database', 'Cloud', 'Globe',
  'Bell', 'Mail', 'MessageSquare', 'Send',
  'Users', 'User', 'UserCheck', 'Shield', 'Lock', 'Key',
  'Calendar', 'Clock', 'Timer',
  'CheckCircle', 'AlertCircle', 'AlertTriangle', 'Info',
  'Star', 'Heart', 'Bookmark', 'Tag', 'Flag',
  'Folder', 'File', 'FileText', 'Image', 'Music', 'Video', 'Film', 'BookOpen',
  'Settings', 'Wrench', 'Zap', 'Sparkles', 'Plug',
  'Layers', 'Grid3x3', 'List', 'Filter', 'Search',
  'Download', 'Upload', 'RefreshCw', 'Power',
] as const;

export type DashboardIcon = typeof DASHBOARD_ICONS[number];

export function isDashboardIcon(name: string): name is DashboardIcon {
  return (DASHBOARD_ICONS as readonly string[]).includes(name);
}
