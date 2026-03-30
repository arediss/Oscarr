# Plugin Development Guide

Oscarr supports plugins for extending functionality without modifying the core. Plugins can add backend routes, scheduled jobs, admin UI tabs, navigation items, full pages, and feature flags.

## Getting started

### File structure

```
packages/plugins/
  my-plugin/
    manifest.json          # Plugin metadata and hooks
    src/
      index.ts             # Backend entry point
    dist/
      index.js             # Compiled entry point (referenced in manifest)
    frontend/              # Optional
      index.tsx             # Frontend page component
```

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": "v1",
  "description": "A short description of what this plugin does",
  "entry": "dist/index.js",
  "frontend": "frontend/index.tsx",
  "settings": [
    {
      "key": "webhookUrl",
      "label": "Webhook URL",
      "type": "string",
      "required": true
    },
    {
      "key": "enabled",
      "label": "Enable notifications",
      "type": "boolean",
      "default": true
    },
    {
      "key": "interval",
      "label": "Check interval (minutes)",
      "type": "number",
      "default": 30
    }
  ],
  "hooks": {
    "routes": true,
    "jobs": [
      {
        "key": "my_job",
        "label": "My scheduled job",
        "cron": "*/30 * * * *"
      }
    ],
    "ui": [
      {
        "hookPoint": "nav",
        "props": {
          "path": "/p/my-plugin",
          "label": "My Plugin",
          "icon": "Puzzle"
        },
        "order": 100
      },
      {
        "hookPoint": "admin.tabs",
        "props": {
          "label": "My Plugin",
          "icon": "Puzzle"
        },
        "order": 50
      }
    ],
    "features": {
      "myPluginEnabled": true
    }
  }
}
```

### Entry point

The entry file must export a `register` function:

```typescript
import type { PluginRegistration, PluginContext } from '../../../backend/src/plugins/types.js';

