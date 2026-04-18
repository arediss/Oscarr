import type { FastifyInstance } from 'fastify';
import { join, extname, resolve, sep, relative } from 'path';
import { existsSync, createReadStream } from 'fs';
import { rm } from 'fs/promises';
import { pluginEngine } from './engine.js';
import { installPluginFromUrl } from './installer.js';
import { prisma } from '../utils/prisma.js';

// ── Registry cache (module scope) ───────────────────────────────────
const REGISTRY_URL = 'https://raw.githubusercontent.com/arediss/Oscarr-Plugin-Registry/main/plugins.json';
const REGISTRY_TTL = 30 * 60 * 1000; // 30 minutes
let registryCache: { data: unknown; timestamp: number } | null = null;

// ── Update check cache ──────────────────────────────────────────────
const UPDATE_TTL = 60 * 60 * 1000; // 1h — keeps us well under GitHub's 60 req/h unauthenticated limit
let updateCache: { data: Record<string, UpdateInfo>; timestamp: number } | null = null;

interface UpdateInfo {
  installed: string;
  latest: string | null;
  available: boolean;
  repository?: string;
  /** Populated when the registry has a matching entry; otherwise the plugin can't be auto-updated. */
  sourceUrl?: string;
}

async function checkUpdatesForInstalledPlugins(): Promise<Record<string, UpdateInfo>> {
  const now = Date.now();
  if (updateCache && now - updateCache.timestamp < UPDATE_TTL) return updateCache.data;

  // Load registry (re-use the registry cache, don't hit GitHub twice)
  let registry: { plugins?: Array<{ repository?: string }> } = {};
  try {
    const res = await fetch(REGISTRY_URL);
    if (res.ok) registry = await res.json() as typeof registry;
  } catch { /* ignore — no registry = no update checks */ }

  const reposByPluginId = new Map<string, string>();
  for (const entry of registry.plugins ?? []) {
    if (!entry.repository) continue;
    const id = entry.repository.split('/').pop()?.toLowerCase().replace(/^oscarr-plugin-/, '') ?? '';
    if (id) reposByPluginId.set(id, entry.repository);
  }

  const installed = pluginEngine.getPluginList();
  const result: Record<string, UpdateInfo> = {};
  for (const p of installed) {
    const repo = reposByPluginId.get(p.id);
    if (!repo) {
      result[p.id] = { installed: p.version, latest: null, available: false };
      continue;
    }
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) {
        result[p.id] = { installed: p.version, latest: null, available: false, repository: repo };
        continue;
      }
      const rel = await r.json() as { tag_name?: string; tarball_url?: string };
      const latest = rel.tag_name?.replace(/^v/, '') ?? null;
      result[p.id] = {
        installed: p.version,
        latest,
        available: !!latest && latest !== p.version,
        repository: repo,
        sourceUrl: rel.tarball_url,
      };
    } catch {
      result[p.id] = { installed: p.version, latest: null, available: false, repository: repo };
    }
  }

  updateCache = { data: result, timestamp: now };
  return result;
}

// Allowed file extensions for plugin frontend serving
const ALLOWED_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.json', '.map', '.svg']);

