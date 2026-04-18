import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';
import { registerEmail, loginEmail } from '../providers/email/index.js';
import { getAuthProviders, getAuthProvider, getAuthProviderConfigs } from '../providers/index.js';
import { getProviderConfig } from '../providers/authSettings.js';
import type { AuthHelpers } from '../providers/types.js';
import { getPermissionsForRole } from '../middleware/rbac.js';

function buildHelpers(app: FastifyInstance): AuthHelpers {
  return {
    async signAndSend(reply, userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { providers: true },
      });
      if (!user) return reply.status(500).send({ error: 'User not found after auth' });

      if (user.disabled) {
        const appSettings = await prisma.appSettings.findUnique({ where: { id: 1 } });
        const mode = appSettings?.disabledLoginMode ?? 'friendly';
        if (mode === 'friendly') {
          return reply.status(403).send({
            error: 'Your account has been disabled. Contact an administrator to restore access.',
            code: 'ACCOUNT_DISABLED',
          });
        }
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = app.jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        { expiresIn: '24h' }
      );

      return reply
        .setCookie('token', token, {
          path: '/',
          httpOnly: true,
          secure: process.env.COOKIE_SECURE === 'true'
            || (process.env.COOKIE_SECURE !== 'false' && reply.request.protocol === 'https'),
          sameSite: 'lax',
          maxAge: 24 * 60 * 60,
        })
        .send({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatar: user.avatar,
            role: user.role,
            providers: user.providers.map((p) => ({ provider: p.provider, username: p.providerUsername, email: p.providerEmail })),
          },
        });
    },

    async findOrCreateUser(opts) {
      const existingProvider = opts.providerId
        ? await prisma.userProvider.findUnique({
            where: { provider_providerId: { provider: opts.provider, providerId: opts.providerId } },
            include: { user: { include: { providers: true } } },
          })
        : null;

      let user = existingProvider?.user || await prisma.user.findUnique({
        where: { email: opts.email },
        include: { providers: true },
      });

      const userCount = await prisma.user.count();
      const isFirstUser = userCount === 0;

      if (!user) {
        // Per-provider signup gate. The admin can disable "allow account creation" so a user
        // authenticating via Plex/Jellyfin/Emby/Discord can't create an Oscarr account out of
        // thin air — they must already exist (either matched by email auto-link, or created
        // manually by an admin). Bootstrapping is always allowed (first user becomes admin).
        const providerCfg = await getProviderConfig(opts.provider);
        if (providerCfg.allowSignup === false && !isFirstUser) {
          throw new Error('SIGNUP_NOT_ALLOWED');
        }
        user = await prisma.user.create({
          data: {
            email: opts.email,
            displayName: opts.displayName,
            avatar: opts.avatar,
            role: isFirstUser ? 'admin' : 'user',
            providers: {
              create: {
                provider: opts.provider,
                providerId: opts.providerId,
                providerToken: opts.providerToken,
                providerUsername: opts.providerUsername,
                providerEmail: opts.providerEmail,
              },
            },
          },
          include: { providers: true },
        });
        return { ...user, isNew: true };
      }

      await prisma.userProvider.upsert({
        where: { userId_provider: { userId: user.id, provider: opts.provider } },
        update: {
          providerId: opts.providerId,
          providerToken: opts.providerToken,
          providerUsername: opts.providerUsername,
          providerEmail: opts.providerEmail,
        },
        create: {
          userId: user.id,
          provider: opts.provider,
          providerId: opts.providerId,
          providerToken: opts.providerToken,
          providerUsername: opts.providerUsername,
          providerEmail: opts.providerEmail,
        },
      });

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          displayName: user.displayName || opts.displayName,
          avatar: opts.avatar || user.avatar,
        },
        include: { providers: true },
      });

      return { ...user, isNew: false };
    },
  };
}

export async function authRoutes(app: FastifyInstance) {
  const helpers = buildHelpers(app);

  // GET /providers — list available auth providers for the login page
  app.get('/providers', async () => getAuthProviderConfigs());

  // ─── Email/Password (built-in) ────────────────────────────────────

  app.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object' as const,
        required: ['email', 'password', 'displayName'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
          displayName: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, displayName } = request.body as { email: string; password: string; displayName: string };

    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    if (!isFirstUser) {
      const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
      if (!(settings?.registrationEnabled ?? true)) {
        return reply.status(403).send({ error: 'Registration is disabled.' });
      }
    }

    try {
      const result = await registerEmail(email, password, displayName);
      const user = await prisma.user.create({
        data: {
          email: result.email,
          displayName: result.displayName,
          passwordHash: result.providerData.passwordHash as string,
          role: isFirstUser ? 'admin' : 'user',
          providers: { create: { provider: 'email', providerId: result.email } },
        },
      });

      logEvent('info', 'Auth', `New email account created: ${result.displayName} (${isFirstUser ? 'admin' : 'user'})`);
      return helpers.signAndSend(reply, user.id);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'EMAIL_EXISTS') return reply.status(409).send({ error: 'This email is already in use.' });
      if (msg === 'PASSWORD_TOO_SHORT') return reply.status(400).send({ error: 'Password must be at least 8 characters.' });
      if (msg === 'DISPLAY_NAME_REQUIRED') return reply.status(400).send({ error: 'Display name is required.' });
      throw err;
    }
  });

  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object' as const,
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    try {
      await loginEmail(email, password);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'INVALID_CREDENTIALS') return reply.status(401).send({ error: 'INVALID_CREDENTIALS' });
      if (msg === 'EXTERNAL_ACCOUNT') return reply.status(400).send({ error: 'EXTERNAL_ACCOUNT' });
      throw err;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return reply.status(401).send({ error: 'Invalid email or password.' });

    logEvent('info', 'Auth', `${user.displayName} logged in (email)`);
    return helpers.signAndSend(reply, user.id);
  });

  // ─── Register all OAuth providers from registry ───────────────────

  for (const provider of getAuthProviders()) {
    await provider.registerRoutes(app, helpers);
  }

  // ─── Link provider to current account ─────────────────────────────

  app.post('/link-provider', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['provider'],
        properties: {
          provider: { type: 'string' },
          pinId: { type: 'number' },
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },

  }, async (request, reply) => {
    const currentUser = request.user as { id: number };
    const { provider: providerId, pinId, username, password } = request.body as {
      provider: string; pinId?: number; username?: string; password?: string;
    };

    const provider = getAuthProvider(providerId);
    if (!provider) return reply.status(400).send({ error: `Unknown provider "${providerId}"` });

    try {
      let result: { providerUsername: string };
      if (username && password && provider.linkAccountByCredentials) {
        result = await provider.linkAccountByCredentials(username, password, currentUser.id);
      } else if (pinId && provider.linkAccount) {
        result = await provider.linkAccount(pinId, currentUser.id);
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

  // ─── Common ────────────────────────────────────────────────────────

  app.get('/me', async (request, reply) => {
    const { id } = request.user as { id: number };
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, displayName: true, avatar: true, role: true, createdAt: true,
        providers: { select: { provider: true, providerUsername: true, providerEmail: true } },
      },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });
    const permissions = getPermissionsForRole(user.role);
    return reply.send({ ...user, permissions });
  });

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true });
  });
}
