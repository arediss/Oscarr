import { randomUUID } from 'crypto';
import { createWriteStream, existsSync } from 'fs';
import { mkdir, readFile, readdir, rename, rm } from 'fs/promises';
import { lookup as dnsLookup } from 'dns/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { extract as tarExtract } from 'tar';
import { Agent, fetch as undiciFetch } from 'undici';
import { parseManifest } from './manifestSchema.js';
import { getPluginsDir } from './loader.js';
import type { PluginManifest } from './types.js';

const DOWNLOAD_TIMEOUT_MS = 60_000;
// Hard cap on plugin tarballs. Oscarr plugins are small (a few hundred KB once bundled); 50 MB
// is generous and still keeps a misconfigured / malicious registry entry from filling /tmp.
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

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

function isPrivate(address: string, family: number): boolean {
  return family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
}

/**
 * Resolve the hostname once ourselves, pick a public address, and pin undici's connection to it.
 *
 * The previous implementation did a CIDR check with `dns.lookup`, then let `fetch` resolve again
 * when opening the socket. An attacker-controlled DNS zone can return public IPs on the first
 * lookup and a private IP on the second — a classic DNS-rebind SSRF bypass. By passing an Agent
 * with a custom `connect.lookup` we guarantee the socket connects to the address we validated.
 *
 * Pure IP URLs skip resolution and are CIDR-checked directly.
 */
async function buildPinnedAgent(hostname: string): Promise<{ agent: Agent; pinned: string }> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) throw new Error(`Refusing to download from private IPv4 ${hostname}`);
    return { agent: makeAgent(hostname, 4), pinned: hostname };
  }
  if (hostname.includes(':')) {
    if (isPrivateIPv6(hostname)) throw new Error(`Refusing to download from private IPv6 ${hostname}`);
    return { agent: makeAgent(hostname, 6), pinned: hostname };
  }
  const addresses = await dnsLookup(hostname, { all: true })
    .catch(() => [] as Array<{ address: string; family: number }>);
  if (addresses.length === 0) throw new Error(`DNS lookup failed for ${hostname}`);
  // Reject if ANY resolved address is private — some hosts round-robin internal IPs and we want
  // to fail closed rather than depend on luck-of-the-draw which public IP we'd pick.
  for (const { address, family } of addresses) {
    if (isPrivate(address, family)) {
      throw new Error(`Refusing to download from ${hostname} → ${address} (private network)`);
    }
  }
  const pick = addresses[0];
  return { agent: makeAgent(pick.address, pick.family), pinned: pick.address };
}

function makeAgent(pinnedIp: string, family: number): Agent {
  return new Agent({
    connect: {
      lookup: (_host, _opts, cb) => cb(null, pinnedIp, family),
    },
  });
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const parsed = new URL(url);
  const { agent } = await buildPinnedAgent(parsed.hostname);

  const res = await undiciFetch(url, {
    dispatcher: agent,
    redirect: 'follow',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${res.statusText}`);
  if (!res.body) throw new Error('Download returned empty body');

  // Final-URL recheck: if a redirect pointed at a different host, rebuild the agent so the next
  // hop doesn't bypass the pin. Our fetch already followed redirects with the original agent;
  // this is defence-in-depth for a future change that might fetch after an inspection.
  const finalUrl = new URL(res.url);
  if (finalUrl.hostname !== parsed.hostname) {
    await buildPinnedAgent(finalUrl.hostname);
  }

  // Content-length early-reject — best-effort, some servers omit it. We still enforce the
  // byte counter below.
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Plugin archive too large: ${declared} bytes (max ${MAX_DOWNLOAD_BYTES})`);
  }

  let received = 0;
  const sizeGate = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_DOWNLOAD_BYTES) {
        return cb(new Error(`Plugin archive exceeds ${MAX_DOWNLOAD_BYTES} bytes — aborted mid-download`));
      }
      cb(null, chunk);
    },
  });

  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
  const fileStream = createWriteStream(destPath);
  await pipeline(nodeStream, sizeGate, fileStream);
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
    await tarExtract({
      file: downloadPath,
      cwd: extractDir,
      // Reject anything that isn't a plain file or directory — symlink entries would survive the
      // move to plugins/<id>/ and, once the ESM loader follows them, could dynamic-import JS from
      // anywhere readable on disk (arbitrary code execution). Also refuse absolute paths and
      // `..` segments so a crafted archive can't write outside the extraction root.
      filter: (path, entry) => {
        // tar@7 types the filter as Stats | ReadEntry; for extract we only ever see ReadEntry,
        // and Stats happens to expose the same membership test for our shape guard.
        const type = 'type' in entry ? entry.type : null;
        if (type !== 'File' && type !== 'Directory') return false;
        if (path.startsWith('/') || path.split('/').includes('..')) return false;
        return true;
      },
    });

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
