import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthHelpers, AuthProvider, Provider, ServiceDefinition } from '../types.js';
import { getProviderConfig } from '../authSettings.js';

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';
const SCOPE = 'identify email';

interface DiscordConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

// Short-lived in-memory store for OAuth `state` → intent. Enough for interactive OAuth round-trips
// (10min TTL); a server restart mid-flow drops pending states, which is acceptable for admins.
interface StateRecord {
  intent: 'login' | 'link';
  userId?: number; // present when intent === 'link'
  createdAt: number;
}
const STATE_TTL_MS = 10 * 60 * 1000;
const stateStore = new Map<string, StateRecord>();

function gcStates(): void {
  const now = Date.now();
  for (const [k, v] of stateStore) if (now - v.createdAt > STATE_TTL_MS) stateStore.delete(k);
}

async function getConfig(): Promise<Required<DiscordConfig>> {
  const cfg = (await getProviderConfig('discord')) as DiscordConfig;
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error('Discord OAuth is not fully configured');
  }
  return cfg as Required<DiscordConfig>;
}

const discordService: ServiceDefinition = {
  id: 'discord',
  label: 'Discord',
  icon: '',
  category: 'media-server', // unused — filtered out of the services admin tab
  fields: [],
  test: async () => ({ ok: true }),
};

const discordAuth: AuthProvider = {
  config: {
    id: 'discord',
    label: 'Discord',
    type: 'oauth',
    configSchema: [
      { key: 'clientId', label: 'Application (Client) ID', type: 'string', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      {
        key: 'redirectUri',
        label: 'Redirect URI',
        type: 'url',
        required: true,
        help: "Paste this into your Discord application's OAuth2 settings — must match exactly.",
      },
    ],
  },

  async registerRoutes(app: FastifyInstance, helpers: AuthHelpers) {
    // ── Authorize: entrypoint for both login and link-to-existing-account flows ──
    app.get<{ Querystring: { action?: string } }>('/discord/authorize', async (request, reply) => {
      gcStates();
      const cfg = await getConfig().catch(() => null);
      if (!cfg) return reply.status(503).send({ error: 'Discord OAuth not configured' });

      const action = request.query.action === 'link' ? 'link' : 'login';
      let userId: number | undefined;
      if (action === 'link') {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'Login required to link' });
        }
        userId = (request.user as { id: number }).id;
      }

      const state = randomUUID();
      stateStore.set(state, { intent: action, userId, createdAt: Date.now() });

      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', cfg.clientId);
      url.searchParams.set('redirect_uri', cfg.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', SCOPE);
      url.searchParams.set('state', state);
      return reply.redirect(url.toString());
    });

    // ── Callback: exchange code → token → user profile, then login or link ──
    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
      '/discord/callback',
      async (request, reply) => {
        const { code, state, error } = request.query;
        if (error) return reply.redirect(`/login?error=${encodeURIComponent(error)}`);
        if (!code || !state) return reply.redirect('/login?error=missing_code_or_state');

        const record = stateStore.get(state);
        if (!record) return reply.redirect('/login?error=invalid_state');
        stateStore.delete(state);

        const cfg = await getConfig().catch(() => null);
        if (!cfg) return reply.status(503).send({ error: 'Discord OAuth not configured' });

        const tokenRes = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: cfg.redirectUri,
          }),
        });
        if (!tokenRes.ok) return reply.redirect(`/login?error=discord_token_${tokenRes.status}`);
        const tokenPayload = (await tokenRes.json()) as { access_token?: string };
        if (!tokenPayload.access_token) return reply.redirect('/login?error=discord_no_token');

        const userRes = await fetch(USER_URL, { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } });
        if (!userRes.ok) return reply.redirect(`/login?error=discord_user_${userRes.status}`);
        const profile = (await userRes.json()) as {
          id: string;
          username: string;
          email?: string;
          global_name?: string;
        };

        if (record.intent === 'link' && record.userId) {
          // Attach this Discord identity to the already-authenticated user.
          const { prisma } = await import('../../utils/prisma.js');
          await prisma.userProvider.upsert({
            where: { provider_providerId: { provider: 'discord', providerId: profile.id } },
            update: {
              userId: record.userId,
              providerUsername: profile.username,
              providerEmail: profile.email ?? null,
            },
            create: {
              userId: record.userId,
              provider: 'discord',
              providerId: profile.id,
              providerUsername: profile.username,
              providerEmail: profile.email ?? null,
            },
          });
          return reply.redirect('/profile?linked=discord');
        }

        // Login flow — find-or-create, set the JWT cookie manually (helpers.signAndSend also
        // writes a JSON body which we'd then clobber with the redirect), and redirect home.
        const displayName = profile.global_name ?? profile.username;
        const resolved = await helpers.findOrCreateUser({
          provider: 'discord',
          providerId: profile.id,
          providerUsername: profile.username,
          providerEmail: profile.email,
          email: profile.email ?? `${profile.id}@discord.local`,
          displayName,
        });

        const jwt = app.jwt.sign(
          { id: resolved.id, email: resolved.email, role: resolved.role },
          { expiresIn: '24h' }
        );
        return reply
          .setCookie('token', jwt, {
            path: '/',
            httpOnly: true,
            secure:
              process.env.COOKIE_SECURE === 'true' ||
              (process.env.COOKIE_SECURE !== 'false' && request.protocol === 'https'),
            sameSite: 'lax',
            maxAge: 24 * 60 * 60,
          })
          .redirect('/');
      }
    );
  },
};

export const discordProvider: Provider = { service: discordService, auth: discordAuth };
