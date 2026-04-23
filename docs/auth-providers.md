# Authentication Providers

Oscarr uses a modular authentication system. Users can sign in via email/password, credentials-based providers (Jellyfin/Emby), or full OAuth providers (Plex PIN flow, Discord OAuth 2.0). Each provider is part of a unified [Provider](./providers.md) which can optionally define a matching media service.

## Architecture

```
packages/backend/src/
  providers/
    types.ts              # Provider, AuthProvider, AuthProviderField, AuthHelpers
    index.ts              # Central registry + ALL_PROVIDERS list
    authSettings.ts       # Read/write helpers backed by AuthProviderSettings
    plex/index.ts         # Plex: service + auth (PIN flow, link, import)
    jellyfin/index.ts     # Jellyfin: service + credentials auth
    emby/index.ts         # Emby: service + credentials auth
    email/index.ts        # Email: auth-only (no media service)
    discord/index.ts      # Discord: auth-only OAuth 2.0
    radarr/index.ts       # Radarr: service only (no auth)
  routes/
    auth.ts               # Generic /api/auth routes + per-provider registerRoutes hook
    admin/authProviders.ts# Admin CRUD for AuthProviderSettings
  middleware/rbac.ts      # Enforces admin.* on /api/admin/auth-providers
```

## How enablement is stored

A provider is "enabled" when its row in `AuthProviderSettings` has `enabled: true`. One row per provider, keyed by the provider id:

```prisma
model AuthProviderSettings {
  provider String  @unique  // "email" | "plex" | "jellyfin" | "emby" | "discord"
  enabled  Boolean @default(false)
  config   String  @default("{}")  // JSON blob — OAuth creds, redirect URIs, …
}
```

Upsert-on-read: a brand-new provider added to the code after an earlier migration gets a disabled default row automatically on first query. No manual seed or migration is needed to introduce a new provider.

