import { PluginHookComponent } from '@/plugins/PluginHookComponent';
import type { PluginUIContribution } from '@/plugins/types';

interface PluginWidgetProps {
  pluginId: string;
  widgetId: string;
  contribution: PluginUIContribution;
}

interface ParsedId { pluginId: string; widgetId: string }

function parsePluginLayoutI(i: string): ParsedId | null {
  if (!i.startsWith('plugin:')) return null;
  const rest = i.slice('plugin:'.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return null;
  return { pluginId: rest.slice(0, sep), widgetId: rest.slice(sep + 1) };
}

export function PluginWidget({ pluginId, widgetId, contribution }: Readonly<PluginWidgetProps>) {
  return (
    <PluginHookComponent
      pluginId={pluginId}
      hookPoint="admin.dashboard.widget"
      context={{ widgetId }}
      contribution={contribution}
    />
  );
}

export { parsePluginLayoutI };
