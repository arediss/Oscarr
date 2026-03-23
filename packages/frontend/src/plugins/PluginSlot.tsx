import type { ReactNode } from 'react';
import { usePluginUI } from './usePlugins';
import type { PluginUIContribution } from './types';

interface PluginSlotProps {
  hookPoint: string;
  renderItem: (contribution: PluginUIContribution, index: number) => ReactNode;
}

export function PluginSlot({ hookPoint, renderItem }: PluginSlotProps) {
  const { contributions } = usePluginUI(hookPoint);
  if (!contributions.length) return null;
  return <>{contributions.map((c, i) => renderItem(c, i))}</>;
}
