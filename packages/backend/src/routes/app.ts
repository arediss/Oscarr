import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { pluginEngine } from '../plugins/engine.js';

const APP_VERSION = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../package.json'), 'utf-8')
).version as string;

export async function appRoutes(app: FastifyInstance) {
  // Get app version + check for updates
  app.get('/version', { preHandler: [app.authenticate] }, async () => {
    const result: { current: string; latest?: string; updateAvailable?: boolean; releaseUrl?: string } = {
      current: APP_VERSION,
    };
    try {
      const { data } = await axios.get('https://api.github.com/repos/arediss/Oscarr/releases/latest', {
        headers: { Accept: 'application/vnd.github.v3+json' },
        timeout: 5000,
      });
      const latest = (data.tag_name as string).replace(/^v/, '');
      result.latest = latest;
      result.updateAvailable = latest !== APP_VERSION;
      result.releaseUrl = data.html_url;
    } catch {
      // GitHub unreachable or no releases yet
    }
    return result;
  });

  // Get incident banner (no auth — displayed before login)
  app.get('/banner', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    return { banner: settings?.incidentBanner || null };
  });

  // Quality options available for requests (only those with at least one mapping)
  app.get('/quality-options', { preHandler: [app.authenticate] }, async () => {
    return prisma.qualityOption.findMany({
      where: { mappings: { some: {} } },
      orderBy: { position: 'asc' },
    });
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
      ...pluginFeatures,
    };
  });
}