export async function pluginRoutes(app: FastifyInstance) {

  // ── List installed plugins ──────────────────────────────────────
  app.get('/', async () => {
    return pluginEngine.getPluginList();
  });

  // ── Check for updates ────────────────────────────────────────────
  // Looks up each installed plugin in the registry, fetches the latest
  // GitHub release tag via the GitHub API, and compares with the installed
  // version. Cached 1h in-memory to avoid hitting GitHub rate-limits.
  app.get('/updates', async () => {
    return checkUpdatesForInstalledPlugins();
  });

  // ── Install plugin from URL ─────────────────────────────────────
  // Download a tar.gz, validate its manifest, drop it into the plugins dir,
  // and hot-load it via engine.loadSingle() — no container restart needed.
  app.post<{ Body: { url: string } }>(
    '/install',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          properties: { url: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { url } = request.body;
      let installedDir: string | null = null;
      try {
        const installed = await installPluginFromUrl(url);
        installedDir = installed.dir;
        const loaded = await pluginEngine.loadSingle(installed.dir);
        return {
          ok: true,
          plugin: {
            id: loaded.manifest.id,
            name: loaded.manifest.name,
            version: loaded.manifest.version,
            enabled: loaded.enabled,
            error: loaded.error,
          },
        };
      } catch (err) {
        request.log.error({ err, url }, '[plugins] Install failed');
        // Rollback: if the tarball landed on disk but loadSingle threw (bad manifest,
        // incompatible version, bad entry…), the dir would otherwise be picked up
        // at the next boot. Remove it now so a failed install leaves no trace.
        if (installedDir) {
          await rm(installedDir, { recursive: true, force: true }).catch((rmErr) => {
            request.log.error({ err: rmErr, dir: installedDir }, '[plugins] Rollback failed to remove install dir');
          });
        }
        return reply.status(400).send({ error: String((err as Error).message ?? err) });
      }
    }
  );

  // ── Uninstall plugin ────────────────────────────────────────────
  // Fastify can't dynamically unregister routes — the best we can do without a restart
  // is mark the plugin uninstalled so its routes start returning 404, then remove the
  // dir so the next boot doesn't re-discover it. Admin can restart at their convenience
  // to free the in-memory route handlers.
  app.post<{ Params: { id: string } }>(
    '/:id/uninstall',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const removed = await pluginEngine.uninstall(id);
        if (!removed) return reply.status(404).send({ error: `Plugin "${id}" not found` });
        return { ok: true };
      } catch (err) {
        request.log.error({ err, id }, '[plugins] Uninstall failed');
        return reply.status(500).send({ error: String((err as Error).message ?? err) });
      }
    }
  );

  // ── Toggle plugin ───────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { enabled } = request.body;
      try {
        await pluginEngine.togglePlugin(id, enabled);
        return { success: true };
      } catch (err) {
        return reply.status(404).send({ error: String(err) });
      }
    }
  );

  // ── Get settings ────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id/settings',
    {
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
    },
    async (request, reply) => {
      try {
        return await pluginEngine.getSettings(request.params.id);
      } catch (err) {
        return reply.status(404).send({ error: String(err) });
      }
    }
  );

  // ── Update settings ─────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/:id/settings',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: { type: 'object', additionalProperties: true },
      },
    },
    async (request, reply) => {
      try {
        await pluginEngine.updateSettings(request.params.id, request.body);
        return { success: true };
      } catch (err) {
        return reply.status(404).send({ error: String(err) });
      }
    }
  );

  // ── UI contributions ────────────────────────────────────────────
  app.get<{ Params: { hookPoint: string } }>(
    '/ui/:hookPoint',
    {
      schema: { params: { type: 'object', required: ['hookPoint'], properties: { hookPoint: { type: 'string' } } } },
    },
    async (request) => {
      return pluginEngine.getUIContributions(request.params.hookPoint);
    }
  );

  // ── Feature flags ───────────────────────────────────────────────
  app.get('/features', async () => {
    return pluginEngine.getAllFeatureFlags();
  });

  // ── Plugin frontend files ───────────────────────────────────────
  app.get('/:id/frontend/*', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const filePath = (request.params as Record<string, string>)['*'];
    const plugin = pluginEngine.getPlugin(id);
    if (!plugin || !plugin.enabled || plugin.error) {
      return reply.status(404).send({ error: 'Plugin not found' });
    }

    const safePath = (filePath || '').replace(/^\//, '');
    if (!safePath) return reply.status(400).send({ error: 'File path required' });

    // Extension whitelist
    const ext = extname(safePath);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.status(403).send({ error: 'File type not allowed' });
    }

    const fullPath = resolve(join(plugin.dir, 'dist', 'frontend', safePath));

    // Path traversal check using relative path
    const frontendRoot = resolve(plugin.dir, 'dist', 'frontend');
    const rel = relative(frontendRoot, fullPath);
    if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    if (!existsSync(fullPath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const contentTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.map': 'application/json',
    };
    reply.header('content-type', contentTypes[ext] || 'text/plain');
    reply.header('cache-control', process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-cache');
    return reply.send(createReadStream(fullPath));
  });

  // ── Plugin logs ─────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id/logs',
    {
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { limit = '100' } = request.query as Record<string, string>;
      const plugin = pluginEngine.getPlugin(id);
      if (!plugin) return reply.status(404).send({ error: 'Plugin not found' });

      const logs = await prisma.pluginLog.findMany({
        where: { pluginId: id },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 100, 500),
      });
      return logs;
    }
  );

  // ── Plugin registry (Discover) ──────────────────────────────────
  app.get('/registry', async (_request, reply) => {
    try {
      const now = Date.now();
      if (registryCache && now - registryCache.timestamp < REGISTRY_TTL) {
        return registryCache.data;
      }

      const headers: Record<string, string> = { 'Accept': 'application/json' };
      const ghToken = process.env.GITHUB_TOKEN;
      if (ghToken) headers['Authorization'] = `Bearer ${ghToken}`;

      const fetchWithTimeout = (url: string, opts: RequestInit = {}, timeoutMs = 5000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
      };

      const res = await fetchWithTimeout(REGISTRY_URL, { headers });
      if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
      const registry = await res.json() as { plugins: { repository: string; category?: string; tags?: string[] }[] };

      // Validate repository format before fetching
      const validRepo = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
      const validEntries = registry.plugins.filter(entry => {
        if (!validRepo.test(entry.repository)) {
          console.warn(`[Registry] Skipping invalid repository: ${entry.repository}`);
          return false;
        }
        return true;
      });

      const plugins = await Promise.allSettled(
        validEntries.map(async (entry) => {
          const manifestUrl = `https://raw.githubusercontent.com/${entry.repository}/main/manifest.json`;
          const mRes = await fetchWithTimeout(manifestUrl, { headers });
          if (!mRes.ok) return null;
          const manifest = await mRes.json() as Record<string, unknown>;

          let repoMeta: Record<string, unknown> = {};
          try {
            const repoRes = await fetchWithTimeout(`https://api.github.com/repos/${entry.repository}`, { headers });
            if (repoRes.ok) repoMeta = await repoRes.json() as Record<string, unknown>;
          } catch { /* ignore */ }

          return {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            apiVersion: manifest.apiVersion,
            description: manifest.description || repoMeta.description || '',
            author: manifest.author || '',
            repository: entry.repository,
            category: entry.category || 'utilities',
            tags: Array.isArray(entry.tags) ? entry.tags.filter((t): t is string => typeof t === 'string') : [],
            url: `https://github.com/${entry.repository}`,
            stars: repoMeta.stargazers_count ?? 0,
            updatedAt: repoMeta.pushed_at || null,
          };
        })
      );

      const result = plugins
        .filter(p => p.status === 'fulfilled' && p.value !== null)
        .map(p => (p as PromiseFulfilledResult<any>).value);

      registryCache = { data: result, timestamp: now };
      return result;
    } catch (err) {
      return reply.status(502).send({ error: 'Failed to fetch plugin registry' });
    }
  });
}
