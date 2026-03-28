import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getPlexUser, createPlexPin, checkPlexPin, checkPlexServerAccess } from '../services/plex.js';
import { getServiceConfig } from '../utils/services.js';
import { logEvent } from '../services/notifications.js';
import { registerEmail, loginEmail } from '../auth/providers/email.js';
import type { AuthProviderConfig } from '../auth/types.js';

const PLEX_CLIENT_ID = 'oscarr-client';

const AUTH_PROVIDERS: AuthProviderConfig[] = [
  { id: 'email', label: 'Email', type: 'credentials' },
  { id: 'plex', label: 'Plex', type: 'oauth' },
];

function sendAuthResponse(app: FastifyInstance, reply: import('fastify').FastifyReply, user: { id: number; email: string; displayName: string | null; avatar: string | null; role: string; hasPlexServerAccess: boolean; authProvider: string }) {
  const token = app.jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    { expiresIn: '30d' }
  );

  return reply
    .setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    })
    .send({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        hasPlexServerAccess: user.hasPlexServerAccess,
        authProvider: user.authProvider,
      },
      token,
    });
}

export async function authRoutes(app: FastifyInstance) {
  // GET /providers — list available auth providers
  app.get('/providers', async () => {
    return AUTH_PROVIDERS;
  });

  // ─── Email/Password ────────────────────────────────────────────────

  app.post('/register', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['email', 'password', 'displayName'],
        properties: {
          email: { type: 'string', description: 'User email' },
          password: { type: 'string', description: 'Password (min 8 chars)' },
          displayName: { type: 'string', description: 'Display name' },
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
        return reply.status(403).send({ error: 'L\'inscription est désactivée.' });
      }
    }

    try {
      const result = await registerEmail(email, password, displayName);

      const user = await prisma.user.create({
        data: {
          email: result.email,
          authProvider: 'email',
          displayName: result.displayName,
          passwordHash: result.providerData.passwordHash as string,
          role: isFirstUser ? 'admin' : 'user',
          hasPlexServerAccess: isFirstUser,
        },
      });

      logEvent('info', 'Auth', `Nouveau compte email créé : ${result.displayName} (${isFirstUser ? 'admin' : 'user'})`);
      return sendAuthResponse(app, reply, user);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'EMAIL_EXISTS') return reply.status(409).send({ error: 'Cet email est déjà utilisé.' });
      if (msg === 'PASSWORD_TOO_SHORT') return reply.status(400).send({ error: 'Le mot de passe doit faire au moins 8 caractères.' });
      if (msg === 'DISPLAY_NAME_REQUIRED') return reply.status(400).send({ error: 'Le nom d\'affichage est requis.' });
      throw err;
    }
  });

  app.post('/login', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', description: 'User email' },
          password: { type: 'string', description: 'Password' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    try {
      await loginEmail(email, password);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'INVALID_CREDENTIALS') return reply.status(401).send({ error: 'Email ou mot de passe incorrect.' });
      if (msg === 'PLEX_ACCOUNT') return reply.status(400).send({ error: 'Ce compte utilise la connexion Plex.' });
      throw err;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return reply.status(401).send({ error: 'Email ou mot de passe incorrect.' });

    logEvent('info', 'Auth', `${user.displayName} s'est connecté (email)`);
    return sendAuthResponse(app, reply, user);
  });

  // ─── Plex OAuth ────────────────────────────────────────────────────

  app.post('/plex/pin', async (_request, reply) => {
    const pin = await createPlexPin(PLEX_CLIENT_ID);
    const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pin.code}&context%5Bdevice%5D%5Bproduct%5D=Oscarr`;
    return reply.send({ pin, authUrl });
  });

  app.post('/plex/callback', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['pinId'],
        properties: {
          pinId: { type: 'number' as const, description: 'Plex PIN ID returned by /plex/pin' },
        },
      },
    },
  }, async (request, reply) => {
    const { pinId } = request.body as { pinId: unknown };

    if (typeof pinId !== 'number' || !Number.isFinite(pinId) || pinId < 1) {
      return reply.status(400).send({ error: 'pinId invalide' });
    }

    const authToken = await checkPlexPin(pinId, PLEX_CLIENT_ID);
    if (!authToken) {
      logEvent('warn', 'Auth', `Échec de validation PIN (pinId: ${pinId})`);
      return reply.status(400).send({ error: 'PIN non validé. Réessayez.' });
    }

    const plexAccount = await getPlexUser(authToken);

    const plexConfig = await getServiceConfig('plex');
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const machineId = plexConfig?.machineId || settings?.plexMachineId || null;
    const hasServerAccess = await checkPlexServerAccess(authToken, machineId);

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { plexId: plexAccount.id },
          { email: plexAccount.email.toLowerCase() },
        ],
      },
    });

    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: plexAccount.email.toLowerCase(),
          authProvider: 'plex',
          displayName: plexAccount.username,
          plexId: plexAccount.id,
          plexToken: authToken,
          plexUsername: plexAccount.username,
          avatar: plexAccount.thumb,
          role: isFirstUser ? 'admin' : 'user',
          hasPlexServerAccess: isFirstUser || hasServerAccess,
        },
      });
      logEvent('info', 'Auth', `Nouveau compte créé : ${plexAccount.username} (${isFirstUser ? 'admin' : 'user'})`);
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          plexToken: authToken,
          plexId: plexAccount.id,
          plexUsername: plexAccount.username,
          displayName: user.displayName || plexAccount.username,
          avatar: plexAccount.thumb,
          hasPlexServerAccess: user.role === 'admin' || hasServerAccess,
        },
      });
    }

    logEvent('info', 'Auth', `${user.displayName} s'est connecté (plex)`);
    return sendAuthResponse(app, reply, user);
  });

  // ─── Common ────────────────────────────────────────────────────────

  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.user as { id: number };
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatar: true,
        role: true,
        hasPlexServerAccess: true,
        authProvider: true,
        createdAt: true,
      },
    });
    if (!user) return reply.status(404).send({ error: 'Utilisateur introuvable' });

    return reply.send(user);
  });

  app.post('/logout', { preHandler: [app.authenticate] }, async (_request, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true });
  });
}
