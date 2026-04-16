import { resolve, dirname } from 'path';
import { mkdir } from 'fs/promises';

function getDbPath(): string {
  const url = process.env.DATABASE_URL || 'file:../data/oscarr.db';
  const relativePath = url.replace('file:', '');
  return resolve(import.meta.dirname, '../', relativePath);
}

export function getDataRoot(): string {
  return dirname(getDbPath());
}

export async function getPluginDataDir(pluginId: string): Promise<string> {
  const dir = resolve(getDataRoot(), 'plugins', pluginId);
  await mkdir(dir, { recursive: true });
  return dir;
}
