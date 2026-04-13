import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { pluginEngine } from '../plugins/engine.js';
import { getArrClient } from '../providers/index.js';
import { getServiceConfig } from '../utils/services.js';
import { getHomepageLayout } from './admin/homepage.js';

const APP_VERSION = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../package.json'), 'utf-8')
).version as string;

export async function appRoutes(app: FastifyInstance) {
  // Get app version + check for updates
  app.get('/version', async () => {
    const result: { current: string; latest?: string; updateAvailable?: boolean; releaseUrl?: string } = {
      current: APP_VERSION,
    };
    try {
      const { data } = await axios.get('https://raw.githubusercontent.com/arediss/Oscarr/main/version.json', {
        timeout: 5000,
      });
      result.latest = data.latest;
      result.updateAvailable = data.latest !== APP_VERSION;
      result.releaseUrl = data.releaseUrl;
    } catch {
      // GitHub unreachable
    }
    return result;
  });

  // Get changelog from DB patchnotes
  app.get('/changelog', async (request) => {
    const lang = ((request.headers['accept-language'] || '').split(',')[0]?.split('-')[0] || 'en').toLowerCase();
    const patchnotes = await prisma.patchnote.findMany({ orderBy: { date: 'desc' }, take: 15 });
    return {
      current: APP_VERSION,
      releases: patchnotes.map(p => {
        const entries = JSON.parse(p.entries) as { type: string; titleEn: string; titleFr: string; descEn?: string; descFr?: string }[];
        return {
          version: p.version,
          type: p.type,
          title: lang === 'fr' ? p.titleFr : p.titleEn,
          date: p.date.toISOString(),
          entries: entries.map(e => ({
            type: e.type,
            title: lang === 'fr' ? e.titleFr : e.titleEn,
            description: lang === 'fr' ? (e.descFr || null) : (e.descEn || null),
          })),
        };
      }),
    };
  });

  // Get incident banner (no auth — displayed before login)
  app.get('/banner', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return { banner: settings?.incidentBanner || null };
  });

  // Quality options available for requests (only those with at least one mapping)
  app.get('/quality-options', async (request) => {
    const user = request.user as { id: number; role: string } | undefined;
    const options = await prisma.qualityOption.findMany({
      where: { mappings: { some: {} } },
      orderBy: { position: 'asc' },
    });
    if (!user || user.role === 'admin') return options;
    return options.filter(opt => {
      if (!opt.allowedRoles) return true;
      try {
        const roles = JSON.parse(opt.allowedRoles) as string[];
        return roles.length === 0 || roles.includes(user.role);
      } catch { return false; }
    });
  });

  // ─── Health check (authenticated via API key) ─────────────────────
  app.get('/health', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] as string)
      || (request.headers.authorization?.replace(/^Bearer\s+/i, ''));

    if (!apiKey) {
      return reply.status(401).send({ error: 'API key required (X-Api-Key header or Authorization: Bearer)' });
    }

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.apiKey) {
      return reply.status(403).send({ error: 'Invalid API key' });
    }
    const provided = Buffer.from(apiKey);
    const stored = Buffer.from(settings.apiKey);
    if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
      return reply.status(403).send({ error: 'Invalid API key' });
    }

    const uptime = process.uptime();
    const services: Record<string, { online: boolean; version?: string }> = {};

    // Check each configured arr service
    for (const type of ['radarr', 'sonarr']) {
      const config = await getServiceConfig(type);
      if (!config) continue;
      try {
        const client = await getArrClient(type);
        const status = await client.getSystemStatus();
        services[type] = { online: true, version: status.version };
      } catch {
        services[type] = { online: false };
      }
    }

    return {
      status: 'ok',
      version: APP_VERSION,
      uptime: Math.floor(uptime),
      database: 'ok',
      services,
    };
  });

  // Get feature flags (no auth — needed by Layout before auth check)
  app.get('/features', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const pluginFeatures = pluginEngine.getAllFeatureFlags();
    return {
      requestsEnabled: settings?.requestsEnabled ?? true,
      supportEnabled: settings?.supportEnabled ?? true,
      calendarEnabled: settings?.calendarEnabled ?? true,
      siteName: settings?.siteName ?? 'Oscarr',
      registrationEnabled: settings?.registrationEnabled ?? true,
      nsfwBlurEnabled: settings?.nsfwBlurEnabled ?? true,
      ...pluginFeatures,
    };
  });

  // Get homepage layout (public — needed before auth)
  app.get('/homepage-layout', async () => {
    return getHomepageLayout();
  });
}
