import { usePluginUI } from '@/plugins/usePlugins';
import { PluginHookComponent } from '@/plugins/PluginHookComponent';

interface PluginWidgetProps {
  /** Layout 'i' value. Format: 'plugin:<pluginId>:<widgetId>'. */
  layoutI: string;
}

interface ParsedId { pluginId: string; widgetId: string }

function parsePluginLayoutI(i: string): ParsedId | null {
  if (!i.startsWith('plugin:')) return null;
  const rest = i.slice('plugin:'.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return null;
  return { pluginId: rest.slice(0, sep), widgetId: rest.slice(sep + 1) };
}

export function PluginWidget({ layoutI }: PluginWidgetProps) {
  const parsed = parsePluginLayoutI(layoutI);
  const { contributions } = usePluginUI('admin.dashboard.widget');

  if (!parsed) {
    return <p className="text-xs text-ndp-text-dim">Invalid plugin widget id</p>;
  }
  const contribution = contributions.find(
    (c) => c.pluginId === parsed.pluginId && c.props?.id === parsed.widgetId,
  );
  if (!contribution) return null;  // ghost case — handled by DashboardGrid

  return (
    <PluginHookComponent
      pluginId={parsed.pluginId}
      hookPoint="admin.dashboard.widget"
      context={{ widgetId: parsed.widgetId }}
      contribution={contribution}
    />
  );
}

export { parsePluginLayoutI };
