import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, unlinkSync, statSync, createWriteStream } from 'fs';
import { resolve, dirname, join } from 'path';
import { tmpdir } from 'os';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { execFileSync } from 'child_process';
import archiver from 'archiver';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';

/** Backup creation + HMAC signing + file rotation. Consumed by routes and scheduler. */

const APP_VERSION = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../package.json'), 'utf-8'),
).version as string;

export function getBackupAppVersion(): string {
  return APP_VERSION;
}

/** HMAC key derived from JWT_SECRET with a domain tag so it can't be reused for other HMACs. */
function getBackupHmacKey(): Buffer {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET required to sign backups');
  return createHmac('sha256', jwtSecret).update('oscarr-backup-v1').digest();
}

export function hmacOfBuffer(buf: Buffer): string {
  return createHmac('sha256', getBackupHmacKey()).update(buf).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function getDbPath(): string {
  const url = process.env.DATABASE_URL || 'file:../data/oscarr.db';
  const relativePath = url.replace('file:', '');
  // DATABASE_URL is relative to packages/backend/ (Prisma convention).
  return resolve(import.meta.dirname, '../', relativePath);
}

export function getBackupDir(): string {
  const dbPath = getDbPath();
  const dir = join(dirname(dbPath), 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Validate filename + resolve safe path inside backup dir (path-traversal guard). */
export function safeBackupPath(filename: string): string | null {
  if (!/^oscarr-backup-[\w.-]+\.zip$/.test(filename)) return null;
  const dir = getBackupDir();
  const resolved = resolve(dir, filename);
  if (!resolved.startsWith(dir)) return null;
  return resolved;
}

/** VACUUM INTO when sqlite3 CLI is present, raw copyFile fallback otherwise. */
function createDbCopy(dbPath: string, includeCache: boolean): string {
  const tmpPath = resolve(tmpdir(), `oscarr-backup-${randomUUID()}.db`);
  try {
    execFileSync('sqlite3', [dbPath, `VACUUM INTO '${tmpPath}';`], { timeout: 60000 });
  } catch {
    copyFileSync(dbPath, tmpPath);
  }
  if (!includeCache) {
    try {
      execFileSync('sqlite3', [tmpPath, 'DELETE FROM TmdbCache;'], { timeout: 30000 });
      execFileSync('sqlite3', [tmpPath, 'VACUUM;'], { timeout: 30000 });
    } catch { /* sqlite3 not available — keep full DB */ }
  }
  return tmpPath;
}

export async function buildManifest(includeCache: boolean) {
  const [userCount, mediaCount, requestCount, cacheCount] = await Promise.all([
    prisma.user.count(),
    prisma.media.count(),
    prisma.mediaRequest.count(),
    prisma.tmdbCache.count(),
  ]);

  const migrations = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at',
  );

  return {
    version: APP_VERSION,
    createdAt: new Date().toISOString(),
    includeCache,
    stats: { users: userCount, media: mediaCount, requests: requestCount, cache: includeCache ? cacheCount : 0 },
    migrations: migrations.map((m) => m.migration_name),
  };
}

export async function createBackupZip(
  includeCache: boolean,
  outputPath: string,
): Promise<{ manifest: Record<string, unknown>; size: number }> {
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) throw new Error('Database file not found');

  const baseManifest = await buildManifest(includeCache);
  const dbCopy = createDbCopy(dbPath, includeCache);

  const dbBuffer = readFileSync(dbCopy);
  const manifest = { ...baseManifest, integrity: hmacOfBuffer(dbBuffer) };

  await new Promise<void>((resolvePromise, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolvePromise());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.file(dbCopy, { name: 'oscarr.db' });
    archive.finalize();
  });

  try { unlinkSync(dbCopy); } catch { /* cleanup */ }
  const size = statSync(outputPath).size;
  return { manifest, size };
}

/** Scheduled auto-backup — rotates down to BACKUP_RETENTION (default 7). */
export async function runAutoBackup(): Promise<{ filename: string; size: number }> {
  const dir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filename = `oscarr-backup-auto-${APP_VERSION}-${timestamp}.zip`;
  const outputPath = join(dir, filename);

  const { size } = await createBackupZip(false, outputPath);

  const maxBackups = parseInt(process.env.BACKUP_RETENTION || '7', 10);
  const autoBackups = readdirSync(dir)
    .filter((f) => f.startsWith('oscarr-backup-auto-') && f.endsWith('.zip'))
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);

  for (const old of autoBackups.slice(maxBackups)) {
    try { unlinkSync(join(dir, old)); } catch { /* ignore */ }
  }

  logEvent('info', 'Backup', `Auto-backup created: ${filename} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return { filename, size };
}

/** Write a DB buffer to the live path with a pre-restore safety copy for rollback. */
export function applyDbBuffer(dbBuffer: Buffer): { ok: boolean; safetyPath: string } {
  const dbPath = getDbPath();
  const safetyPath = `${dbPath}.pre-restore.bak`;
  copyFileSync(dbPath, safetyPath);
  try {
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    writeFileSync(dbPath, dbBuffer);
    return { ok: true, safetyPath };
  } catch {
    try { copyFileSync(safetyPath, dbPath); } catch { /* critical */ }
    return { ok: false, safetyPath };
  }
}
