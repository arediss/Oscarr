import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';

const INSTALL_FILE_PATH = process.env.INSTALL_FILE_PATH || './data/install.json';

/** Pre-fix path: relative to cwd. In the Docker image this landed in /app/data/install.json
 *  (ephemeral writable layer) instead of /data/install.json (persisted volume). If we see the
 *  old file but not the new one, migrate — a one-time copy preserves the install flag for
 *  users upgrading to the fixed image without forcing them through the wizard again. */
const LEGACY_INSTALL_FILE_PATH = './data/install.json';

let installed = false;

/** Load install state from disk (called once at startup) */
export function loadInstallState(): boolean {
  if (INSTALL_FILE_PATH !== LEGACY_INSTALL_FILE_PATH
      && !existsSync(INSTALL_FILE_PATH)
      && existsSync(LEGACY_INSTALL_FILE_PATH)) {
    try {
      mkdirSync(dirname(INSTALL_FILE_PATH), { recursive: true });
      copyFileSync(LEGACY_INSTALL_FILE_PATH, INSTALL_FILE_PATH);
    } catch {
      // Best-effort migration — if it fails, loadInstallState still reads legacy below.
    }
  }
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
