import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { getAuthProvider } from '../../providers/index.js';
import { logEvent } from '../../utils/logEvent.js';
import { parseId } from '../../utils/params.js';
import { invalidateUserStateCache } from '../../middleware/rbac.js';

export async function usersRoutes(app: FastifyInstance) {
  // === USER MANAGEMENT ===

  // Import users from a provider (e.g. Plex shared users, Jellyfin users). Optional body
  // `{ providerIds: string[] }` narrows the import to a cherry-picked subset — used by the
  // admin UI after a sync to import only the users the admin selected in the review modal.
  app.post('/users/import/:provider', {
    schema: {
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', description: 'Provider ID (e.g. "plex")' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          providerIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional whitelist of provider-side user ids to import',
          },
        },
      },
    },
  }, async (request, reply) => {

    const { provider: providerId } = request.params as { provider: string };
    const authProvider = getAuthProvider(providerId);

    if (!authProvider?.importUsers) {
      return reply.status(400).send({ error: `Provider "${providerId}" does not support user import.` });
    }

    const body = (request.body || {}) as { providerIds?: string[] };
    const filter = body.providerIds && body.providerIds.length > 0 ? { providerIds: body.providerIds } : undefined;

    const adminUser = request.user as { id: number };
    try {
      const result = await authProvider.importUsers(adminUser.id, filter);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NO_TOKEN') return reply.status(400).send({ error: `No ${providerId} token found. Configure the service in settings.` });
      if (msg === 'NO_MACHINE_ID') return reply.status(400).send({ error: `No ${providerId} server configured.` });
      const safeProviderId = providerId.replace(/[\r\n\t]/g, '');
      logEvent('error', 'User', `${safeProviderId} import failed: ${String(err)}`);
      return reply.status(502).send({ error: `Unable to retrieve ${providerId} users` });
    }
  });

  // Sync users with a provider — disables users no longer on the provider,
  // re-enables returning ones, and reports unmatched provider entries for
  // admin review.
  app.post('/users/sync/:provider', {
    schema: {
      params: {
        type: 'object',
        required: ['provider'],
        properties: { provider: { type: 'string', description: 'Provider ID (e.g. "plex")' } },
      },
    },
  }, async (request, reply) => {
    const { provider: providerId } = request.params as { provider: string };
    const authProvider = getAuthProvider(providerId);
    if (!authProvider?.syncUsers) {
      return reply.status(400).send({ error: `Provider "${providerId}" does not support user sync.` });
    }
    const adminUser = request.user as { id: number };
    try {
      return await authProvider.syncUsers(adminUser.id);
    } catch (err) {
      const msg = (err as Error).message;
      // Structured codes so the frontend can i18n + tailor the CTA ("go to Services to
      // configure machineId"). `detail` carries the human fallback for log tools.
      if (msg === 'NO_TOKEN') return reply.status(400).send({ error: 'NO_AUTH_TOKEN', detail: `No ${providerId} token — configure the service first.` });
      if (msg === 'NO_MACHINE_ID') return reply.status(400).send({ error: 'NO_AUTH_SERVER', detail: `No ${providerId} server configured.` });
      const safeProviderId = providerId.replace(/[\r\n\t]/g, '');
      logEvent('error', 'User', `${safeProviderId} sync failed: ${String(err)}`);
      return reply.status(502).send({ error: 'AUTH_SYNC_FAILED', detail: `Unable to sync ${providerId} users` });
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
        disabled: true,
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
    // Without invalidate, the 30s rbac cache kept the old role for up to 30s after a demote.
    invalidateUserStateCache(userId);

    logEvent('info', 'User', `${user.displayName} role changed to ${role}`);
    return user;
  });

  app.put('/users/:id/disabled', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'User ID' } },
      },
      body: {
        type: 'object',
        required: ['disabled'],
        properties: { disabled: { type: 'boolean' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = parseId(id);
    if (!userId) return reply.status(400).send({ error: 'Invalid ID' });

    const { disabled } = request.body as { disabled: boolean };

    if (request.user.id === userId && disabled) {
      return reply.status(400).send({ error: 'You cannot disable your own account' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { disabled },
      select: { id: true, displayName: true, email: true, disabled: true },
    });
    invalidateUserStateCache(userId);

    logEvent('info', 'User', `${user.displayName || user.email} ${disabled ? 'disabled' : 'enabled'}`);
    return user;
  });
}
