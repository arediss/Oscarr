import type { ComponentType } from 'react';
import { StatsCountersWidget } from './widgets/StatsCountersWidget';
import { ServiceHealthWidget } from './widgets/ServiceHealthWidget';
import { SystemWidget } from './widgets/SystemWidget';

export interface BuiltInWidget {
  id: string;
  title: string;
  icon: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  Component: ComponentType;
}

export const BUILT_IN_WIDGETS: Record<string, BuiltInWidget> = {
  'stats-counters': {
    id: 'stats-counters',
    title: 'Stats',
    icon: 'BarChart3',
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 4, h: 2 },
    Component: StatsCountersWidget,
  },
  'service-health': {
    id: 'service-health',
    title: 'Service health',
    icon: 'Server',
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 4, h: 3 },
    Component: ServiceHealthWidget,
  },
  'system': {
    id: 'system',
    title: 'System',
    icon: 'Info',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
    Component: SystemWidget,
  },
};

export function getBuiltInWidget(layoutI: string): BuiltInWidget | null {
  if (!layoutI.startsWith('builtin:')) return null;
  return BUILT_IN_WIDGETS[layoutI.slice('builtin:'.length)] ?? null;
}
