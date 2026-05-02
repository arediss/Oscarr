// Curated brand-logo set for the IconPicker (#167) — kept tight on purpose so we don't ship the
// full 3000-icon simple-icons catalog. Tree-shaken: only the named imports below land in the
// bundle (~ a few KB total).
import {
  siDiscord, siGithub, siPlex, siPatreon, siX, siYoutube, siReddit,
  siTwitch, siInstagram, siMastodon, siBluesky, siGitlab, siKofi, siBuymeacoffee, siSpotify, siTelegram, siMatrix,
} from 'simple-icons';

export interface BrandIcon {
  id: string;
  title: string;
  /** Hex color from simple-icons (no `#`). */
  hex: string;
  /** Single-path SVG, viewBox 0 0 24 24. */
  path: string;
}

export const BRAND_ICONS: BrandIcon[] = [
  { id: 'discord', title: siDiscord.title, hex: siDiscord.hex, path: siDiscord.path },
  { id: 'github', title: siGithub.title, hex: siGithub.hex, path: siGithub.path },
  { id: 'gitlab', title: siGitlab.title, hex: siGitlab.hex, path: siGitlab.path },
  { id: 'plex', title: siPlex.title, hex: siPlex.hex, path: siPlex.path },
  { id: 'spotify', title: siSpotify.title, hex: siSpotify.hex, path: siSpotify.path },
  { id: 'youtube', title: siYoutube.title, hex: siYoutube.hex, path: siYoutube.path },
  { id: 'twitch', title: siTwitch.title, hex: siTwitch.hex, path: siTwitch.path },
  { id: 'reddit', title: siReddit.title, hex: siReddit.hex, path: siReddit.path },
  { id: 'x', title: siX.title, hex: siX.hex, path: siX.path },
  { id: 'bluesky', title: siBluesky.title, hex: siBluesky.hex, path: siBluesky.path },
  { id: 'mastodon', title: siMastodon.title, hex: siMastodon.hex, path: siMastodon.path },
  { id: 'instagram', title: siInstagram.title, hex: siInstagram.hex, path: siInstagram.path },
  { id: 'telegram', title: siTelegram.title, hex: siTelegram.hex, path: siTelegram.path },
  { id: 'matrix', title: siMatrix.title, hex: siMatrix.hex, path: siMatrix.path },
  { id: 'patreon', title: siPatreon.title, hex: siPatreon.hex, path: siPatreon.path },
  { id: 'kofi', title: siKofi.title, hex: siKofi.hex, path: siKofi.path },
  { id: 'buymeacoffee', title: siBuymeacoffee.title, hex: siBuymeacoffee.hex, path: siBuymeacoffee.path },
];

export const BRAND_ICONS_BY_ID = Object.fromEntries(BRAND_ICONS.map((b) => [b.id, b])) as Record<string, BrandIcon>;
