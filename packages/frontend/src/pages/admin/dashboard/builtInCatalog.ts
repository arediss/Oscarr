import type { ComponentType } from 'react';
import { StatsCountersWidget } from './widgets/StatsCountersWidget';

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
    defaultSize: { w: 12, h: 1 },
    minSize: { w: 4, h: 1 },
    Component: StatsCountersWidget,
  },
};

export function getBuiltInWidget(layoutI: string): BuiltInWidget | null {
  if (!layoutI.startsWith('builtin:')) return null;
  return BUILT_IN_WIDGETS[layoutI.slice('builtin:'.length)] ?? null;
}
