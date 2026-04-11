import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';

const APP_VERSION = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../../package.json'), 'utf-8'),
).version as string;

function getDbPath(): string {
  const url = process.env.DATABASE_URL || 'file:../data/oscarr.db';
  const relativePath = url.replace('file:', '');
  return resolve(import.meta.dirname, '../../', relativePath);
}

function getBackupDir(): string {
  const dbPath = getDbPath();
  const dir = join(dirname(dbPath), 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Validate filename and resolve safe path inside backup dir (prevents path traversal) */
function safeBackupPath(filename: string): string | null {
  if (!/^oscarr-backup-[\w.-]+\.zip$/.test(filename)) return null;
  const dir = getBackupDir();
  const resolved = resolve(dir, filename);
  if (!resolved.startsWith(dir)) return null; // path traversal attempt
  return resolved;
}

/** Create a consistent copy of the DB (WAL-safe), optionally without TmdbCache */
function createDbCopy(dbPath: string, includeCache: boolean): string {
  const tmpPath = resolve(tmpdir(), `oscarr-backup-${randomUUID()}.db`);
  try {
    // VACUUM INTO creates a consistent, defragmented copy regardless of WAL state
    execFileSync('sqlite3', [dbPath, `VACUUM INTO '${tmpPath}';`], { timeout: 60000 });
  } catch {
    // Fallback if sqlite3 CLI not available
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

async function buildManifest(includeCache: boolean) {
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
    migrations: migrations.map(m => m.migration_name),
  };
}

async function createBackupZip(includeCache: boolean, outputPath: string): Promise<{ manifest: Record<string, unknown>; size: number }> {
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) throw new Error('Database file not found');

  const manifest = await buildManifest(includeCache);
  const dbCopy = createDbCopy(dbPath, includeCache);

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

export async function backupRoutes(app: FastifyInstance) {

  // ─── Download backup ────────────────────────────────────────────
  app.get('/backup/create', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      querystring: {
        type: 'object',
        properties: { includeCache: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const includeCache = (request.query as { includeCache?: string }).includeCache === 'true';
    const zipPath = resolve(tmpdir(), `oscarr-download-${randomUUID()}.zip`);

    try {
      const { manifest } = await createBackupZip(includeCache, zipPath);
      const stats = (manifest as { stats: Record<string, number> }).stats;
      const filename = `oscarr-backup-${APP_VERSION}-${new Date().toISOString().slice(0, 10)}.zip`;
      logEvent('info', 'Backup', `Backup downloaded: ${filename} (${stats.users} users, ${stats.media} media, cache: ${includeCache})`);

      const zipBuffer = readFileSync(zipPath);
      try { unlinkSync(zipPath); } catch { /* cleanup */ }

      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(zipBuffer);
    } catch (err) {
      try { unlinkSync(zipPath); } catch { /* cleanup */ }
      return reply.status(500).send({ error: 'Failed to create backup' });
    }
  });

  // ─── List saved backups ─────────────────────────────────────────
  app.get('/backup/list', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async () => {
    const dir = getBackupDir();
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const stat = statSync(join(dir, f));
        return { filename: f, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return files;
  });

  // ─── Download a saved backup ────────────────────────────────────
  app.get('/backup/download/:filename', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { params: { type: 'object', required: ['filename'], properties: { filename: { type: 'string' } } } },
  }, async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const filePath = safeBackupPath(filename);
    if (!filePath) return reply.status(400).send({ error: 'Invalid filename' });
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Backup not found' });

    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(readFileSync(filePath));
  });

  // ─── Delete a saved backup ──────────────────────────────────────
  app.delete('/backup/:filename', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { params: { type: 'object', required: ['filename'], properties: { filename: { type: 'string' } } } },
  }, async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const filePath = safeBackupPath(filename);
    if (!filePath) return reply.status(400).send({ error: 'Invalid filename' });
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'Backup not found' });

    unlinkSync(filePath);
    logEvent('info', 'Backup', `Backup deleted: ${filename}`);
    return { ok: true };
  });

  // ─── Validate backup ───────────────────────────────────────────
  app.post('/backup/validate', async (request, reply) => {
    const body = request.body as { manifest?: { version: string; stats: Record<string, number>; migrations: string[] } };
    if (!body?.manifest) return reply.status(400).send({ error: 'Manifest required' });

    const { version, stats, migrations } = body.manifest;
    if (!version || !/^\d+\.\d+\.\d+/.test(version)) return reply.status(400).send({ error: 'Invalid version format' });
    const [major, minor] = version.split('.').map(Number);
    const [curMajor, curMinor] = APP_VERSION.split('.').map(Number);

    if (major > curMajor || (major === curMajor && minor > curMinor)) {
      return reply.status(400).send({ error: 'BACKUP_TOO_NEW', backupVersion: version, currentVersion: APP_VERSION });
    }

    return {
      compatible: true,
      backupVersion: version,
      currentVersion: APP_VERSION,
      needsMigration: version !== APP_VERSION,
      stats,
      migrationsInBackup: migrations?.length ?? 0,
    };
  });

  // ─── Restore backup ─────────────────────────────────────────────
  const maxRestoreSize = parseInt(process.env.BACKUP_MAX_SIZE_MB || '500', 10) * 1024 * 1024;
  app.post('/backup/restore', { bodyLimit: maxRestoreSize, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { db?: string; manifest?: { version: string } };
    if (!body?.db || !body?.manifest) return reply.status(400).send({ error: 'Database and manifest required' });

    const { version } = body.manifest;
    if (!version || !/^\d+\.\d+\.\d+/.test(version)) return reply.status(400).send({ error: 'Invalid version format' });
    const [major, minor] = version.split('.').map(Number);
    const [curMajor, curMinor] = APP_VERSION.split('.').map(Number);
    if (major > curMajor || (major === curMajor && minor > curMinor)) {
      return reply.status(400).send({ error: 'BACKUP_TOO_NEW' });
    }

    const dbPath = getDbPath();
    const backupPath = `${dbPath}.pre-restore.bak`;

    try { copyFileSync(dbPath, backupPath); } catch {
      return reply.status(500).send({ error: 'Failed to create safety backup' });
    }

    try {
      const dbBuffer = Buffer.from(body.db, 'base64');
      const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');
      if (dbBuffer.length < 16 || !dbBuffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
        return reply.status(400).send({ error: 'Invalid database file' });
      }
      const dbDir = dirname(dbPath);
      if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
      writeFileSync(dbPath, dbBuffer);
    } catch {
      try { copyFileSync(backupPath, dbPath); } catch { /* critical */ }
      return reply.status(500).send({ error: 'Failed to write database. Original restored.' });
    }

    logEvent('info', 'Backup', `Database restored from v${version} backup. Restart required.`);
    return { ok: true, message: 'Database restored. Restart required.', needsRestart: true };
  });
}

// ─── Auto-backup job (called by scheduler) ────────────────────────

export async function runAutoBackup(): Promise<{ filename: string; size: number }> {
  const dir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filename = `oscarr-backup-auto-${APP_VERSION}-${timestamp}.zip`;
  const outputPath = join(dir, filename);

  const { size } = await createBackupZip(false, outputPath);

  // Cleanup: keep only the last N backups
  const maxBackups = parseInt(process.env.BACKUP_RETENTION || '7', 10);
  const autoBackups = readdirSync(dir)
    .filter(f => f.startsWith('oscarr-backup-auto-') && f.endsWith('.zip'))
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);

  for (const old of autoBackups.slice(maxBackups)) {
    try { unlinkSync(join(dir, old)); } catch { /* ignore */ }
  }

  logEvent('info', 'Backup', `Auto-backup created: ${filename} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return { filename, size };
}
