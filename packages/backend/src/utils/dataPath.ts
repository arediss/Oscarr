import { resolve, dirname } from 'path';
import { mkdir } from 'fs/promises';
import { BACKEND_ROOT } from './paths.js';

function getDbPath(): string {
  const url = process.env.DATABASE_URL || 'file:../data/oscarr.db';
  const relativePath = url.replace('file:', '');
  // DATABASE_URL is Prisma-relative to packages/backend/ (the schema lives there).
  return resolve(BACKEND_ROOT, relativePath);
}

export function getDataRoot(): string {
  return dirname(getDbPath());
}

export async function getPluginDataDir(pluginId: string): Promise<string> {
  const dir = resolve(getDataRoot(), 'plugins', pluginId);
  await mkdir(dir, { recursive: true });
  return dir;
}
