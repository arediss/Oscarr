import type { FastifyInstance } from 'fastify';
import { settingsRoutes } from './settings.js';
import { servicesRoutes } from './services.js';
import { folderRulesRoutes } from './folderRules.js';
import { usersRoutes } from './users.js';
import { logsRoutes } from './logs.js';
import { jobsRoutes } from './jobs.js';
import { syncRoutes } from './sync.js';
import { notificationsAdminRoutes } from './notifications.js';
import { qualityRoutes } from './quality.js';
import { dangerRoutes } from './danger.js';
import { rolesRoutes } from './roles.js';
import { keywordsRoutes } from './keywords.js';
import { blacklistRoutes } from './blacklist.js';
import { backupRoutes } from './backup.js';
import { homepageRoutes } from './homepage.js';
import { plexAdminRoutes } from './plex.js';
import { authProvidersRoutes } from './authProviders.js';

export async function adminRoutes(app: FastifyInstance) {
  await settingsRoutes(app);
  await servicesRoutes(app);
  await folderRulesRoutes(app);
  await usersRoutes(app);
  await logsRoutes(app);
  await jobsRoutes(app);
  await syncRoutes(app);
  await notificationsAdminRoutes(app);
  await qualityRoutes(app);
  await dangerRoutes(app);
  await rolesRoutes(app);
  await keywordsRoutes(app);
  await blacklistRoutes(app);
  await backupRoutes(app);
  await homepageRoutes(app);
  await plexAdminRoutes(app);
  await authProvidersRoutes(app);

  // Graceful restart — used by "Reload plugins" in admin UI
  app.post('/restart', async (_request, reply) => {
    reply.send({ ok: true, message: 'Server restarting...' });
    // Delay exit so the HTTP response is sent first
    setTimeout(() => process.exit(0), 500);
  });
}
