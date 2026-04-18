import axios from 'axios';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import type { Provider, AuthProvider } from '../types.js';

// ─── Emby API helpers ──────────────────────────────────────────────

const EMBY_HEADERS = {
  'X-Emby-Authorization': 'MediaBrowser Client="Oscarr", Device="Server", DeviceId="oscarr-server", Version="1.0.0"',
};

async function authenticateByName(serverUrl: string, username: string, password: string) {
  const { data } = await axios.post(
    `${serverUrl}/Users/AuthenticateByName`,
    { Username: username, Pw: password },
    { headers: EMBY_HEADERS, timeout: 10000 },
  );
  return {
    userId: data.User.Id as string,
    token: data.AccessToken as string,
    user: {
      id: data.User.Id as string,
      name: (data.User.Name || username) as string,
      primaryImageTag: data.User.PrimaryImageTag as string | undefined,
    },
  };
}

async function getUsers(serverUrl: string, apiKey: string) {
  const { data } = await axios.get(`${serverUrl}/Users`, {
    headers: { ...EMBY_HEADERS, 'X-Emby-Token': apiKey },
    timeout: 10000,
  });
  return (data as { Id: string; Name: string; PrimaryImageTag?: string }[]).map(u => ({
    id: u.Id,
    name: u.Name,
    avatar: u.PrimaryImageTag ? `${serverUrl}/Users/${u.Id}/Images/Primary?tag=${u.PrimaryImageTag}` : null,
  }));
}

function getAvatarUrl(serverUrl: string, userId: string, imageTag?: string): string | null {
  if (!imageTag) return null;
  return `${serverUrl}/Users/${userId}/Images/Primary?tag=${imageTag}`;
}

async function getConfig(): Promise<{ url: string; apiKey: string } | null> {
  const service = await prisma.service.findFirst({ where: { type: 'emby', enabled: true } });
  if (!service) return null;
  const config = JSON.parse(service.config) as Record<string, string>;
  return config.url ? { url: config.url, apiKey: config.apiKey || '' } : null;
}

// ─── Auth Provider ─────────────────────────────────────────────────

const embyAuth: AuthProvider = {
  config: {
    id: 'emby',
    label: 'Emby',
    type: 'credentials',
    configSchema: [
      {
        key: 'allowSignup',
        label: 'Allow new account creation',
        type: 'boolean',
        default: false,
        help: 'Off by default — only users with an existing Oscarr account can log in via Emby. Turn on to let any Emby user auto-register on first login. Ignored when General → Registration is disabled (global kill-switch wins).',
      },
    ],
    requiresService: true,
  },

  async registerRoutes(app, helpers) {
    app.post('/emby/login', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object' as const,
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' as const },
            password: { type: 'string' as const },
          },
        },
      },
    }, async (request, reply) => {
      const { username, password } = request.body as { username: string; password: string };

      const cfg = await getConfig();
      if (!cfg) return reply.status(503).send({ error: 'Emby server not configured' });
      const serverUrl = cfg.url;

      try {
        const auth = await authenticateByName(serverUrl, username, password);
        const avatar = getAvatarUrl(serverUrl, auth.user.id, auth.user.primaryImageTag);

        const result = await helpers.findOrCreateUser({
          provider: 'emby',
          providerId: auth.userId,
          providerToken: auth.token,
          providerUsername: auth.user.name,
          email: `${auth.user.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@emby.local`,
          displayName: auth.user.name,
          avatar,
        });

        logEvent('info', 'Auth', `${result.displayName} logged in (emby)${result.isNew ? ' — new account' : ''}`);
        return helpers.signAndSend(reply, result.id);
      } catch (err) {
        if ((err as Error).message === 'SIGNUP_NOT_ALLOWED') {
          return reply.status(403).send({ error: 'SIGNUP_NOT_ALLOWED' });
        }
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) return reply.status(401).send({ error: 'Invalid username or password' });
        logEvent('warn', 'Auth', `Emby auth failed for "${username}": ${String(err)}`);
        return reply.status(500).send({ error: 'Authentication failed' });
      }
    });
  },

  async linkAccountByCredentials(username, password, userId) {
    const cfg = await getConfig();
    if (!cfg) throw new Error('NOT_CONFIGURED');
    const serverUrl = cfg.url;

    const auth = await authenticateByName(serverUrl, username, password);

    const existing = await prisma.userProvider.findUnique({
      where: { provider_providerId: { provider: 'emby', providerId: auth.userId } },
    });
    if (existing && existing.userId !== userId) throw new Error('PROVIDER_ALREADY_LINKED');

    const avatar = getAvatarUrl(serverUrl, auth.user.id, auth.user.primaryImageTag);
    await prisma.userProvider.upsert({
      where: { userId_provider: { userId, provider: 'emby' } },
      update: { providerId: auth.userId, providerToken: auth.token, providerUsername: auth.user.name },
      create: { userId, provider: 'emby', providerId: auth.userId, providerToken: auth.token, providerUsername: auth.user.name },
    });
    if (avatar) await prisma.user.update({ where: { id: userId }, data: { avatar } });

    logEvent('info', 'Auth', `Emby account linked: ${auth.user.name}`);
    return { providerUsername: auth.user.name };
  },

  async importUsers(_adminUserId) {
    const cfg = await getConfig();
    if (!cfg || !cfg.apiKey) throw new Error('NO_TOKEN');
    const { url: serverUrl, apiKey } = cfg;

    const users = await getUsers(serverUrl, apiKey);
    let imported = 0;
    let skipped = 0;

    for (const user of users) {
      const existingProvider = await prisma.userProvider.findUnique({
        where: { provider_providerId: { provider: 'emby', providerId: user.id } },
      });
      if (existingProvider) { skipped++; continue; }

      const email = `${user.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@emby.local`;
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) { skipped++; continue; }

      await prisma.user.create({
        data: {
          email,
          displayName: user.name,
          avatar: user.avatar,
          role: 'user',
          providers: {
            create: {
              provider: 'emby',
              providerId: user.id,
              providerUsername: user.name,
            },
          },
        },
      });
      imported++;
    }

    logEvent('info', 'User', `Import Emby: ${imported} imported, ${skipped} existing`);
    return { imported, skipped, total: users.length };
  },
};

// ─── Unified Provider ──────────────────────────────────────────────

export const embyProvider: Provider = {
  service: {
    id: 'emby',
    label: 'Emby',
    icon: 'https://emby.media/community/uploads/inline/44692/560bd2152e1ad_MB3_95_78.png',
    category: 'media-server',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:8096' },
      { key: 'apiKey', labelKey: 'common.api_key', type: 'password' },
    ],
    async test(config) {
      const { data } = await axios.get(`${config.url}/System/Info/Public`, { timeout: 5000 });
      return { ok: true, version: data.Version };
    },
  },
  auth: embyAuth,
};
