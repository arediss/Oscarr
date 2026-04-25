import type { FastifyInstance } from 'fastify';
import { join, extname, resolve, sep, relative } from 'path';
import { existsSync, createReadStream } from 'fs';
import { rm } from 'fs/promises';
import { pluginEngine } from './engine.js';
import { getPluginsDir } from './loader.js';
import { installPluginFromUrl } from './installer.js';
import { prisma } from '../utils/prisma.js';
import { scrubSecrets } from '../utils/logScrubber.js';

// ── Registry cache (module scope) ───────────────────────────────────
const REGISTRY_URL = 'https://raw.githubusercontent.com/arediss/Oscarr-Plugin-Registry/main/plugins.json';
const REGISTRY_TTL = 30 * 60 * 1000; // 30 minutes
let registryCache: { data: unknown; timestamp: number } | null = null;

// ── Update check cache ──────────────────────────────────────────────
const UPDATE_TTL = 60 * 60 * 1000; // 1h — keeps us well under GitHub's 60 req/h unauthenticated limit
let updateCache: { data: Record<string, UpdateInfo>; timestamp: number } | null = null;
// Shared in-flight promise while a check is running. Without this, two admins (or a tab reopen
// + a background refresh) can both pass the cache-miss guard and each fire N releases API calls,
// eating the 60 req/h unauthenticated limit in one user action.
let inflightUpdateCheck: Promise<Record<string, UpdateInfo>> | null = null;

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
  if (inflightUpdateCheck) return inflightUpdateCheck;

  inflightUpdateCheck = runUpdateCheck(now).finally(() => {
    inflightUpdateCheck = null;
  });
  return inflightUpdateCheck;
}

async function runUpdateCheck(now: number): Promise<Record<string, UpdateInfo>> {
  // Load registry (re-use the registry cache, don't hit GitHub twice). Don't cache the final
  // result if the registry itself failed to load — avoids hiding updates for 1h over a transient blip.
  let registry: { plugins?: Array<{ repository?: string }> } = {};
  let registryOk = false;
  try {
    const res = await fetch(REGISTRY_URL);
    if (res.ok) {
      registry = await res.json() as typeof registry;
      registryOk = true;
    }
  } catch { /* ignore — no registry = no update checks */ }

  const reposByPluginId = new Map<string, string>();
  for (const entry of registry.plugins ?? []) {
    if (!entry.repository) continue;
    const id = entry.repository.split('/').pop()?.toLowerCase().replace(/^oscarr-plugin-/, '') ?? '';
    if (id) reposByPluginId.set(id, entry.repository);
  }

  const installed = pluginEngine.getPluginList();
  const result: Record<string, UpdateInfo> = {};
  const persistOps: Promise<unknown>[] = [];
  const checkedAt = new Date();

  for (const p of installed) {
    const repo = reposByPluginId.get(p.id);
    if (!repo) {
      result[p.id] = { installed: p.version, latest: null, available: false };
      continue;
    }
    try {
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
      const ghToken = process.env.GITHUB_TOKEN;
      if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
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
      // Persist so the badge survives a restart (the admin doesn't have to wait for
      // the next TTL miss to see "update available" again).
      persistOps.push(
        prisma.pluginState.update({
          where: { pluginId: p.id },
          data: { latestVersion: latest, lastUpdateCheck: checkedAt },
        }).catch(() => {})
      );
    } catch {
      result[p.id] = { installed: p.version, latest: null, available: false, repository: repo };
    }
  }

  await Promise.all(persistOps);
  if (registryOk) updateCache = { data: result, timestamp: now };
  return result;
}

// Allowed file extensions for plugin frontend serving
const ALLOWED_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.json', '.map', '.svg']);

export async function pluginRoutes(app: FastifyInstance) {

  // ── Resolved plugins directory ──────────────────────────────────
  // Surfaces the absolute path the engine actually reads from — respects OSCARR_PLUGINS_DIR
  // and falls back to <project-root>/plugins otherwise. UI uses this to show the correct
  // hint instead of hardcoding `packages/plugins/` (wrong on Docker + self-hosted layouts).
  app.get('/dir', async () => {
    return { dir: getPluginsDir() };
  });

  // ── List installed plugins ──────────────────────────────────────
  // Joins the engine's in-memory plugin list with PluginState so the caller gets
  // `latestVersion` / `lastUpdateCheck` / `updateAvailable` out of the box —
  // avoids the frontend re-implementing a semver comparison against the registry.
  app.get('/', async () => {
    const list = pluginEngine.getPluginList();
    if (list.length === 0) return list;
    const states = await prisma.pluginState.findMany({
      where: { pluginId: { in: list.map((p) => p.id) } },
      select: { pluginId: true, latestVersion: true, lastUpdateCheck: true },
    });
    const byId = new Map(states.map((s) => [s.pluginId, s]));
    return list.map((p) => {
      const s = byId.get(p.id);
      return {
        ...p,
        latestVersion: s?.latestVersion ?? null,
        lastUpdateCheck: s?.lastUpdateCheck?.toISOString() ?? null,
        updateAvailable: !!s?.latestVersion && s.latestVersion !== p.version,
      };
    });
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
      bodyLimit: 8 * 1024,
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
        // Freshly installed plugins default to disabled — admin reviews capabilities + toggles on.
        const loaded = await pluginEngine.loadSingle(installed.dir, { defaultEnabled: false });
        // Register the plugin's job defs so manual triggers + cron ticks pick them up without
        // a server restart. No-op when the plugin defines no jobs.
        const jobDefs = loaded.manifest.hooks?.jobs ?? [];
        if (jobDefs.length > 0) {
          const { registerPluginJobs } = await import('../services/scheduler.js');
          await registerPluginJobs(jobDefs);
        }
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
        request.log.error({ err, url: scrubSecrets(url) }, '[plugins] Install failed');
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
  // Drops the plugin's router entry in the dispatcher map, pauses jobs, removes the dir —
  // no restart needed. The module itself stays in Node's ESM loader cache until process exit,
  // but the routes, ctx, and capability surface are all gone.
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
  app.get('/registry', async (request, reply) => {
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
          request.log.warn({ repository: entry.repository }, '[Registry] Skipping invalid repository');
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
            // Permission surface the plugin will request — surfaced pre-install so the admin can
            // review what they're about to grant before Oscarr downloads any code.
            services: Array.isArray(manifest.services) ? manifest.services : undefined,
            capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : undefined,
            capabilityReasons: (manifest.capabilityReasons && typeof manifest.capabilityReasons === 'object')
              ? manifest.capabilityReasons
              : undefined,
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
