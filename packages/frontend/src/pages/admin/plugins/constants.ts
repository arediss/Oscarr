/** Registry entry shape returned by GET /plugins/registry — intentionally looser than the
 *  installed PluginInfo shape (no runtime state like `enabled` / `error` / `updateAvailable`,
 *  more marketing metadata like `stars` / `tags` / `category`). */
export interface RegistryPlugin {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description: string;
  author: string;
  repository: string;
  category: string;
  tags?: string[];
  url: string;
  stars: number;
  downloads?: number;
  updatedAt: string | null;
  services?: string[];
  capabilities?: string[];
  capabilityReasons?: Record<string, string>;
}

/** Label + pill color for each registry category. Keys must match the `category` field the
 *  registry JSON ships; unknown categories fall back to the raw string + a neutral color. */
export const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  bots: { label: 'Bot', color: 'bg-indigo-500/15 text-indigo-400' },
  notifications: { label: 'Notifications', color: 'bg-amber-500/15 text-amber-400' },
  automation: { label: 'Automation', color: 'bg-cyan-500/15 text-cyan-400' },
  'requests-workflow': { label: 'Requests', color: 'bg-pink-500/15 text-pink-400' },
  subscriptions: { label: 'Subscriptions', color: 'bg-fuchsia-500/15 text-fuchsia-400' },
  'ui-themes': { label: 'Themes', color: 'bg-purple-500/15 text-purple-400' },
  analytics: { label: 'Analytics', color: 'bg-emerald-500/15 text-emerald-400' },
  utilities: { label: 'Utilities', color: 'bg-slate-500/15 text-slate-400' },
};

/** Label + color for well-known tags so Plex / Jellyfin / Discord / etc. render with their
 *  brand hue. Unknown tags fall back to a neutral pill. */
export const TAG_CONFIG: Record<string, { label: string; color: string }> = {
  plex: { label: 'Plex', color: 'bg-[#e5a00d]/15 text-[#e5a00d]' },
  jellyfin: { label: 'Jellyfin', color: 'bg-violet-500/15 text-violet-400' },
  emby: { label: 'Emby', color: 'bg-green-500/15 text-green-400' },
  discord: { label: 'Discord', color: 'bg-indigo-500/15 text-indigo-400' },
  telegram: { label: 'Telegram', color: 'bg-sky-500/15 text-sky-400' },
  matrix: { label: 'Matrix', color: 'bg-teal-500/15 text-teal-400' },
  slack: { label: 'Slack', color: 'bg-rose-500/15 text-rose-400' },
  radarr: { label: 'Radarr', color: 'bg-yellow-500/15 text-yellow-400' },
  sonarr: { label: 'Sonarr', color: 'bg-blue-500/15 text-blue-400' },
};

export type SubTab = 'installed' | 'discover';
