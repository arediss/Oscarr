import type { FastifyInstance } from 'fastify';
import { join, extname, resolve, sep } from 'path';
import { existsSync, createReadStream } from 'fs';
import { pluginEngine } from './engine.js';

export async function pluginRoutes(app: FastifyInstance) {
  // List all plugins (admin only)
  app.get('/', async () => {
    return pluginEngine.getPluginList();
  });

  // Toggle plugin enable/disable (admin only)
  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle',
    {

      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Plugin identifier' },
          },
        },
        body: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean', description: 'Whether the plugin should be enabled' },
          },
        },
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

  // Get plugin settings schema + values (admin only)
  app.get<{ Params: { id: string } }>(
    '/:id/settings',
    {

      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Plugin identifier' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await pluginEngine.getSettings(request.params.id);
      } catch (err) {
        return reply.status(404).send({ error: String(err) });
      }
    }
  );

  // Update plugin settings (admin only)
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/:id/settings',
    {

      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Plugin identifier' },
          },
        },
        body: {
          type: 'object',
          description: 'Plugin-specific settings (schema varies by plugin)',
          additionalProperties: true,
        },
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

  // Get UI contributions for a hook point (authenticated)
  app.get<{ Params: { hookPoint: string } }>(
    '/ui/:hookPoint',
    {

      schema: {
        params: {
          type: 'object',
          required: ['hookPoint'],
          properties: {
            hookPoint: { type: 'string', description: 'UI hook point identifier' },
          },
        },
      },
    },
    async (request) => {
      return pluginEngine.getUIContributions(request.params.hookPoint);
    }
  );

  // Serve plugin frontend files as ESM modules
  app.get('/:id/frontend/*', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const filePath = (request.params as Record<string, string>)['*'];
    const plugin = pluginEngine.getPlugin(id);
    if (!plugin || !plugin.enabled || plugin.error) {
      return reply.status(404).send({ error: 'Plugin not found' });
    }

    // Security: sanitize path
    const safePath = (filePath || '').replace(/^\//, '');
    if (!safePath) return reply.status(400).send({ error: 'File path required' });

    const fullPath = resolve(join(plugin.dir, 'dist', 'frontend', safePath));
    const pluginBoundary = resolve(plugin.dir) + sep;

    // Verify the resolved path stays inside the plugin directory
    if (!fullPath.startsWith(pluginBoundary)) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    if (!existsSync(fullPath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const ext = extname(fullPath);
    const contentTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    };
    reply.header('content-type', contentTypes[ext] || 'text/plain');
    reply.header('cache-control', process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-cache');
    return reply.send(createReadStream(fullPath));
  });

  // Get plugin feature flags (no auth - needed before login)
  app.get('/features', async () => {
    return pluginEngine.getAllFeatureFlags();
  });

  // ── Plugin Registry (Discover) ───────────────────────────────────

  const REGISTRY_URL = 'https://raw.githubusercontent.com/arediss/Oscarr-Plugin-Registry/main/plugins.json';
  let registryCache: { data: unknown; timestamp: number } | null = null;
  const REGISTRY_TTL = 5 * 60 * 1000; // 5 minutes

  app.get('/registry', async (_request, reply) => {
    try {
      const now = Date.now();
      if (registryCache && now - registryCache.timestamp < REGISTRY_TTL) {
        return registryCache.data;
      }

      // Fetch the plugin directory
      const res = await fetch(REGISTRY_URL);
      if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
      const registry = await res.json() as { plugins: { repository: string; category?: string }[] };

      // Fetch manifest.json from each plugin repo in parallel
      const plugins = await Promise.allSettled(
        registry.plugins.map(async (entry) => {
          const manifestUrl = `https://raw.githubusercontent.com/${entry.repository}/main/manifest.json`;
          const mRes = await fetch(manifestUrl);
          if (!mRes.ok) return null;
          const manifest = await mRes.json() as Record<string, unknown>;

          // Fetch repo metadata (description, stars, etc.)
          let repoMeta: Record<string, unknown> = {};
          try {
            const repoRes = await fetch(`https://api.github.com/repos/${entry.repository}`, {
              headers: { 'Accept': 'application/vnd.github.v3+json' },
            });
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
