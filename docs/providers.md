# Providers

Providers are the core extension point for adding external services to Oscarr. Each provider is a self-contained module that defines how Oscarr connects to, tests, and authenticates with an external service.

## Architecture

```
packages/backend/src/providers/
  types.ts                # Provider, ServiceDefinition, AuthProvider interfaces
  index.ts                # Central registry — all providers are registered here
  radarr/index.ts         # Service only (no auth)
  sonarr/index.ts         # Service only (no auth)
  plex/index.ts           # Service + Auth (OAuth, link, import)
  qbittorrent/index.ts    # Service only
  tautulli/index.ts       # Service only
```

## The Provider interface

Every provider exports a `Provider` object:

```typescript
interface Provider {
  service: ServiceDefinition;   // Required — service config, fields, test
  auth?: AuthProvider;          // Optional — OAuth login, account linking, user import
}
```

A provider can be **service-only** (Radarr, Sonarr, qBittorrent) or **service + auth** (Plex, Jellyfin, Discord).

## Creating a new provider

### Step 1: Create the provider file

Create `packages/backend/src/providers/<name>/index.ts`:

```typescript
import axios from 'axios';
import type { Provider } from '../types.js';

export const jellyfinProvider: Provider = {
  service: {
    id: 'jellyfin',
    label: 'Jellyfin',
    icon: 'https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg',
    category: 'media-server',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:8096' },
      { key: 'apiKey', labelKey: 'common.api_key', type: 'password' },
    ],
    async test(config) {
      const { data } = await axios.get(`${config.url}/System/Info`, {
        headers: { Authorization: `MediaBrowser Token="${config.apiKey}"` },
        timeout: 5000,
      });
      return { ok: true, version: data.Version };
    },
  },
  // auth: jellyfinAuth,  // Add if this provider supports OAuth
};
```

### Step 2: Register the provider

In `packages/backend/src/providers/index.ts`, import and add to the `ALL_PROVIDERS` array:

```typescript
import { jellyfinProvider } from './jellyfin/index.js';

const ALL_PROVIDERS: Provider[] = [
  radarrProvider,
  sonarrProvider,
  plexProvider,
  qbittorrentProvider,
  tautulliProvider,
  jellyfinProvider,  // Add here
];
```

That's it. The provider will automatically:
- Appear in the setup wizard and admin Services tab
- Have its form fields generated dynamically from `fields`
- Support connection testing via its `test()` function
- Be available via `GET /admin/service-schemas` and `GET /setup/service-schemas`

### Step 3 (optional): Add auth support

If your provider supports user authentication (OAuth), add an `auth` field. See [Auth Providers](./auth-providers.md) for details.

## ServiceDefinition reference

```typescript
interface ServiceDefinition {
  id: string;           // Unique ID stored in DB (e.g. 'radarr', 'plex')
  label: string;        // Display name (e.g. 'Radarr', 'Plex')
  icon: string;         // URL to the provider's icon (external URL, not local file)
  category: 'arr' | 'media-server' | 'download-client' | 'monitoring';
  fields: ServiceField[];
  test(config: Record<string, string>): Promise<{ ok: boolean; version?: string }>;
}
```

### ServiceField

```typescript
interface ServiceField {
  key: string;          // Config key stored in DB (e.g. 'url', 'apiKey')
  labelKey: string;     // i18n key for the field label (e.g. 'common.url')
  type: 'text' | 'password';
  placeholder?: string; // Placeholder text (not translated)
  helper?: string;      // Optional UI helper (e.g. 'plex-oauth', 'plex-detect-machine-id')
}
```

### Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `arr` | Media management (*arr stack) | Radarr, Sonarr, Lidarr, Readarr |
| `media-server` | Media servers | Plex, Jellyfin, Emby |
| `download-client` | Download clients | qBittorrent, Transmission, SABnzbd |
| `monitoring` | Monitoring & analytics | Tautulli, Overseerr |

### Field labels (i18n)

Field labels use i18n keys that the frontend translates. Common keys already available:

| Key | EN | FR |
|-----|----|----|
| `common.url` | URL | URL |
| `common.api_key` | API Key | Clé API |
| `common.token` | Token | Token |
| `common.username` | Username | Nom d'utilisateur |
| `common.password` | Password | Mot de passe |

For provider-specific labels, add keys prefixed with `provider.<id>.*` in both translation files.

### Field helpers

Helpers trigger special UI behavior on a field. Currently supported:

| Helper | Description |
|--------|-------------|
| `plex-oauth` | Shows an "OAuth" button that launches the Plex PIN flow and fills the field with the token |
| `plex-detect-machine-id` | Shows a detect button that auto-fills the Machine ID from the Plex server |

To add a new helper, handle it in `InstallPage.tsx` and `ServiceModal` in `AdminPage.tsx`.

