import axios from 'axios';
import { prisma } from '../../utils/prisma.js';
import { getPlexUser, createPlexPin, checkPlexPin, getSharedServerUsers } from '../../services/plex.js';
import { logEvent } from '../../services/notifications.js';
import type { Provider, AuthProvider, AuthHelpers } from '../types.js';

const PLEX_CLIENT_ID = 'oscarr-client';

// ─── Exported utilities for setup routes ────────────────────────────

export async function plexCreatePin() {
  const pin = await createPlexPin(PLEX_CLIENT_ID);
  const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pin.code}&context%5Bdevice%5D%5Bproduct%5D=Oscarr`;
  return { pin, authUrl };
}

export async function plexCheckPin(pinId: number): Promise<string | null> {
  return checkPlexPin(pinId, PLEX_CLIENT_ID);
}

async function getPlexToken(adminUserId?: number): Promise<string | null> {
  const plexService = await prisma.service.findFirst({
    where: { type: 'plex', enabled: true },
  });
  const config = plexService ? JSON.parse(plexService.config) : null;
  if (config?.token) return config.token;

  if (adminUserId) {
    const provider = await prisma.userProvider.findUnique({
      where: { userId_provider: { userId: adminUserId, provider: 'plex' } },
    });
    if (provider?.providerToken) return provider.providerToken;
  }
  return null;
}

async function importPlexUsers(plexToken: string, machineId: string) {
  const sharedUsers = await getSharedServerUsers(plexToken, machineId);
  let imported = 0;
  let skipped = 0;

  for (const user of sharedUsers) {
    const existingProvider = user.id ? await prisma.userProvider.findUnique({
      where: { provider_providerId: { provider: 'plex', providerId: String(user.id) } },
    }) : null;
    const existingUser = existingProvider || (user.email ? await prisma.user.findUnique({
      where: { email: user.email.toLowerCase() },
    }) : null);

    if (existingUser) { skipped++; continue; }

    await prisma.user.create({
      data: {
        email: (user.email || `${user.username}@plex.local`).toLowerCase(),
        displayName: user.username || user.title,
        avatar: user.thumb,
        role: 'user',
        providers: {
          create: {
            provider: 'plex',
            providerId: String(user.id),
            providerUsername: user.username || user.title,
          },
        },
      },
    });
    imported++;
  }

  logEvent('info', 'User', `Import Plex : ${imported} importés, ${skipped} existants`);
  return { imported, skipped, total: sharedUsers.length };
}

// ─── Auth Provider ──────────────────────────────────────────────────

const plexAuth: AuthProvider = {
  config: { id: 'plex', label: 'Plex', type: 'oauth' },

  async registerRoutes(app, helpers) {
    app.post('/plex/pin', async (_request, reply) => {
      const result = await plexCreatePin();
      return reply.send(result);
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
      const result = await helpers.findOrCreateUser({
        provider: 'plex',
        providerId: String(plexAccount.id),
        providerToken: authToken,
        providerUsername: plexAccount.username,
        providerEmail: plexAccount.email.toLowerCase(),
        email: plexAccount.email.toLowerCase(),
        displayName: plexAccount.username,
        avatar: plexAccount.thumb,
      });

      logEvent('info', 'Auth', `${result.displayName} s'est connecté (plex)${result.isNew ? ' — nouveau compte' : ''}`);
      return helpers.signAndSend(reply, result.id);
    });
  },

  async linkAccount(pinId, userId) {
    const authToken = await checkPlexPin(pinId, PLEX_CLIENT_ID);
    if (!authToken) throw new Error('PIN_INVALID');

    const plexAccount = await getPlexUser(authToken);
    const existing = await prisma.userProvider.findUnique({
      where: { provider_providerId: { provider: 'plex', providerId: String(plexAccount.id) } },
    });
    if (existing && existing.userId !== userId) throw new Error('PROVIDER_ALREADY_LINKED');

    await prisma.userProvider.upsert({
      where: { userId_provider: { userId, provider: 'plex' } },
      update: { providerId: String(plexAccount.id), providerToken: authToken, providerUsername: plexAccount.username, providerEmail: plexAccount.email.toLowerCase() },
      create: { userId, provider: 'plex', providerId: String(plexAccount.id), providerToken: authToken, providerUsername: plexAccount.username, providerEmail: plexAccount.email.toLowerCase() },
    });

    await prisma.user.update({ where: { id: userId }, data: { avatar: plexAccount.thumb } });
    logEvent('info', 'Auth', `Compte Plex lié : ${plexAccount.username}`);
    return { providerUsername: plexAccount.username };
  },

  async getToken(adminUserId) {
    return getPlexToken(adminUserId);
  },

  async importUsers(adminUserId) {
    const token = await getPlexToken(adminUserId);
    if (!token) throw new Error('NO_TOKEN');
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.plexMachineId) throw new Error('NO_MACHINE_ID');
    return importPlexUsers(token, settings.plexMachineId);
  },
};

// ─── Unified Provider ───────────────────────────────────────────────

export const plexProvider: Provider = {
  service: {
    id: 'plex',
    label: 'Plex',
    icon: 'https://www.vectorlogo.zone/logos/plextv/plextv-tile.svg',
    category: 'media-server',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:32400' },
      { key: 'token', labelKey: 'common.token', type: 'password', helper: 'plex-oauth' },
      { key: 'machineId', labelKey: 'provider.plex.machine_id', type: 'text', helper: 'plex-detect-machine-id' },
    ],
    async test(config) {
      const { data } = await axios.get(`${config.url}/identity`, {
        headers: { 'X-Plex-Token': config.token, Accept: 'application/json' },
        timeout: 5000,
      });
      return { ok: true, version: data.MediaContainer?.version };
    },
  },
  auth: plexAuth,
};
