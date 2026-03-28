# Authentication Providers

Oscarr uses a modular authentication system. Users can sign in via email/password (built-in) or through OAuth providers like Plex. Each OAuth provider is part of a unified [Provider](./providers.md) that can also define a service.

## Architecture

```
packages/backend/src/
  providers/
    types.ts              # Provider, AuthProvider, AuthHelpers interfaces
    index.ts              # Central registry
    plex/index.ts         # Plex: service + auth (OAuth, link, import)
    radarr/index.ts       # Radarr: service only (no auth)
  auth/
    providers/
      email.ts            # Email/password (built-in, not in provider registry)
  routes/
    auth.ts               # Auth routes + provider registration
```

## How it works

1. `GET /auth/providers` returns the list of available auth methods (email + all registered OAuth providers)
2. The login page dynamically renders a form for `credentials` providers and OAuth buttons for `oauth` providers
3. OAuth providers register their own routes (e.g. `/auth/plex/pin`, `/auth/plex/callback`) via `registerRoutes()`
4. All providers use the same `AuthHelpers` to create/find users and sign JWTs

## Adding an OAuth provider

If your provider only needs authentication (no service), you can still use the unified Provider interface with just the `auth` field. See [Providers documentation](./providers.md) for the full guide.

The auth-specific parts of a provider:

```typescript
const myAuth: AuthProvider = {
  config: {
    id: 'discord',            // Unique ID — used in DB, routes, frontend
    label: 'Discord',          // Display name on login page
    type: 'oauth',             // 'oauth' = popup flow, 'credentials' = form
  },

  async registerRoutes(app, helpers) {
    // Register your OAuth callback route
    app.post('/discord/callback', async (request, reply) => {
      // 1. Validate the OAuth token/code
      // 2. Get user info from the provider API
      // 3. Use helpers to create/find user and sign JWT
      const result = await helpers.findOrCreateUser({
        provider: 'discord',
        providerId: 'discord-user-id-123',
        providerToken: 'oauth-access-token',
        providerUsername: 'username',
        providerEmail: 'user@example.com',
        email: 'user@example.com',
        displayName: 'Display Name',
        avatar: 'https://cdn.discordapp.com/avatars/...',
      });
      return helpers.signAndSend(reply, result.id);
    });
  },

  // Optional: link this provider to an existing account
  async linkAccount(pinId, userId) {
    // Validate OAuth, upsert UserProvider record
    return { providerUsername: 'linked-username' };
  },

  // Optional: import users from the provider's system
  async importUsers(adminUserId) {
    return { imported: 5, skipped: 2, total: 7 };
  },
};
```

## AuthHelpers API

Providers receive `helpers` in `registerRoutes()`:

| Method | Description |
|--------|-------------|
| `helpers.findOrCreateUser(opts)` | Find existing user by provider ID or email, create if not found. Upserts the provider link. First user auto-becomes admin. Returns `{ ...user, isNew: boolean }`. |
| `helpers.signAndSend(reply, userId)` | Sign a JWT, set the `token` cookie, and send the user response with provider list. |

### findOrCreateUser options

| Field | Required | Description |
|-------|----------|-------------|
| `provider` | Yes | Provider ID (e.g. `'plex'`, `'discord'`) |
| `providerId` | Yes | External user ID from the provider |
| `providerToken` | No | OAuth token (stored for API calls like importing users) |
| `providerUsername` | No | Username from the provider |
| `providerEmail` | No | Email from the provider (shown in admin if different from user email) |
| `email` | Yes | User's email (used for account matching) |
| `displayName` | Yes | Display name (used if creating a new user) |
| `avatar` | No | Avatar URL |

## Database: UserProvider table

Each provider link is stored in the `UserProvider` table:

| Column | Description |
|--------|-------------|
| `userId` | FK to User |
| `provider` | Provider ID (`plex`, `email`, `discord`, etc.) |
| `providerId` | External user ID from the provider |
| `providerToken` | OAuth token for API calls |
| `providerUsername` | Username from the provider |
| `providerEmail` | Email from the provider |

A user can have multiple providers linked (e.g. email + plex + discord).

**Unique constraints:**
- `(provider, providerId)` — one provider account maps to one user
- `(userId, provider)` — a user has at most one link per provider

## Admin features

- **Link provider**: `POST /auth/link-provider` (authenticated) or `POST /admin/users/:id/link-provider` (admin)
- **Import users**: `POST /admin/users/import/:provider` — calls `provider.importUsers()` if implemented
- **Provider badges**: Admin panel shows provider badges per user with provider email if different

## Frontend: login page

The login page fetches `GET /auth/providers` and dynamically renders:
- A form for `credentials` type providers (email/password)
- OAuth buttons for `oauth` type providers

Provider button styles are defined in `LoginPage.tsx` `PROVIDER_STYLES`. To add your provider's colors:

```typescript
const PROVIDER_STYLES = {
  plex: { bg: 'bg-[#e5a00d]', hover: 'hover:bg-[#cc8c00]', text: 'text-black' },
  discord: { bg: 'bg-[#5865F2]', hover: 'hover:bg-[#4752C4]', text: 'text-white' },
  // Add your provider here
};
```
