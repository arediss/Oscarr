/** Canonical color map for every auth / media provider — the single source of truth consumed
 *  by UsersTab, AuthProvidersTab, LoginPage, ServiceModal, and plugin constants. Adding a new
 *  provider? Register its color here and everywhere downstream picks it up automatically. */

export interface ProviderColor {
  /** Brand hex — useful for plain inline styles / SVG fills. */
  hex: string;
  /** Tailwind arbitrary-value classes for a colored badge background + text. */
  badgeClass: string;
  /** Login button style — solid brand color background with contrasting text + hover variant. */
  buttonClass: string;
}

const DEFAULT: ProviderColor = {
  hex: '#7c5cff',
  badgeClass: 'bg-ndp-accent/15 text-ndp-accent',
  buttonClass: 'bg-ndp-accent hover:bg-ndp-accent-hover text-white',
};

const PROVIDERS: Record<string, ProviderColor> = {
  plex:     { hex: '#e5a00d', badgeClass: 'bg-[#e5a00d]/15 text-[#e5a00d]', buttonClass: 'bg-[#e5a00d] hover:bg-[#cc8c00] text-black' },
  jellyfin: { hex: '#00a4dc', badgeClass: 'bg-[#00a4dc]/15 text-[#00a4dc]', buttonClass: 'bg-[#00a4dc] hover:bg-[#0090c4] text-white' },
  emby:     { hex: '#52b54b', badgeClass: 'bg-[#52b54b]/15 text-[#52b54b]', buttonClass: 'bg-[#52b54b] hover:bg-[#429a3d] text-white' },
  discord:  { hex: '#5865f2', badgeClass: 'bg-[#5865f2]/15 text-[#5865f2]', buttonClass: 'bg-[#5865F2] hover:bg-[#4752C4] text-white' },
  email:    { hex: '#94a3b8', badgeClass: 'bg-slate-500/15 text-slate-400', buttonClass: 'bg-ndp-accent hover:bg-ndp-accent-hover text-white' },
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

export function getProviderButtonClass(id: string): string {
  return getProviderColor(id).buttonClass;
}