### The test() function

Each provider must implement `test(config)` which receives the config values as a flat `Record<string, string>` and returns:

```typescript
{ ok: true, version?: string }  // Success — version is shown in the UI
// OR throws an error             // Failure — caught by the API
```

The test function is called by:
- `POST /setup/test-service` during installation
- `POST /admin/services/:id/test` in the admin panel

### Icon URLs

Icons should be **external URLs** (not local files) pointing to the provider's official icon. Examples:
- GitHub raw URLs: `https://raw.githubusercontent.com/Radarr/Radarr/develop/Logo/128.png`
- Official CDN: `https://www.plex.tv/wp-content/uploads/2018/01/pmp-icon.png`
- Wikimedia: `https://upload.wikimedia.org/wikipedia/commons/...`

## API endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /setup/service-schemas` | Setup secret | Service schemas for the wizard |
| `GET /admin/service-schemas` | Admin | Service schemas for the admin panel |
| `POST /setup/test-service` | Setup secret | Test a service during setup |
| `POST /admin/services/:id/test` | Admin | Test an existing service |
| `POST /setup/service` | Setup secret | Create a service during setup |
| `POST /admin/services` | Admin | Create a new service |
| `PUT /admin/services/:id` | Admin | Update a service |
| `DELETE /admin/services/:id` | Admin | Delete a service |

## Database: Service table

Services are stored in the `Service` model with config as a JSON blob:

```prisma
model Service {
  id        Int     @id @default(autoincrement())
  name      String  // Display name (e.g. "Radarr 4K")
  type      String  // Provider ID (e.g. "radarr")
  config    String  // JSON: { url, apiKey, ... }
  isDefault Boolean @default(false)
  enabled   Boolean @default(true)
}
```

Multiple instances of the same provider type are supported (e.g. "Radarr HD" + "Radarr 4K").

## Complete example: Jellyfin provider with auth

```typescript
import axios from 'axios';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../services/notifications.js';
import type { Provider, AuthProvider, AuthHelpers } from '../types.js';

const jellyfinAuth: AuthProvider = {
  config: { id: 'jellyfin', label: 'Jellyfin', type: 'oauth' },

  async registerRoutes(app, helpers) {
    app.post('/jellyfin/login', async (request, reply) => {
      const { serverUrl, username, password } = request.body as {
        serverUrl: string; username: string; password: string;
      };

      // Authenticate with Jellyfin
      const { data } = await axios.post(
        `${serverUrl}/Users/AuthenticateByName`,
        { Username: username, Pw: password },
        { headers: { 'X-Emby-Authorization': 'MediaBrowser Client="Oscarr", Version="1.0"' } }
      );

      const result = await helpers.findOrCreateUser({
        provider: 'jellyfin',
        providerId: data.User.Id,
        providerToken: data.AccessToken,
        providerUsername: data.User.Name,
        email: `${data.User.Name}@jellyfin.local`,
        displayName: data.User.Name,
        avatar: `${serverUrl}/Users/${data.User.Id}/Images/Primary`,
      });

      return helpers.signAndSend(reply, result.id);
    });
  },

  async importUsers(adminUserId) {
    const service = await prisma.service.findFirst({
      where: { type: 'jellyfin', enabled: true },
    });
    if (!service) throw new Error('NO_TOKEN');
    const config = JSON.parse(service.config);

    const { data: users } = await axios.get(`${config.url}/Users`, {
      headers: { Authorization: `MediaBrowser Token="${config.apiKey}"` },
    });

    let imported = 0, skipped = 0;
    for (const user of users) {
      const existing = await prisma.userProvider.findUnique({
        where: { provider_providerId: { provider: 'jellyfin', providerId: user.Id } },
      });
      if (existing) { skipped++; continue; }

      await prisma.user.create({
        data: {
          email: `${user.Name}@jellyfin.local`,
          displayName: user.Name,
          role: 'user',
          providers: {
            create: { provider: 'jellyfin', providerId: user.Id, providerUsername: user.Name },
          },
        },
      });
      imported++;
    }

    logEvent('info', 'User', `Import Jellyfin: ${imported} imported, ${skipped} skipped`);
    return { imported, skipped, total: users.length };
  },
};

export const jellyfinProvider: Provider = {
  service: {
    id: 'jellyfin',
    label: 'Jellyfin',
    icon: 'https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg',
    category: 'media-server',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:8096' },
      { key: 'apiKey', labelKey: 'common.api_key', type: 'password' },
    ],
    async test(config) {
      const { data } = await axios.get(`${config.url}/System/Info`, {
        headers: { Authorization: `MediaBrowser Token="${config.apiKey}"` },
        timeout: 5000,
      });
      return { ok: true, version: data.Version };
    },
  },
  auth: jellyfinAuth,
};
```