Before v0.6.3, enablement was coupled to the `Service` table — which worked for providers that doubled as media servers (plex/jellyfin/emby) but had nowhere to put Discord OAuth (Discord isn't a media server, so it had no `Service` row to hook config onto). The rework decouples the two: toggling a media service no longer affects its auth provider and vice versa.

## How it works at runtime

1. `GET /api/auth/providers` returns the providers whose `AuthProviderSettings.enabled` is true.
2. The login page dynamically renders:
   - A form for `credentials` providers (email, Jellyfin, Emby).
   - OAuth buttons for `oauth` providers (Plex, Discord).
3. Each provider registers its own routes at `/api/auth/<id>/*` via `registerRoutes()`.
4. All providers use the same `AuthHelpers` (below) to create/find users and sign JWTs.

## Managing providers from the admin UI

**Admin → Authentication** renders a card per provider:

- Toggle to enable/disable.
- Dynamic config form driven by the provider's `configSchema` (see Adding a provider).
- Password fields are masked — the stored secret is never sent back to the browser; on save, the `__MASKED__` placeholder is stripped so the existing value is preserved when the admin only wants to flip the toggle.

## Discord OAuth setup

### Prerequisites

1. Create an application at <https://discord.com/developers/applications>.
2. Under **OAuth2**, copy the **Client ID** and **Client Secret**.
3. Add a redirect URI pointing at your Oscarr instance:
   `https://<oscarr-host>/api/auth/discord/callback`

### Oscarr config

In the Discord card on the Authentication tab:

- **Application (Client) ID** — from the Discord app
- **Client Secret** — from the Discord app
- **Redirect URI** — must match what you registered in Discord exactly

Save, toggle on. A "Continue with Discord" button appears on the login page.

### Linking an existing account to Discord

An Oscarr user who registered via email or another provider can attach Discord to their existing account without creating a duplicate:

1. While logged in, navigate to `/api/auth/discord/authorize?action=link`.
2. Complete the Discord OAuth flow.
3. `UserProvider` gains a `provider: 'discord'` row tied to the current Oscarr user; the user lands on `/profile?linked=discord`.

Plugins (e.g. a Discord bot) can DM this URL after a `/login` slash-command so users click through once to pair their Discord identity with their Oscarr account.

## Adding a provider

A provider lives in `packages/backend/src/providers/<id>/index.ts`. Minimal auth-only provider:

```typescript
import type { FastifyInstance } from 'fastify';
import type { AuthProvider, AuthHelpers, Provider, ServiceDefinition } from '../types.js';
import { getProviderConfig } from '../authSettings.js';

const myService: ServiceDefinition = {
  id: 'discord',
  label: 'Discord',
  icon: '',
  category: 'media-server', // unused — filtered out of Services tab below
  fields: [],
  test: async () => ({ ok: true }),
};

const myAuth: AuthProvider = {
  config: {
    id: 'discord',
    label: 'Discord',
    type: 'oauth',                 // 'oauth' = external redirect, 'credentials' = username/password form
    configSchema: [                 // Declares the admin config form — renders automatically
      { key: 'clientId',     label: 'Client ID',     type: 'string',   required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { key: 'redirectUri',  label: 'Redirect URI',  type: 'url',      required: true, help: 'Copy into your OAuth app' },
    ],
  },
  async registerRoutes(app: FastifyInstance, helpers: AuthHelpers) {
    app.get('/discord/authorize', async (_req, reply) => {
      const cfg = await getProviderConfig('discord');
      // …build authorize URL, 302 to the external provider
    });
    app.get('/discord/callback', async (req, reply) => {
      // 1. Exchange code for token
      // 2. Fetch user profile from the provider API
      // 3. Login: find-or-create + sign JWT cookie + redirect home
      // 4. Link (action=link): upsert UserProvider + redirect to /profile
    });
  },
};

export const discordProvider: Provider = { service: myService, auth: myAuth };
```

Register in `packages/backend/src/providers/index.ts`:

```typescript
import { discordProvider } from './discord/index.js';

const ALL_PROVIDERS: Provider[] = [/* …existing, */ discordProvider];

// Auth-only providers (no media service) — filtered out of the Services admin tab.
const AUTH_ONLY_PROVIDER_IDS = new Set(['email', 'discord']);
```

See `providers/discord/index.ts` for the full production reference — it covers state-bound CSRF protection, login-vs-link branching, and manual cookie+redirect handling (instead of `helpers.signAndSend` which writes a JSON body).

### `configSchema` field types

| Type | UI rendering |
|---|---|
| `string` | Plain text input |
| `password` | Password input, masked after save |
| `url` | Text input with a Copy-to-clipboard button |

All fields can be `required`, carry a `placeholder`, and an optional `help` string shown below the input.

## AuthHelpers

Providers receive `helpers` in `registerRoutes()`:

| Method | Description |
|---|---|
| `helpers.findOrCreateUser(opts)` | Find-or-create-user via `(provider, providerId)` first, fall back to `email`. Upserts the `UserProvider` row. The first user auto-becomes admin. Returns `{ ...user, isNew }`. |
| `helpers.signAndSend(reply, userId)` | Signs a JWT, sets the `token` cookie, and sends a JSON user payload. **Do not use this for OAuth redirect callbacks** — it writes a response body that conflicts with `reply.redirect()`. Set the cookie + redirect manually instead (Discord provider does this). |

### `findOrCreateUser` options

| Field | Required | Description |
|---|---|---|
| `provider` | Yes | Provider ID (`plex`, `discord`, …) |
| `providerId` | Yes | External user ID from the provider |
| `providerToken` | No | OAuth token — stored for future API calls. Leave empty for providers that keep a separate bot/admin token. |
| `providerUsername` | No | Username from the provider |
| `providerEmail` | No | Email from the provider (shown in admin if different from the Oscarr user's email) |
| `email` | Yes | Used for account matching when no provider link exists yet |
| `displayName` | Yes | Used when creating a new user |
| `avatar` | No | Avatar URL |

## UserProvider table

Each external identity attached to an Oscarr user is stored in `UserProvider`:

| Column | Description |
|---|---|
| `userId` | FK to User |
| `provider` | Provider ID (`email`, `plex`, `discord`, …) |
| `providerId` | External user ID from the provider |
| `providerToken` | OAuth token for API calls (nullable) |
| `providerUsername` | Username from the provider |
| `providerEmail` | Email from the provider |

Unique constraints:
- `(provider, providerId)` — one external account maps to one Oscarr user
- `(userId, provider)` — an Oscarr user has at most one link per provider

A user can have multiple providers linked simultaneously (e.g. email + plex + discord).

## Plugin integration

Plugins that receive events from an external system (Discord bot webhooks, Telegram updates, …) resolve the Oscarr user behind an external id via the context:

```typescript
// Capability required: users:read
const user = await ctx.findUserByProvider('discord', discordUserId);
if (user) {
  // user.id, user.email, user.displayName, user.role
}
```

**Plugins MUST NOT query `prisma.userProvider` directly** — that bypasses the capability gate and breaks when the provider table shape evolves. `ctx.findUserByProvider` is the stable contract.

## Admin features

- **Link provider**: `POST /api/auth/link-provider` (authenticated) to attach another credentials-based provider to the current user. For OAuth providers, use `/api/auth/<id>/authorize?action=link` instead — state-bound to the caller's JWT.
- **Import users**: `POST /api/admin/users/import/:provider` — calls `provider.importUsers()` if implemented.
- **Provider badges**: the admin Users tab shows provider badges per user, with the provider email if different from the Oscarr email.

## Admin API

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/auth-providers` | `admin.*` | List every provider with `id`, `label`, `type`, `configSchema`, `enabled`, `config` (passwords masked). |
| `PATCH` | `/api/admin/auth-providers/:id` | `admin.*` | Partial update — pass `enabled` and/or `config`. Config merges shallowly; omitting a field keeps its stored value. The `__MASKED__` placeholder is stripped server-side so the existing secret is preserved. |

## Frontend: login page

The login page fetches `GET /api/auth/providers` and renders:

- A form for `credentials` type providers (email/Jellyfin/Emby).
- OAuth buttons for `oauth` type providers (Plex, Discord).

Provider button styles are defined in `LoginPage.tsx` `PROVIDER_STYLES`:

```typescript
const PROVIDER_STYLES = {
  plex:     { bg: 'bg-[#e5a00d]', hover: 'hover:bg-[#cc8c00]', text: 'text-black' },
  discord:  { bg: 'bg-[#5865F2]', hover: 'hover:bg-[#4752C4]', text: 'text-white' },
  jellyfin: { bg: 'bg-[#00a4dc]', hover: 'hover:bg-[#0090c4]', text: 'text-white' },
  emby:     { bg: 'bg-[#52b54b]', hover: 'hover:bg-[#429a3d]', text: 'text-white' },
};
```

For OAuth providers, the click handler does a full-page navigation to `/api/auth/<id>/authorize` — the backend 302s to the external provider and the round-trip ends with a JWT cookie set on the callback.
