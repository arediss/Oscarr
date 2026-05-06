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

export async function getPluginDataDir(pluginId: string): Promise<string> {
  const dir = resolve(getDataRoot(), 'plugins', pluginId);
  await mkdir(dir, { recursive: true });
  return dir;
}
