# Authentication Providers

Oscarr uses a modular authentication system. Each provider is a standalone module that handles OAuth flows, account linking, and user import.

## Architecture

```
packages/backend/src/
  auth/
    types.ts              # AuthProvider interface
    providers/
      plex.ts             # Plex OAuth provider
      email.ts            # Email/password provider (built-in)
  routes/
    auth.ts               # Provider registry + email routes
  services/
    plex.ts               # Low-level Plex API calls
```

## Creating a new provider

### 1. Create the provider file

Create `packages/backend/src/auth/providers/<name>.ts`:

```typescript
import type { AuthProvider, AuthHelpers } from '../types.js';

export const myProvider: AuthProvider = {
  config: {
    id: 'my-provider',       // Unique ID used in API routes and DB
    label: 'My Provider',    // Display name shown on login page
    type: 'oauth',           // 'oauth' (popup flow) or 'credentials' (form)
  },

  async registerRoutes(app, helpers) {
    // Register OAuth-specific routes under /auth/<provider>/...
    app.post('/my-provider/callback', async (request, reply) => {
      // 1. Validate the OAuth callback
      // 2. Get user info from the provider API
      // 3. Use helpers.findOrCreateUser() to create/match user
      const result = await helpers.findOrCreateUser({
        provider: 'my-provider',
        providerId: 'external-user-id',
        providerToken: 'oauth-token',
        providerUsername: 'username',
        email: 'user@example.com',
        displayName: 'User Name',
        avatar: 'https://...',
      });
      // 4. Sign JWT and send response
      return helpers.signAndSend(reply, result.id);
    });
  },

  // Optional: link this provider to an existing account
  async linkAccount(pinId, userId) {
    // Validate OAuth, then upsert UserProvider record
    return { providerUsername: 'linked-username' };
  },

  // Optional: import users from the provider's system
  async importUsers(adminUserId) {
    // Fetch users from external API, create accounts
    return { imported: 5, skipped: 2, total: 7 };
  },

  // Optional: get a valid API token for this provider
  async getToken(adminUserId) {
    // Check service config first, then user's provider token
    return 'token-string';
  },
};
```

### 2. Register the provider

In `packages/backend/src/routes/auth.ts`, add your provider to the `PROVIDERS` array:

```typescript
import { myProvider } from '../auth/providers/my-provider.js';

const PROVIDERS: AuthProvider[] = [
  plexProvider,
  myProvider,  // Add here
];
```

That's it. The provider will automatically:
- Appear on the login page via `GET /auth/providers`
- Have its routes registered under `/auth/`
- Support account linking via `POST /auth/link-provider`
- Support user import via `POST /admin/users/import/<provider-id>` (if `importUsers` is implemented)

## AuthHelpers API

Providers receive `helpers` in `registerRoutes()`:

| Method | Description |
|--------|-------------|
| `helpers.findOrCreateUser(opts)` | Find existing user by provider ID or email, create if not found. Upserts the provider link. First user becomes admin. |
| `helpers.signAndSend(reply, userId)` | Sign a JWT, set the auth cookie, and send the user response. |

## Database: UserProvider table

Each provider link is stored in the `UserProvider` table:

| Column | Description |
|--------|-------------|
| `userId` | FK to User |
| `provider` | Provider ID (`plex`, `email`, `discord`, etc.) |
| `providerId` | External user ID from the provider |
| `providerToken` | OAuth token (for API calls like importing users) |
| `providerUsername` | Username from the provider (used for display/tag matching) |

A user can have multiple providers linked (e.g. email + plex + discord).

Unique constraints:
- `(provider, providerId)` — one provider account can only be linked to one user
- `(userId, provider)` — a user can have at most one link per provider

## Frontend: login page

The login page fetches `GET /auth/providers` and dynamically renders:
- A form for `credentials` type providers (email/password)
- OAuth buttons for `oauth` type providers (styled per provider)

Provider button styles are defined in `LoginPage.tsx` `PROVIDER_STYLES` — add your provider's colors there.
