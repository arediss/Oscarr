import semver from 'semver';
import type { PluginManifest } from './types.js';
import { readFileSync } from 'node:fs';
import { BACKEND_PACKAGE_JSON } from '../utils/paths.js';

/**
 * 🟢 `verified`     — Oscarr's current version is listed in the plugin's testedAgainst.
 * 🟡 `untested`     — Oscarr's version is in engines.oscarr range but not explicitly tested.
 * 🔴 `incompatible` — Oscarr's version is outside engines.oscarr range — plugin is refused.
 * ⚪ `unknown`      — Plugin declares no engines.oscarr at all (legacy pre-L5 plugin).
 */
export type CompatStatus = 'verified' | 'untested' | 'incompatible' | 'unknown';

let cachedVersion: string | null = null;
export function getOscarrVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(BACKEND_PACKAGE_JSON, 'utf-8')) as { version?: string };
    cachedVersion = pkg.version ?? '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}

export interface CompatResult {
  status: CompatStatus;
  range?: string;
  oscarrVersion: string;
  reason?: string;
}

export function checkCompat(manifest: PluginManifest, oscarrVersion = getOscarrVersion()): CompatResult {
  const range = manifest.engines?.oscarr;
  if (!range) {
    return {
      status: 'unknown',
      oscarrVersion,
      reason: 'Plugin does not declare engines.oscarr — cannot verify compatibility',
    };
  }
  if (!semver.validRange(range)) {
    return {
      status: 'incompatible',
      range,
      oscarrVersion,
      reason: `Invalid semver range: "${range}"`,
    };
  }
  if (!semver.satisfies(oscarrVersion, range, { includePrerelease: true })) {
    return {
      status: 'incompatible',
      range,
      oscarrVersion,
      reason: `Oscarr ${oscarrVersion} does not satisfy ${range}`,
    };
  }
  const tested = manifest.engines?.testedAgainst ?? [];
  if (tested.includes(oscarrVersion)) {
    return { status: 'verified', range, oscarrVersion };
  }
  return {
    status: 'untested',
    range,
    oscarrVersion,
    reason: `Oscarr ${oscarrVersion} is within range but wasn't explicitly tested by the author`,
  };
}
