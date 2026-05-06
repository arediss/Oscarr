import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type PluginDatabase = Database.Database;

export interface Migration {
  /** Strictly increasing integer. Plugin authors version their schema starting at 1. */
  version: number;
  up: string;
}

export function openDb(file: string): PluginDatabase {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Apply only the migrations whose version is greater than the current `_schema_version`,
 *  in ascending order, each in its own transaction. A failure rolls back that migration
 *  so the version counter stays consistent and a retry can replay the same migration.
 *  NOT safe to call concurrently on the same handle — two parallel runs read the same
 *  current version and the second would PK-conflict on _schema_version. */
export async function migrate(db: PluginDatabase, migrations: Migration[]): Promise<void> {
  db.exec(`CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const seen = new Set<number>();
  for (const m of sorted) {
    // Reject `version: 0` and negatives — `cur` starts at 0, so a version-0 migration
    // would be silently skipped on first run. Loud failure beats data-loss footgun.
    if (m.version < 1) {
      throw new Error(`Migration version must be >= 1, got ${m.version}`);
    }
    if (seen.has(m.version)) {
      throw new Error(`Duplicate migration version ${m.version}`);
    }
    seen.add(m.version);
  }

  const row = db.prepare('SELECT MAX(version) AS v FROM _schema_version').get() as { v: number | null };
  const cur = row.v ?? 0;

  for (const m of sorted) {
    if (m.version <= cur) continue;
    const tx = db.transaction(() => {
      db.exec(m.up);
      db.prepare('INSERT INTO _schema_version (version) VALUES (?)').run(m.version);
    });
    try {
      tx();
    } catch (err) {
      throw new Error(`Migration v${m.version} failed (rolled back): ${(err as Error).message}`);
    }
  }
}
