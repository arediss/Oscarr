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
      return reply.status(400).send({ error: `Provider "${providerId}" does not support user import.` });
    }

    const adminUser = request.user as { id: number };
    try {
      const result = await authProvider.importUsers(adminUser.id);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NO_TOKEN') return reply.status(400).send({ error: `No ${providerId} token found. Configure the service in settings.` });
      if (msg === 'NO_MACHINE_ID') return reply.status(400).send({ error: `No ${providerId} server configured.` });
      const safeProviderId = providerId.replace(/[\r\n\t]/g, '');
      console.error('Failed to import %s users:', safeProviderId, err);
      logEvent('error', 'User', `${safeProviderId} import failed: ${String(err)}`);
      return reply.status(502).send({ error: `Unable to retrieve ${providerId} users` });
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
        required: ['provider'],
        properties: {
          provider: { type: 'string', description: 'Provider ID (e.g. "plex", "jellyfin")' },
          pinId: { type: 'number', description: 'OAuth PIN ID' },
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {

    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'Invalid ID' });

    const { provider: providerId, pinId, username, password } = request.body as {
      provider: string; pinId?: number; username?: string; password?: string;
    };
    const authProvider = getAuthProvider(providerId);
    if (!authProvider) return reply.status(400).send({ error: `Unknown provider "${providerId}"` });

    try {
      let result: { providerUsername: string };
      if (username && password && authProvider.linkAccountByCredentials) {
        result = await authProvider.linkAccountByCredentials(username, password, userId);
      } else if (pinId && authProvider.linkAccount) {
        result = await authProvider.linkAccount(pinId, userId);
      } else {
        return reply.status(400).send({ error: `Provider "${providerId}" does not support this linking method` });
      }
      return reply.send({ success: true, providerUsername: result.providerUsername });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'PIN_INVALID') return reply.status(400).send({ error: 'PIN not validated. Try again.' });
      if (msg === 'PROVIDER_ALREADY_LINKED') return reply.status(409).send({ error: 'This account is already linked to another user.' });
      if (msg === 'NOT_CONFIGURED') return reply.status(503).send({ error: 'Server not configured' });
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) return reply.status(401).send({ error: 'Invalid username or password' });
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
    if (!userId) return reply.status(400).send({ error: 'Invalid ID' });

    const { role } = request.body as { role: string };

    // Validate role exists in DB
    const roleExists = await prisma.role.findUnique({ where: { name: role } });
    if (!roleExists) return reply.status(400).send({ error: 'Invalid role' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, displayName: true, role: true },
    });

    logEvent('info', 'User', `${user.displayName} role changed to ${role}`);
    return user;
  });
}
