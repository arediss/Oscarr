// Plugin wire types moved to @oscarr/shared. Re-exported here so existing
// `import { PluginInfo } from '@/plugins/types'` paths keep working.
export type {
  PluginUIContribution, PluginInfo, PluginSettingDef, PluginSettings,
} from '@oscarr/shared';
import type { PluginUIContribution } from '@oscarr/shared';

/** Props received by a plugin hook component — frontend-only, stays here. */
export interface HookComponentProps {
  contribution: PluginUIContribution;
  context: Record<string, unknown>;
}
