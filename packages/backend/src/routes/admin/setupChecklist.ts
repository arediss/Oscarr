import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';

interface ChecklistItem {
  id: string;
  required: boolean;
  done: boolean;
  href: string;
}

async function computeItems(): Promise<ChecklistItem[]> {
  const [mediaServer, radarr, sonarr, quality, settings, rules, notifProviders] = await Promise.all([
    prisma.service.count({ where: { type: { in: ['plex', 'jellyfin', 'emby'] }, enabled: true } }),
    prisma.service.count({ where: { type: 'radarr', enabled: true } }),
    prisma.service.count({ where: { type: 'sonarr', enabled: true } }),
    prisma.qualityOption.count(),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.folderRule.count(),
    prisma.notificationProviderConfig.count({ where: { enabled: true } }),
  ]);
  const hasDefaultFolder = !!(settings?.defaultMovieFolder || settings?.defaultTvFolder || settings?.defaultAnimeFolder);

  return [
    { id: 'media-server', required: true, done: mediaServer > 0, href: '/admin?tab=services' },
    { id: 'radarr', required: true, done: radarr > 0, href: '/admin?tab=services' },
    { id: 'sonarr', required: true, done: sonarr > 0, href: '/admin?tab=services' },
    { id: 'quality-options', required: true, done: quality > 0, href: '/admin?tab=quality' },
    { id: 'default-folders', required: true, done: hasDefaultFolder, href: '/admin?tab=rules' },
    { id: 'routing-rule', required: false, done: rules > 0, href: '/admin?tab=rules' },
    { id: 'notification-provider', required: false, done: notifProviders > 0, href: '/admin?tab=notifications' },
  ];
}

export async function setupChecklistRoutes(app: FastifyInstance) {
  app.get('/setup-checklist', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { setupChecklistDismissed: true } });
    const items = await computeItems();
    return { items, dismissed: settings?.setupChecklistDismissed ?? false };
  });

  app.post('/setup-checklist/dismiss', async () => {
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { setupChecklistDismissed: true },
      create: { id: 1, setupChecklistDismissed: true, updatedAt: new Date() },
    });
    return { ok: true };
  });

  app.post('/setup-checklist/reset', async () => {
    await prisma.appSettings.update({
      where: { id: 1 },
      data: { setupChecklistDismissed: false },
    });
    return { ok: true };
  });
}