export function register(ctx: PluginContext): PluginRegistration {
  return {
    manifest: require('./manifest.json'),

    // Optional: register API routes
    async registerRoutes(app, ctx) {
      app.get('/hello', async () => {
        return { message: 'Hello from my plugin!' };
      });

      app.get('/users/:id', async (request) => {
        const { id } = request.params as { id: string };
        const user = await ctx.getUser(parseInt(id));
        return user;
      });
    },

    // Optional: register scheduled jobs
    registerJobs(ctx) {
      return {
        my_job: async () => {
          ctx.log.info('Running my scheduled job');
          const webhookUrl = await ctx.getSetting('webhookUrl');
          // Do work...
          return { processed: 42 };
        },
      };
    },

    // Optional: run once on first install
    async onInstall(ctx) {
      ctx.log.info('Plugin installed for the first time');
      await ctx.setSetting('installDate', new Date().toISOString());
    },
  };
}
```

## PluginContext API

The context object provides access to Oscarr's core functionality:

| Method | Description |
|--------|-------------|
| `ctx.log` | Fastify logger instance (child logger with plugin context) |
| `ctx.getUser(userId)` | Get a user by ID. Returns `{ id, email, displayName, role }` or `null` |
| `ctx.getAppSettings()` | Get all app settings as `Record<string, unknown>` |
| `ctx.getSetting(key)` | Get a plugin-specific setting value |
| `ctx.setSetting(key, value)` | Set a plugin-specific setting value |
| `ctx.sendNotification(type, data)` | Send a system notification (Discord, Telegram, Email) |
| `ctx.sendUserNotification(userId, payload)` | Send an in-app notification to a specific user |

### sendNotification

Sends a notification through configured channels (Discord webhook, Telegram, Email):

```typescript
await ctx.sendNotification('media_available', {
  title: 'Movie Title',
  mediaType: 'movie',
  posterPath: '/poster.jpg',
});
```

### sendUserNotification

Creates an in-app notification visible in the user's notification bell:

```typescript
await ctx.sendUserNotification(userId, {
  type: 'plugin:my-event',
  title: 'Something happened',
  message: 'Details about what happened',
  metadata: { key: 'value' },
});
```

## Backend routes

Routes registered by plugins are automatically prefixed with the plugin's route prefix (default: `/api/plugins/<pluginId>`).

All plugin routes require authentication by default (handled by the RBAC middleware). You can register custom permissions for your routes — see [Permissions & RBAC](#permissions--rbac).

```typescript
async registerRoutes(app, ctx) {
  // Available at: GET /api/plugins/my-plugin/stats
  // Requires authentication (default for all plugin routes)
  app.get('/stats', async (request) => {
    const user = request.user as { id: number; role: string };
    return { userId: user.id, role: user.role };
  });
}
```

## Scheduled jobs

Jobs are defined in `manifest.json` under `hooks.jobs` and implemented in `registerJobs()`:

```typescript
registerJobs(ctx) {
  return {
    // Key must match the job key in manifest.json
    my_job: async () => {
      ctx.log.info('Job started');
      // Do work...
      return { result: 'success' };  // Return value shown in admin
    },
  };
}
```

Jobs appear in the admin Jobs & Sync tab where admins can:
- See the schedule (cron expression)
- View last run status and duration
- Manually trigger the job
- Change the cron schedule

## UI contributions

### Hook points

There are two types of hook points:

**Simple hooks** — rendered by the host app using `renderItem` callback (e.g. nav links):

| Hook point | Description | Props | Mode |
|------------|-------------|-------|------|
| `nav` | Navigation bar item | `path`, `label`, `icon` | Simple |
| `admin.tabs` | Admin panel tab | `label`, `icon` | Simple |

**Component hooks** — your plugin provides a React component that receives contextual data:

| Hook point | Description | Context provided | Mode |
|------------|-------------|-----------------|------|
| `media.detail.actions` | Buttons on media detail page (after Request/Play) | `media`, `type`, `isAvailable`, `dbMedia` | Component |
| `media.detail.info` | Info sections on media detail page (after synopsis) | `media`, `type`, `dbMedia` | Component |
| `media.card.overlay` | Overlay on media card hover | `media`, `type`, `availability` | Component |
| `home.rows` | Additional rows on home page | — | Component |
| `header.actions` | Actions in the header bar (before notification bell) | `user` | Component |
| `avatar.menu` | Items in the avatar dropdown (before logout) | `user`, `isAdmin` | Component |

### Component hooks

For component hooks, your plugin must export a React component for each hook point:

```
plugins/my-plugin/frontend/
  index.tsx                            # Full page
  hooks/
    media.detail.actions.tsx            # Component for this hook
    header.actions.tsx                  # Component for this hook
```

Each hook component receives `{ contribution, context }`:

```tsx
// plugins/my-plugin/frontend/hooks/media.detail.actions.tsx
import type { HookComponentProps } from '../../../../frontend/src/plugins/types';

export default function MediaActions({ context }: HookComponentProps) {
  const media = context.media as { id: number; title?: string; name?: string };
  const isAvailable = context.isAvailable as boolean;

  if (!isAvailable) return null;

  return (
    <button
      onClick={() => window.open(`https://jellyfin.local/play/${media.id}`)}
      className="btn-primary flex items-center gap-2"
    >
      Play in Jellyfin
    </button>
  );
}
```

### Navigation item

```json
{
  "hookPoint": "nav",
  "props": {
    "path": "/p/my-plugin",
    "label": "My Plugin",
    "icon": "Puzzle"
  },
  "order": 100
}
```

Icons use [Lucide React](https://lucide.dev/icons/) icon names.

### Admin tab

Plugins with settings automatically get an admin tab. You can also add custom tabs:

```json
{
  "hookPoint": "admin.tabs",
  "props": {
    "label": "My Plugin",
    "icon": "Puzzle"
  }
}
```

## Frontend pages

Plugins can provide a full-page React component at `/p/:pluginId`:

```tsx
// packages/plugins/my-plugin/frontend/index.tsx
import { useState, useEffect } from 'react';

