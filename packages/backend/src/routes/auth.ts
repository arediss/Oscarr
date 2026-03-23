import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getPlexUser, createPlexPin, checkPlexPin, checkPlexServerAccess } from '../services/plex.js';
import { getServiceConfig } from '../utils/services.js';
import { logEvent } from '../services/notifications.js';

const PLEX_CLIENT_ID = 'oscarr-client';

export async function authRoutes(app: FastifyInstance) {
  app.post('/plex/pin', async (_request, reply) => {
    const pin = await createPlexPin(PLEX_CLIENT_ID);
    const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pin.code}&context%5Bdevice%5D%5Bproduct%5D=Oscarr`;
    return reply.send({ pin, authUrl });
  });

  app.post('/plex/callback', async (request, reply) => {
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

    // Check Plex server access — read machineId from Service registry, fallback to AppSettings
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
          avatar: plexAccount.thumb,
          hasPlexServerAccess: user.role === 'admin' || hasServerAccess,
        },
      });
    }

    logEvent('info', 'Auth', `${user.plexUsername} s'est connecté`);

    const token = app.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '30d' }
    );

    reply
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
          plexUsername: user.plexUsername,
          avatar: user.avatar,
          role: user.role,
          hasPlexServerAccess: user.hasPlexServerAccess,
        },
        token,
      });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.user as { id: number };
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        plexUsername: true,
        avatar: true,
        role: true,
        hasPlexServerAccess: true,
        createdAt: true,
      },
    });
    if (!user) return reply.status(404).send({ error: 'Utilisateur introuvable' });

    return reply.send(user);
  });

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true });
  });
}
