import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const INSTALL_FILE_PATH = process.env.INSTALL_FILE_PATH || './data/install.json';

let installed = false;

/** Load install state from disk (called once at startup) */
export function loadInstallState(): boolean {
  try {
    const raw = readFileSync(INSTALL_FILE_PATH, 'utf-8');
    const data = JSON.parse(raw) as { installed?: boolean };
    installed = data.installed === true;
  } catch {
    // File doesn't exist or is invalid — not installed
    installed = false;
  }
  return installed;
}

/** Get cached install state (no disk read) */
export function isInstalled(): boolean {
  return installed;
}

/** Mark as installed and write to disk */
export function markInstalled(): void {
  installed = true;
  const dir = dirname(INSTALL_FILE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(INSTALL_FILE_PATH, JSON.stringify({ installed: true }, null, 2), 'utf-8');
}
