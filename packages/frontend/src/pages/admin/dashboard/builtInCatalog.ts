import type { ComponentType } from 'react';

export interface BuiltInWidget {
  id: string;                  // matches the layout 'i' suffix after 'builtin:'
  title: string;               // displayed in WidgetChrome title bar
  icon: string;                // Lucide icon name
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  Component: ComponentType;    // widget body
}

/** Registry of built-in widgets. Keyed by short id (no 'builtin:' prefix). */
export const BUILT_IN_WIDGETS: Record<string, BuiltInWidget> = {};

/** Lookup by layout 'i' (e.g. 'builtin:stats-counters' → the entry). */
export function getBuiltInWidget(layoutI: string): BuiltInWidget | null {
  if (!layoutI.startsWith('builtin:')) return null;
  return BUILT_IN_WIDGETS[layoutI.slice('builtin:'.length)] ?? null;
}
