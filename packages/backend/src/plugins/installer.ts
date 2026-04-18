import { randomUUID } from 'crypto';
import { createWriteStream, existsSync } from 'fs';
import { mkdir, readFile, readdir, rename, rm } from 'fs/promises';
import { lookup as dnsLookup } from 'dns/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { extract as tarExtract } from 'tar';
import { parseManifest } from './manifestSchema.js';
import { getPluginsDir } from './loader.js';
import type { PluginManifest } from './types.js';

const DOWNLOAD_TIMEOUT_MS = 60_000;

/** CIDR check against IPv4 private / loopback / link-local ranges (blocks SSRF to internal infra). */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;                              // 10.0.0.0/8
  if (a === 127) return true;                             // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;                // 169.254.0.0/16 link-local (AWS IMDS, etc.)
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 0) return true;                               // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;                       // loopback
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
  if (lower.startsWith('fe80:')) return true;             // link-local
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  // Some fetch implementations return an IP in the URL if the input had one; otherwise resolve it.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) throw new Error(`Refusing to download from private IPv4 ${hostname}`);
    return;
  }
  if (hostname.includes(':')) {
    if (isPrivateIPv6(hostname)) throw new Error(`Refusing to download from private IPv6 ${hostname}`);
    return;
  }
  // Hostname — resolve and check all returned addresses (some hosts round-robin internal IPs).
  const addresses = await dnsLookup(hostname, { all: true }).catch(() => [] as Array<{ address: string; family: number }>);
  for (const { address, family } of addresses) {
    const blocked = family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
    if (blocked) throw new Error(`Refusing to download from ${hostname} → ${address} (private network)`);
  }
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const parsed = new URL(url);
  await assertPublicHost(parsed.hostname);

  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${res.statusText}`);
  if (!res.body) throw new Error('Download returned empty body');

  // After redirect resolution, re-check the final URL in case a public host 302'd us to an internal one.
  const finalUrl = new URL(res.url);
  await assertPublicHost(finalUrl.hostname);

  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
  const fileStream = createWriteStream(destPath);
  await pipeline(nodeStream, fileStream);
}

// Manifest may live either at the archive root or inside a single top-level directory
// (common for GitHub auto-generated source tarballs named `<repo>-<sha>/`). Refuse if multiple
// candidates exist — a legit plugin archive contains exactly one manifest, anything else is
// either bogus or a deliberate attempt to hide a second plugin inside the tarball.
async function findManifestRoot(extractedDir: string): Promise<string> {
  if (existsSync(join(extractedDir, 'manifest.json'))) return extractedDir;
  const entries = await readdir(extractedDir, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (existsSync(join(extractedDir, entry.name, 'manifest.json'))) candidates.push(entry.name);
  }
  if (candidates.length === 0) {
    throw new Error('No manifest.json found in the downloaded archive (looked at root + one level down)');
  }
  if (candidates.length > 1) {
    throw new Error(`Archive contains multiple manifest.json files (${candidates.join(', ')}) — plugin archives must have exactly one`);
  }
  return join(extractedDir, candidates[0]);
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  dir: string;
}

/**
 * Download + extract + validate + move a plugin tarball into the plugins directory.
 * Returns the installed dir so the engine can load the plugin in place.
 *
 * Supported archive formats: tar.gz / tgz (any archive that `tar` can consume).
 *
 * Does NOT load the plugin — the engine's loadSingle() picks up from the final dir.
 * On any failure, the working tmp dir is cleaned up.
 */
export async function installPluginFromUrl(url: string): Promise<InstalledPlugin> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Only http(s) URLs are supported');
  }
  const workDir = join(tmpdir(), `oscarr-plugin-install-${randomUUID()}`);
  const downloadPath = join(workDir, 'download.tar.gz');
  const extractDir = join(workDir, 'extracted');

  try {
    await mkdir(extractDir, { recursive: true });
    await downloadToFile(url, downloadPath);
    await tarExtract({ file: downloadPath, cwd: extractDir });

    const manifestRoot = await findManifestRoot(extractDir);
    const raw = await readFile(join(manifestRoot, 'manifest.json'), 'utf-8');
    const data = JSON.parse(raw);
    const manifest = parseManifest(data, manifestRoot) as PluginManifest;

    const targetDir = join(getPluginsDir(), manifest.id);
    if (existsSync(targetDir)) {
      throw new Error(
        `Plugin "${manifest.id}" already installed at ${targetDir}. Uninstall it first.`
      );
    }

    await rename(manifestRoot, targetDir);
    return { manifest, dir: targetDir };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => { /* best-effort */ });
  }
}
