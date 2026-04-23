/** Canonical color map for every auth / media provider — the single source of truth consumed
 *  by UsersTab, AuthProvidersTab, LoginPage, ServiceModal, and plugin constants. Adding a new
 *  provider? Register its color here and everywhere downstream picks it up automatically. */

export interface ProviderColor {
  /** Brand hex — useful for plain inline styles / SVG fills. */
  hex: string;
  /** Tailwind arbitrary-value classes for a colored badge background + text. */
  badgeClass: string;
}

const DEFAULT: ProviderColor = {
  hex: '#7c5cff',
  badgeClass: 'bg-ndp-accent/15 text-ndp-accent',
};

const PROVIDERS: Record<string, ProviderColor> = {
  plex:     { hex: '#e5a00d', badgeClass: 'bg-[#e5a00d]/15 text-[#e5a00d]' },
  jellyfin: { hex: '#00a4dc', badgeClass: 'bg-[#00a4dc]/15 text-[#00a4dc]' },
  emby:     { hex: '#52b54b', badgeClass: 'bg-[#52b54b]/15 text-[#52b54b]' },
  discord:  { hex: '#5865f2', badgeClass: 'bg-[#5865f2]/15 text-[#5865f2]' },
  email:    { hex: '#94a3b8', badgeClass: 'bg-slate-500/15 text-slate-400' },
};

export function getProviderColor(id: string): ProviderColor {
  return PROVIDERS[id] ?? DEFAULT;
}

export function getProviderHex(id: string): string {
  return getProviderColor(id).hex;
}

export function getProviderBadgeClass(id: string): string {
  return getProviderColor(id).badgeClass;
}
