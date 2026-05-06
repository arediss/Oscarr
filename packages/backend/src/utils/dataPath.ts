import { resolve, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { BACKEND_PRISMA_DIR } from './paths.js';

function getDbPath(): string {
  const url = process.env.DATABASE_URL || 'file:../data/oscarr.db';
  const relativePath = url.replace('file:', '');
  // Prisma resolves `file:` URLs relative to the schema's directory (where schema.prisma
  // lives), not the package root. The default `file:../data/oscarr.db` therefore lands at
  // packages/backend/data/oscarr.db — anchoring on BACKEND_PRISMA_DIR matches that exactly.
  return resolve(BACKEND_PRISMA_DIR, relativePath);
}

export function getDataRoot(): string {
  return dirname(getDbPath());
}

/** Path to a plugin's data dir without creating it. Caller decides whether to mkdir
 *  (writing) or just resolve (deleting / probing). Prevents two callers from drifting
 *  on the path layout. */
export function pluginDataDirPath(pluginId: string): string {
  return resolve(getDataRoot(), 'plugins', pluginId);
}

export async function getPluginDataDir(pluginId: string): Promise<string> {
  const dir = pluginDataDirPath(pluginId);
  await mkdir(dir, { recursive: true });
  return dir;
}