export default function MyPluginPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/plugins/my-plugin/stats')
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-ndp-text">My Plugin</h1>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
```

The frontend component is lazy-loaded by Oscarr's router. It has access to all Tailwind CSS classes and Oscarr's design system (e.g. `text-ndp-text`, `card`, `btn-primary`).

## Settings

### Defining settings

Settings are defined in `manifest.json` under `settings`:

```json
{
  "settings": [
    {
      "key": "apiUrl",
      "label": "API URL",
      "type": "string",
      "required": true
    },
    {
      "key": "pollInterval",
      "label": "Poll interval (seconds)",
      "type": "number",
      "default": 60
    },
    {
      "key": "debugMode",
      "label": "Enable debug mode",
      "type": "boolean",
      "default": false
    },
    {
      "key": "secretKey",
      "label": "Secret key",
      "type": "password",
      "required": true
    }
  ]
}
```

### Setting types

| Type | Input | Description |
|------|-------|-------------|
| `string` | Text input | Free-form text |
| `number` | Number input | Numeric value |
| `boolean` | Toggle switch | On/off |
| `password` | Password input | Hidden text (for API keys, tokens) |

### Reading/writing settings

```typescript
// In plugin code
const apiUrl = await ctx.getSetting('apiUrl') as string;
await ctx.setSetting('lastRun', new Date().toISOString());
```

Settings are stored as a JSON blob in the `PluginState` table and managed via:
- `GET /api/plugins/:id/settings` — get schema + current values
- `PUT /api/plugins/:id/settings` — update values

## Feature flags

Plugins can expose feature flags that are available globally (even before authentication):

```json
{
  "hooks": {
    "features": {
      "myPluginEnabled": true,
      "betaFeature": false
    }
  }
}
```

These are merged into the response of `GET /api/app/features` and accessible in the frontend via `useFeatures()`:

```tsx
const { features } = useFeatures();
if (features.myPluginEnabled) {
  // Show plugin UI
}
```

## Plugin lifecycle

1. **Discovery**: On startup, Oscarr scans `packages/plugins/` for directories with a `manifest.json`
2. **Validation**: Manifest must have `id`, `name`, `version`, `entry`, and `apiVersion: "v1"`
3. **Loading**: Entry module is dynamically imported, `register(ctx)` is called
4. **Install**: On first load, `onInstall(ctx)` is called (if defined)
5. **Route registration**: Plugin routes are registered with Fastify
6. **Job registration**: Plugin jobs are registered with the scheduler
7. **Runtime**: Plugin is active — routes serve requests, jobs run on schedule

### Enable/disable

Plugins can be enabled or disabled from the admin panel without restarting:
- `PUT /api/plugins/:id/toggle` with `{ enabled: boolean }`
- Disabled plugins' routes still exist but their jobs don't run

### Plugin state persistence

Plugin state (enabled flag + settings) is stored in the `PluginState` table:

```prisma
model PluginState {
  id        Int     @id @default(autoincrement())
  pluginId  String  @unique
  enabled   Boolean @default(true)
  settings  String  @default("{}")  // JSON blob
}
```

## API reference

### PluginManifest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique plugin ID |
| `name` | string | Yes | Display name |
| `version` | string | Yes | Semantic version |
| `apiVersion` | string | Yes | Must be `"v1"` |
| `description` | string | No | Short description |
| `entry` | string | Yes | Path to compiled entry point |
| `frontend` | string | No | Path to frontend component |
| `settings` | PluginSettingDef[] | No | Settings schema |
| `hooks.routes` | boolean | No | Whether plugin registers routes |
| `hooks.jobs` | PluginJobDef[] | No | Scheduled job definitions |
| `hooks.ui` | UIContribution[] | No | UI hook contributions |
| `hooks.features` | Record<string, boolean> | No | Feature flags |

### PluginRegistration

| Method | Required | Description |
|--------|----------|-------------|
| `manifest` | Yes | The plugin manifest |
| `registerRoutes(app, ctx)` | No | Register Fastify routes |
| `registerJobs(ctx)` | No | Return job handlers |
| `registerGuards(ctx)` | No | Return guard handlers (see [Guards](#guards)) |
| `onInstall(ctx)` | No | Run once on first install |

## Guards

Guards let plugins intercept actions before they happen (e.g. block a request based on a subscription check). Guards run **before** the action is processed and can block it with a custom error message.

### Registering guards

```typescript
export function register(ctx: PluginContext): PluginRegistration {
  return {
    manifest: require('./manifest.json'),

    registerGuards(ctx) {
      return {
        // Runs before a media request is created
        'request.create': async (userId: number) => {
          const sub = await ctx.getSetting('subscriptions');
          const userSub = JSON.parse(sub || '{}')[userId];
          if (!userSub || new Date(userSub.expiresAt) < new Date()) {
            return { blocked: true, error: 'Active subscription required', statusCode: 403 };
          }
          return null; // Allow the action
        },
      };
    },
  };
}
```

### Available guard points

| Guard name | When it runs | Bypassed by |
|------------|-------------|-------------|
| `request.create` | Before creating a media request | Admin role |
| `request.create` | Before triggering a missing episode search | Admin role |

Guards return `null` to allow the action, or `{ blocked: true, error: string, statusCode?: number }` to block it.

## Permissions & RBAC

Oscarr uses a centralized RBAC (Role-Based Access Control) middleware. Roles and their permissions are stored in the database and managed from the admin panel (Roles tab). Plugins can extend this system.

### Registering custom permissions

Declare new permissions so admins can assign them to roles:

```typescript
import { registerPluginPermission, registerRoutePermission } from '../../../backend/src/middleware/rbac.js';

