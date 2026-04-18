import { randomUUID } from 'crypto';
import { createWriteStream, existsSync } from 'fs';
import { mkdir, readFile, readdir, rename, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { extract as tarExtract } from 'tar';
import { parseManifest } from './manifestSchema.js';
import { getPluginsDir } from './loader.js';
import type { PluginManifest } from './types.js';

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${res.statusText}`);
  if (!res.body) throw new Error('Download returned empty body');
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
  const fileStream = createWriteStream(destPath);
  await pipeline(nodeStream, fileStream);
}

// Manifest may live either at the archive root or inside a single top-level directory
// (common for GitHub auto-generated source tarballs named `<repo>-<sha>/`). Look one level deep.
async function findManifestRoot(extractedDir: string): Promise<string> {
  if (existsSync(join(extractedDir, 'manifest.json'))) return extractedDir;
  const entries = await readdir(extractedDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(extractedDir, entry.name);
    if (existsSync(join(candidate, 'manifest.json'))) return candidate;
  }
  throw new Error('No manifest.json found in the downloaded archive (looked at root + one level down)');
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
