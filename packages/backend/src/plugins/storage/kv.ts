import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

type KVMap = Record<string, unknown>;

/** JSON-file key/value store scoped to one plugin. Lazy-loads the file on first read,
 *  serializes writes through a per-instance promise chain, and renames atomically so a
 *  crash mid-write can never leave the file truncated. */
export class PluginKV {
  private cache: KVMap | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async get<T>(key: string): Promise<T | null> {
    const m = await this.load();
    return (m[key] as T) ?? null;
  }

  async keys(): Promise<string[]> {
    const m = await this.load();
    return Object.keys(m);
  }

  set<T>(key: string, value: T): Promise<void> {
    return this.mutate((m) => { m[key] = value; });
  }

  delete(key: string): Promise<void> {
    return this.mutate((m) => { delete m[key]; });
  }

  private async load(): Promise<KVMap> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.file, 'utf-8');
      this.cache = JSON.parse(raw) as KVMap;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.cache = {};
      } else {
        throw new Error(`KV file corrupted (${this.file}): ${(err as Error).message}`);
      }
    }
    return this.cache!;
  }

  private mutate(fn: (m: KVMap) => void): Promise<void> {
    // Chain writes so concurrent set/delete calls land in order. POSIX rename is atomic
    // so a crash mid-write leaves either the previous file intact or the new one, never
    // a half-written JSON. Apply `fn` to a clone so the in-memory cache only commits
    // AFTER the disk write succeeds — a thrown writeFile/rename mustn't leave RAM and
    // disk out of sync.
    const step = this.writeChain.then(async () => {
      const m = await this.load();
      const next = { ...m };
      fn(next);
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8');
      await rename(tmp, this.file);
      this.cache = next;
    });
    // Keep the chain alive even when this step rejects — otherwise one bad write would
    // permanently dead-letter every subsequent set/delete on the same instance.
    this.writeChain = step.catch(() => undefined);
    return step;
  }
}