export function register(ctx: PluginContext): PluginRegistration {
  // 1. Declare the permission (appears in admin role editor)
  registerPluginPermission('myplugin.access', 'Access My Plugin features');
  registerPluginPermission('myplugin.admin', 'Manage My Plugin settings');

  // 2. Protect your routes with these permissions
  registerRoutePermission('GET:/api/plugins/my-plugin/data', { permission: 'myplugin.access' });
  registerRoutePermission('PUT:/api/plugins/my-plugin/config', { permission: 'myplugin.admin' });

  return {
    manifest: require('./manifest.json'),
    // ...
  };
}
```

### How it works

1. **Plugin registers permissions** via `registerPluginPermission(key, description)` — these appear in the admin Roles tab with a "plugin" badge
2. **Plugin protects routes** via `registerRoutePermission(routeKey, rule)` — the RBAC middleware enforces the permission
3. **Admin assigns permissions** to roles from the admin panel — users with matching roles get access

### Route rule format

The `registerRoutePermission` key is `METHOD:/full/path` matching Fastify's parameterized URL:

```typescript
// Exact route
registerRoutePermission('GET:/api/plugins/my-plugin/stats', {
  permission: 'myplugin.access',
});

// Owner-scoped route (non-admin users only see their own data)
registerRoutePermission('GET:/api/plugins/my-plugin/history', {
  permission: 'myplugin.access',
  ownerScoped: true,
});
```

When `ownerScoped: true`, the RBAC middleware sets `request.ownerScoped = true` for non-privileged users. Your route handler should use this flag to filter data:

```typescript
app.get('/history', async (request) => {
  const user = request.user as { id: number };
  const where = request.ownerScoped ? { userId: user.id } : {};
  return db.history.findMany({ where });
});
```

### Built-in permissions

| Permission | Description |
|------------|-------------|
| `*` | Full access (admin wildcard) |
| `admin.*` | All admin panel operations |
| `admin.plugins` | Manage plugins |
| `admin.roles` | Manage roles and permissions |
| `requests.read` | View media requests |
| `requests.create` | Create media requests |
| `requests.delete` | Delete own media requests |
| `requests.approve` | Approve pending requests |
| `requests.decline` | Decline pending requests |
| `support.read` | View support tickets |
| `support.create` | Create support tickets |
| `support.write` | Reply to support tickets |
| `support.manage` | Close/reopen tickets |

### Default roles

| Role | Permissions | Notes |
|------|-------------|-------|
| `admin` | `*` (all) | System role, cannot be deleted |
| `user` | `requests.read/create/delete`, `support.read/create/write` | System role, default for new users |

Admins can create custom roles (e.g. "moderator") with any combination of permissions from the Roles tab.

## Current limitations

- Plugins cannot modify the database schema (no Prisma migrations)
- Plugin frontend components are lazy-loaded and cannot import from the main app bundle
- No plugin dependency system
- No hot-reload — server restart required after adding/removing plugins
