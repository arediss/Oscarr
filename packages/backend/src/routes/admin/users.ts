import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { getAuthProvider } from '../../providers/index.js';
import { logEvent } from '../../utils/logEvent.js';
import { parseId } from '../../utils/params.js';

export async function usersRoutes(app: FastifyInstance) {
  // === USER MANAGEMENT ===

  // Import users from a provider (e.g. Plex shared users, Jellyfin users)
  app.post('/users/import/:provider', {
    schema: {
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', description: 'Provider ID (e.g. "plex")' },
        },
      },
    },
  }, async (request, reply) => {

    const { provider: providerId } = request.params as { provider: string };
    const authProvider = getAuthProvider(providerId);

    if (!authProvider?.importUsers) {
      return reply.status(400).send({ error: `Le provider "${providerId}" ne supporte pas l'import d'utilisateurs.` });
    }

    const adminUser = request.user as { id: number };
    try {
      const result = await authProvider.importUsers(adminUser.id);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NO_TOKEN') return reply.status(400).send({ error: `Aucun token ${providerId} trouv\u00e9. Configurez le service dans les param\u00e8tres.` });
      if (msg === 'NO_MACHINE_ID') return reply.status(400).send({ error: `Aucun serveur ${providerId} configur\u00e9.` });
      const safeProviderId = providerId.replace(/[\r\n\t]/g, '');
      console.error('Failed to import %s users:', safeProviderId, err);
      logEvent('error', 'User', `Import ${safeProviderId} \u00e9chou\u00e9 : ${String(err)}`);
      return reply.status(502).send({ error: `Impossible de r\u00e9cup\u00e9rer les utilisateurs ${providerId}` });
    }
  });

  // Link a provider to a user (admin only)
  app.post('/users/:id/link-provider', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'User ID' } },
      },
      body: {
        type: 'object',
        required: ['provider', 'pinId'],
        properties: {
          provider: { type: 'string', description: 'Provider ID (e.g. "plex")' },
          pinId: { type: 'number', description: 'OAuth PIN ID' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const { provider: providerId, pinId } = request.body as { provider: string; pinId: number };
    const authProvider = getAuthProvider(providerId);
    if (!authProvider?.linkAccount) {
      return reply.status(400).send({ error: `Le provider "${providerId}" ne supporte pas le linking.` });
    }

    try {
      const result = await authProvider.linkAccount(pinId, userId);
      return reply.send({ success: true, providerUsername: result.providerUsername });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'PIN_INVALID') return reply.status(400).send({ error: 'PIN non valid\u00e9. R\u00e9essayez.' });
      if (msg === 'PROVIDER_ALREADY_LINKED') return reply.status(409).send({ error: 'Ce compte est d\u00e9j\u00e0 li\u00e9 \u00e0 un autre utilisateur.' });
      throw err;
    }
  });

  app.get('/users', async (request, reply) => {

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        avatar: true,
        role: true,
        createdAt: true,
        providers: { select: { provider: true, providerUsername: true, providerEmail: true } },
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      ...u,
      providers: u.providers,
      requestCount: u._count.requests,
    }));
  });

  // Change user role
  app.put('/users/:id/role', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User ID' },
        },
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', description: 'Role name to assign' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'ID invalide' });

    const { role } = request.body as { role: string };

    // Validate role exists in DB
    const roleExists = await prisma.role.findUnique({ where: { name: role } });
    if (!roleExists) return reply.status(400).send({ error: 'R\u00f4le invalide' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, displayName: true, role: true },
    });

    logEvent('info', 'User', `R\u00f4le de ${user.displayName} chang\u00e9 en ${role}`);
    return user;
  });
}
