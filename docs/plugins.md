# Plugin Development Guide

Oscarr supports plugins for extending functionality without modifying the core. Plugins can add backend routes, scheduled jobs, admin UI tabs, navigation items, full pages, feature flags, guards, custom permissions, and event-driven workflows.

## What's new in the plugin engine (v0.6.3+)

Plugins now declare their capabilities explicitly for security + predictability. Three new manifest fields:

- **`engines.oscarr`** — semver range your plugin supports, e.g. `">=0.6.0 <1.0.0"`. Required. Plugins outside the range are refused at load time with a clear error.
- **`engines.testedAgainst`** — list of Oscarr versions you've explicitly tested. Plugins get a green "Verified" badge when running on one of these; otherwise an amber "Untested" badge.
- **`services`** — whitelist of service types (radarr / sonarr / plex / tautulli / …) whose config your plugin may read. Anything not listed returns `null` from `ctx.getServiceConfig*()`.
- **`capabilities`** — whitelist of ctx method buckets your plugin calls. Any method outside the declared set throws at call time with a pointer at the missing entry. See the [Capabilities reference](#capabilities) section.
- **`capabilityReasons`** — optional human-readable justification per capability, surfaced to admins when they enable the plugin.

Install flow is also simpler — plugins ship a pre-built `dist/` in their GitHub release, and the admin UI's "Install" button downloads the tarball, hot-loads the plugin, and mounts its routes without a container restart.

See the [Migration guide](#migration-guide) at the bottom if you're updating a plugin from a pre-v0.6.3 Oscarr.

## Quickstart

Scaffold a plugin that boots, registers one route, and appears in the admin UI — about 5 minutes from an empty directory.

### 1. Create the plugin directory

Anywhere outside of Oscarr's source tree (so you can version it separately and later publish to its own GitHub repo):

```bash
mkdir -p ~/my-plugins/hello-oscarr/src
cd ~/my-plugins/hello-oscarr
```

### 2. `package.json`

```json
{
  "name": "oscarr-plugin-hello-oscarr",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "node build.js",
    "dev": "node build.js --watch"
  },
  "devDependencies": {
    "esbuild": "^0.28.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

Repo name convention: `oscarr-plugin-<id>` if you plan to publish — the registry picks up repos that match this pattern.

### 3. `build.js`

Oscarr loads your plugin as a single ESM bundle, so we build with esbuild. This file supports both one-shot (`npm run build`) and watch mode (`npm run dev`):

```javascript
import { build, context } from 'esbuild';
import { builtinModules } from 'module';

const config = {
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node20',
  format: 'esm',
  bundle: true,
  sourcemap: true,
  external: [...builtinModules, ...builtinModules.map(m => `node:${m}`), 'fastify'],
  banner: { js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);` },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('Watching src/ …');
} else {
  await build(config);
  console.log('Built → dist/index.js');
}
```

### 4. `manifest.json`

```json
{
  "id": "hello-oscarr",
  "name": "Hello Oscarr",
  "version": "0.1.0",
  "apiVersion": "v1",
  "entry": "dist/index.js",
  "description": "A minimal example plugin.",
  "author": "Your name",
  "engines": {
    "oscarr": ">=0.6.0 <1.0.0",
    "testedAgainst": ["0.6.3"]
  },
  "capabilities": [],
  "hooks": {
    "routes": { "prefix": "/api/plugins/hello-oscarr" }
  }
}
```

No `capabilities` and no `services` means the plugin only gets `ctx.log`. Add buckets as you use gated methods (see [Capabilities](#capabilities)).

### 5. `src/index.ts`

```typescript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { FastifyInstance } from 'fastify';

interface PluginContext {
  log: { info: (...args: unknown[]) => void };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'manifest.json'), 'utf-8'));

export function register(ctx: PluginContext) {
  return {
    manifest,
    async registerRoutes(app: FastifyInstance) {
      app.get('/hello', async () => ({ message: 'Hello from Oscarr!' }));
      ctx.log.info('hello-oscarr routes registered');
    },
  };
}
```

### 6. Build + install

```bash
npm install
npm run build
```

Now symlink the plugin into your local Oscarr (see [Dev loop](#dev-loop) for why a symlink is better than copying):

```bash
ln -s ~/my-plugins/hello-oscarr ~/Oscarr/app/packages/plugins/hello-oscarr
```

Restart Oscarr once to discover it (hot-install from the UI only applies when pulling from the Discover tab). The plugin shows up in **Admin → Plugins → Installed** — toggle it on and hit `GET /api/plugins/hello-oscarr/hello` to verify.

## Releasing a plugin

When an admin clicks **Install** in the Discover tab, Oscarr resolves the install URL in this order:

1. **Arch-specific Release asset** — the latest release's `.tar.gz` whose name carries an arch token matching the running container (`arm64`/`aarch64` on ARM hosts, `amd64`/`x64`/`x86_64` on x86_64 hosts). Use this when your plugin ships native modules and you need separate bundles per architecture.
2. **Universal Release asset** — the latest release's `.tar.gz` with **no** arch token in its name. **The recommended path for ~95% of plugins**: a single self-contained bundle that runs anywhere.
3. **Source archive** (`tarball/HEAD`) — fallback for plugins that commit `dist/` to their repo. Works but pollutes git history with build artifacts; not recommended for new plugins.

`.sha256` companion files (`<name>.tar.gz.sha256`) are recognised and skipped by the resolver — keep them around, Oscarr may consume them for asset integrity in a later release.

### Asset contents

The tarball you upload to the Release **must** include, at the archive root (no enclosing folder):

- `manifest.json`
- `package.json`
- `dist/` containing the built file referenced by `manifest.entry`
- Any other runtime asset your plugin needs (e.g. `frontend/`, static files)

> Oscarr's prod image strips `npm`, `yarn` and `corepack` for security and size — `npm install` does **not** run after extraction. Anything `dist/index.js` imports at runtime must already be inside the asset.

### The bundling decision

Most plugins should bundle every runtime dep into `dist/index.js` via esbuild's `bundle: true` with no `external` overrides (besides `@oscarr/shared`, which Oscarr's runtime injects). One bundle, one universal asset, install just works.

**The exception**: deps that ship native `.node` binaries or use dynamic `require()` patterns esbuild can't statically analyse. Common offenders:

- `discord.js` — opt-in `zlib-sync` (faster gzip) and `@discordjs/opus` (voice) are native. The pure-JS code paths work without them; if you don't use voice, simply don't install those optionals and bundle `discord.js` normally.
- `bcrypt` / `bcryptjs` — `bcrypt` is native; `bcryptjs` is a drop-in pure-JS replacement.
- `better-sqlite3`, `argon2`, `node-canvas`, `sharp` — all native. No pure-JS swap, you'll need per-arch assets.
- `prisma` — already installed in Oscarr's runtime; mark external.

**To find the native deps in your plugin** quickly:

```bash
npm ls --all 2>/dev/null | grep -iE 'native|prebuilt|\.node$'
# or, more thorough:
find node_modules -name '*.node' -not -path '*/.*' | head -20
find node_modules -name 'binding.gyp' | head -20
```

If both commands return nothing, you're safe to ship a single universal asset.

### Recommended workflow — universal bundle

Drop this `.github/workflows/release.yml` in your plugin repo. It runs on every `v*` tag push, builds your plugin, packs a single universal tarball, and uploads it on the corresponding GitHub Release:

```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Pack artifact
        run: |
          ID=$(jq -r .id manifest.json)
          VER="${GITHUB_REF_NAME#v}"
          tar -czf "${ID}-${VER}.tar.gz" manifest.json package.json dist frontend
          sha256sum "${ID}-${VER}.tar.gz" > "${ID}-${VER}.tar.gz.sha256"
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            *.tar.gz
            *.sha256
```

### Per-arch matrix — when you need native deps

If your plugin genuinely needs a native dep that has no pure-JS alternative, build a separate asset per arch. Oscarr's resolver picks the right one based on `process.arch` of the running container. Asset names must contain an arch token (`amd64`, `x64`, `x86_64`, `arm64`, or `aarch64`):

```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  build:
    strategy:
      matrix:
        include:
          - runner: ubuntu-latest          # x86_64 host
            arch: amd64
          - runner: ubuntu-24.04-arm       # GitHub-hosted ARM (or self-hosted)
            arch: arm64
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci --omit=dev   # prebuilds native binaries for THIS arch
      - run: npm ci              # full deps including dev for the build
      - run: npm run build
      - name: Pack artifact
        run: |
          ID=$(jq -r .id manifest.json)
          VER="${GITHUB_REF_NAME#v}"
          # Re-run --omit=dev into a fresh node_modules so the asset only ships runtime deps
          rm -rf node_modules && npm ci --omit=dev
          tar -czf "${ID}-${VER}-linux-${{ matrix.arch }}.tar.gz" \
            manifest.json package.json dist frontend node_modules
          sha256sum "${ID}-${VER}-linux-${{ matrix.arch }}.tar.gz" \
            > "${ID}-${VER}-linux-${{ matrix.arch }}.tar.gz.sha256"
      - uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.arch }}
          path: |
            *.tar.gz
            *.sha256

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { path: dist, merge-multiple: true }
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/*.tar.gz
            dist/*.sha256
```

The asset name pattern is what the resolver matches against. As long as you keep `linux-amd64` / `linux-arm64` (or any `amd64`/`arm64` token separated by `-`/`_`/`.`), Oscarr picks the right one.

### Cutting a release

```bash
git tag v0.1.2 && git push origin v0.1.2
```

The workflow runs, GitHub Release gets the asset(s), and Oscarr admins immediately see "update available" in their Plugins tab.

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

### Plugin discovery

On startup, Oscarr scans `packages/plugins/` for directories with a `manifest.json`. You can override the scan directory with the `OSCARR_PLUGINS_DIR` environment variable.

- Follows symlinks (useful for dev workflows: `ln -s /path/to/plugin packages/plugins/name`)
- Skips hidden directories (starting with `.`)
- Validates manifests thoroughly: required fields, hooks shape, settings shape
- Validates `apiVersion` against supported versions (currently only `"v1"`)

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": "v1",
  "description": "A short description of what this plugin does",
  "author": "Your Name",
  "entry": "dist/index.js",
  "frontend": "frontend/index.tsx",
  "engines": {
    "oscarr": ">=0.6.0 <1.0.0",
    "testedAgainst": ["0.6.3"]
  },
  "services": ["radarr"],
  "capabilities": ["settings:plugin", "permissions"],
  "capabilityReasons": {
    "settings:plugin": "Stores configuration per plugin.",
    "permissions": "Registers admin-only permissions for the plugin's routes."
  },
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
    "routes": { "prefix": "/api/plugins/my-plugin" },
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

> **Note:** `hooks.routes` is now an object `{ "prefix": "/api/plugins/my-plugin" }`, not just `true`. This gives plugins explicit control over their route prefix.

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

    // Optional: run when plugin is enabled
    async onEnable(ctx) {
      ctx.log.info('Plugin enabled');
    },

    // Optional: run when plugin is disabled
    async onDisable(ctx) {
      ctx.log.info('Plugin disabled — cleaning up');
    },
  };
}
```

## PluginContext API

The context object provides access to Oscarr's core functionality:

| Method | Description | Capability |
|--------|-------------|-----------|
| `ctx.log` | Fastify logger instance (child logger with plugin context) | _always_ |
| `ctx.getUser(userId)` | Get a user by ID. Returns `{ id, email, displayName, role, avatar }` or `null` | `users:read` |
| `ctx.findUserByEmail(email)` | Find a user by email (symmetric with `findUserByProvider`) | `users:read` |
| `ctx.findUserByProvider(provider, providerId)` | Find a user linked to an external provider identity | `users:read` |
| `ctx.getUserProviders(userId)` | List a user's linked external providers (identity only, no tokens) | `users:read` |
| `ctx.setUserRole(userId, roleName)` / `setUserDisabled(userId, disabled)` / `issueAuthToken(userId)` | User-management mutations | `users:write` |
| `ctx.getAppSettings()` | Get all app settings as `Record<string, unknown>` | `settings:app` |
| `ctx.listFolderRules({ enabled? })` | Read-only enumeration of admin routing rules | `settings:app` |
| `ctx.getSetting(key)` / `setSetting(key, value)` / `getPluginDataDir()` | Plugin-scoped settings + data dir | `settings:plugin` |
| `ctx.sendNotification(type, data)` | Send a system notification (Discord, Telegram, Email) | `notifications` |
| `ctx.sendUserNotification(userId, payload)` | Send an in-app notification to a specific user | `notifications` |
| `ctx.notificationRegistry` | Access to the notification registry | `notifications` |
| `ctx.getArrClient(serviceType)` | Get the default Arr client (Sonarr, Radarr, …) | _`services[]` ACL_ |
| `ctx.getArrClients(serviceType)` | **Pluriel** — every enabled instance of a service type | _`services[]` ACL_ |
| `ctx.getServiceConfig(serviceType)` / `getServiceConfigRaw(serviceType)` | Service config for direct API access | _`services[]` ACL_ |
| `ctx.tmdb.search(query, { page?, lang? })` | TMDB multi-search (cached) | `tmdb:read` |
| `ctx.tmdb.movie(tmdbId, { lang? })` / `tv(tmdbId, { lang? })` | TMDB movie/TV details (cached, `lang` falls back to instance) | `tmdb:read` |
| `ctx.media.batchStatus(items, userId?)` | Bulk Oscarr status for N TMDB ids, with user's per-item request state | `requests:read` |
| `ctx.media.getById(mediaId)` | Single-media lookup, trimmed `PluginMedia` projection | `requests:read` |
| `ctx.requests.listForUser(userId, { limit?, status? })` | Owner-scoped request listing, default 50 / max 200 | `requests:read` |
| `ctx.requests.create(input)` | Full create-request pipeline on behalf of a user | `requests:write` |
| `ctx.app.internalFetch(path, { method?, headers?, body?, asUserId? })` | Escape hatch — call any Oscarr HTTP route; pass `asUserId` to authenticate | _always_ |
| `ctx.registerRoutePermission(routeKey, rule)` | Register an RBAC rule for a route | `permissions` |
| `ctx.registerPluginPermission(permission, description?)` | Declare a custom permission | `permissions` |
| `ctx.events` | Event bus — see [Events](#events) | `events` |

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

### getServiceConfig

Get the URL and API key for a connected service, useful for direct API calls:

```typescript
const radarr = await ctx.getServiceConfig('radarr');
if (radarr) {
  const res = await fetch(`${radarr.url}/api/v3/movie?apikey=${radarr.apiKey}`);
  const movies = await res.json();
}
```

### registerRoutePermission / registerPluginPermission

Register RBAC rules directly from the plugin context (see [Permissions & RBAC](#permissions--rbac) for full details):

```typescript
export function register(ctx: PluginContext): PluginRegistration {
  ctx.registerPluginPermission('myplugin.access', 'Access My Plugin features');
  ctx.registerRoutePermission('GET:/api/plugins/my-plugin/data', { permission: 'myplugin.access' });

  return {
    manifest: require('./manifest.json'),
    // ...
  };
}
```

## Events

The context object provides an in-process event bus for decoupled communication between plugins and the core:

```typescript
// Subscribe to events
ctx.events.on('media.requested', async (data) => {
  ctx.log.info(`New request: ${data.title}`);
  await ctx.sendNotification('custom_request', data);
});

// Unsubscribe
ctx.events.off('media.requested', handler);

// Emit custom events
ctx.events.emit('myplugin.sync_complete', { count: 42 });
```

> **Note:** The event bus is in-process only. Events are not persisted and will not survive a server restart.

### Core-emitted events

The host fires two events plugins can subscribe to without polling the DB. Payloads are versioned with a `v` field so future shape changes coexist with existing subscribers.

| Event | Payload type (`@oscarr/shared`) | Fires when |
|-------|---------------------------------|-----------|
| `user.notification.created` | `PluginUserNotificationCreatedV1` | Every time `safeUserNotify` persists an in-app notification — auth events, request lifecycle, media availability, plugin-owned events. Replaces cron-polling `UserNotification`. |
| `media.available` | `PluginMediaAvailableV1` | A piece of media moved to `available` and at least one user had an active request for it. Broadcast-style: includes every requester's userId so a plugin can post once to a channel instead of N times. |

Example — react to "your request was approved" with a Discord DM:

```typescript
import type { PluginUserNotificationCreatedV1 } from '@oscarr/shared';

async registerRoutes(app, ctx) {
  ctx.events.on('user.notification.created', async (raw) => {
    const ev = raw as PluginUserNotificationCreatedV1;
    if (ev.v !== 1) return; // Future-proofing: ignore unknown versions
    if (ev.type !== 'request_approved') return;

    const user = await ctx.getUser(ev.userId);
    if (!user) return;

    // Find the Discord link for this Oscarr user
    const links = await ctx.getUserProviders(ev.userId);
    const discordId = links.find(l => l.provider === 'discord')?.providerId;
    if (!discordId) return;

    await myDiscordClient.sendDM(discordId, `✅ ${ev.title} was approved — it's on the way.`);
  });
}
```

## Backend routes

Routes registered by plugins are automatically prefixed with the route prefix defined in `hooks.routes.prefix` (e.g. `/api/plugins/my-plugin`).

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

### Error handling for routes

If route registration fails (e.g. a syntax error or invalid schema), the plugin is automatically disabled and the error is persisted to the database. This prevents a broken plugin from taking down the server.

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

### Job lifecycle

- Jobs **stop automatically** when a plugin is disabled
- Jobs **resume** when the plugin is re-enabled
- A runtime guard prevents disabled-plugin jobs from executing even on race conditions

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
| `account.section` | A user-account modal section (sidebar entry + content pane) | `user`, `hasPermission`, `close` | Component |
| `admin.dashboard.widget` | Draggable widget on admin Dashboard tab | `widgetId` | Component |

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

### Error boundary

Plugin frontend components are wrapped in an error boundary. If a plugin component crashes, the rest of the app continues to work. The error boundary shows the plugin name, the error message, and a "Try again" button.

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

Icon names refer to [Lucide React](https://lucide.dev/icons/), but **only icons explicitly added
to Oscarr's curated allowlist** render — anything else falls back to a `Puzzle` placeholder (and
emits a console warning in dev). The allowlist is curated for bundle-size reasons (tree-shaking).

### Available icons

The current allowlist (defined in [`packages/frontend/src/plugins/DynamicIcon.tsx`](../packages/frontend/src/plugins/DynamicIcon.tsx)):

`Activity` · `AlertCircle` · `AlertTriangle` · `Award` · `BarChart3` · `Bell` · `Bookmark` ·
`BookOpen` · `Bot` · `Calendar` · `Check` · `CheckCircle` · `ChevronDown` · `ChevronUp` ·
`Clock` · `Cloud` · `Code` · `Coins` · `Copy` · `Cpu` · `CreditCard` · `Crown` · `Database` ·
`Download` · `ExternalLink` · `Eye` · `EyeOff` · `File` · `FileText` · `Film` · `Filter` ·
`Flag` · `Folder` · `Gauge` · `Gift` · `Globe` · `Grid3x3` · `HardDrive` · `Heart` · `Home` ·
`Image` · `Info` · `Key` · `Layers` · `LayoutDashboard` · `List` · `Loader2` · `Lock` · `Mail` ·
`MessageSquare` · `Music` · `Package` · `Palette` · `PieChart` · `Play` · `Plug` · `Power` ·
`Puzzle` · `RefreshCw` · `Rocket` · `ScrollText` · `Search` · `Send` · `Server` · `Settings` ·
`Shield` · `Sparkles` · `Star` · `Tag` · `Terminal` · `Timer` · `Trash2` · `TrendingUp` ·
`Trophy` · `Tv` · `Upload` · `User` · `UserCheck` · `Users` · `Video` · `Wrench` · `Zap`

Need an icon that isn't listed? Open a PR adding the import + map entry in `DynamicIcon.tsx` and
appending it to this list. Keep additions minimal — every icon ships in the core bundle.

### Admin tab

Plugins with settings automatically get an admin tab. Plugins with a `frontend` entry render their custom component in the admin tab instead of the default settings form. You can also add custom tabs:

```json
{
  "hookPoint": "admin.tabs",
  "props": {
    "label": "My Plugin",
    "icon": "Puzzle"
  }
}
```

### `admin.dashboard.widget`

Contributes a draggable widget to the admin Dashboard tab. The plugin's frontend bundle exposes a React component that renders inside the widget body; the core wraps it in a chrome (title bar + drag handle + remove button) and provides a per-widget error boundary.

**Manifest:**

```json
{
  "hooks": {
    "ui": [{
      "hookPoint": "admin.dashboard.widget",
      "props": {
        "id": "weekly-stats",
        "title": "Tautulli — this week",
        "icon": "BarChart",
        "defaultSize": { "w": 4, "h": 3 },
        "minSize": { "w": 2, "h": 2 }
      }
    }]
  }
}
```

**`props` schema (validated at plugin load):**

| Field | Type | Required | Description |
|---|---|:-:|---|
| `id` | string (`a-z0-9-`) | yes | Unique within the plugin. Forms the layout id `plugin:<pluginId>:<id>` |
| `title` | string | yes | Shown in the widget chrome title bar |
| `icon` | string | no | Lucide icon name (defaults to no icon) |
| `defaultSize` | `{ w, h }` | yes | Initial grid size. `w` is in 12 columns, `h` is in row units |
| `minSize` | `{ w, h }` | no | Minimum size when the admin resizes |
| `maxSize` | `{ w, h }` | no | Maximum size when the admin resizes |

**Frontend code:** the plugin's `frontend/index.tsx` must expose a default-exported React component that matches this hook point. The component receives no special props beyond what `PluginHookComponent` already provides; data fetching is the widget's own responsibility.

A malformed manifest (e.g. uppercase `id`, missing `defaultSize`) is rejected at plugin load time — the plugin is marked `error` and never reaches the dashboard.

## Frontend SDK (`@oscarr/sdk`)

Plugins can import helpers from the SDK instead of reaching into the main app bundle:

```javascript
import { api, apiPost, apiPut, apiDelete, formatSize, formatDate, formatRelative, storageGet, storageSet } from '@oscarr/sdk';
```

### API helpers

| Function | Description |
|----------|-------------|
| `api(path)` | GET request with auth, returns JSON |
| `apiPost(path, body)` | POST with auth + JSON body |
| `apiPut(path, body)` | PUT with auth + JSON body |
| `apiDelete(path)` | DELETE with auth |

### Formatting helpers

| Function | Description |
|----------|-------------|
| `formatSize(bytes)` | Format bytes to human-readable string (e.g. `"1.5 GB"`) |
| `formatDate(dateStr)` | Format date string to localized date |
| `formatRelative(dateStr)` | Format date string to relative time (e.g. `"2h ago"`) |

### Namespaced storage

| Function | Description |
|----------|-------------|
| `storageGet(pluginId, key, fallback)` | Read from namespaced localStorage |
| `storageSet(pluginId, key, value)` | Write to namespaced localStorage |

### Shared React

React is shared via import map. Plugins import `react`, `react-dom`, and `react/jsx-runtime` normally — the host provides them at runtime. No need to bundle React in your plugin.

## Frontend pages

Plugins can provide a full-page React component at `/p/:pluginId`:

```tsx
// packages/plugins/my-plugin/frontend/index.tsx
import { useState, useEffect } from 'react';
import { api } from '@oscarr/sdk';

export default function MyPluginPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/api/plugins/my-plugin/stats').then(setData);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-ndp-text">My Plugin</h1>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
```

The frontend component is lazy-loaded via ESM by Oscarr's router. See [Styling](#styling) for how to use Tailwind classes and Oscarr's design tokens in your plugin.

## Styling

Plugins can style their UI with the same Tailwind + design tokens as the core. Two things to know:

**Component classes (`card`, `btn-primary`, `btn-secondary`, `input`, …) come free.** They're defined in the core CSS bundle that Oscarr loads on every page, so just writing `<div className="card">` in your plugin works out of the box.

**Tailwind utility classes (`bg-sky-500`, `border-l-amber-400`, `p-4`, `flex`…) need the plugin to ship its own CSS bundle.** Tailwind's JIT purges classes the core doesn't use itself, so a plugin that wants colors or spacings not present in core would otherwise render unstyled. To fix this, plugins compile a small CSS bundle alongside their JS, which Oscarr's loader injects when the plugin mounts.

### One-time setup (per plugin)

Run the scaffolder from the Oscarr repo:

```bash
npm run plugin:add-tailwind -- ~/Oscarr/plugins/my-plugin
```

The script is idempotent — safe to re-run. It drops in:

- `tailwind.preset.js` — Oscarr's design tokens (`ndp-*` colors, animations, keyframes), copied inline so your plugin stays self-contained. **Oscarr-owned**: re-running the scaffolder re-syncs it. If you want to extend the tokens (extra colors, brand fonts), use `theme.extend` in your plugin's `tailwind.config.js` rather than editing the preset in-place.
- `tailwind.config.js` — wires the preset, scans `frontend/**/*.{ts,tsx}`, and disables preflight (core's reset already applies).
- `frontend/index.css` — entry file that just emits `@tailwind utilities;`. Base + components are served by the core bundle already loaded in the page.
- `package.json` — pins `tailwindcss` to the same version the core uses.
- `build.js` — patched to run `npx tailwindcss` after esbuild, emitting `dist/frontend/index.css`.

After the script runs:

```bash
cd ~/Oscarr/plugins/my-plugin
npm install
npm run build     # emits dist/frontend/{index.js,index.css}
```

The plugin loader injects `<link rel="stylesheet" href="/api/plugins/<id>/frontend/index.css">` the first time any component from the plugin mounts, and removes it when the plugin is disabled or uninstalled. No explicit import needed on your side.

### How the plugin's CSS bundle is scoped

When the plugin loader injects your `dist/frontend/index.css`, it **rewrites every selector** to be scoped to a `data-oscarr-plugin="<your-id>"` attribute. So `.bg-black` in your bundle becomes `[data-oscarr-plugin="<id>"] .bg-black` at the document level. The loader auto-applies that attribute on the wrapper around any of your plugin's components, so as long as your component tree is rendered inside Oscarr's normal DOM flow, you don't have to think about it — Tailwind utilities just work.

**Heads-up — `createPortal` to `document.body`:** if your plugin renders a modal, overlay, drawer, popover or anything else through `react-dom`'s `createPortal(..., document.body)`, the portaled subtree **escapes the auto-applied scope wrapper** and your Tailwind utilities silently stop matching. Re-apply the attribute on your portaled root:

```tsx
import { createPortal } from 'react-dom';

createPortal(
  <div data-oscarr-plugin="my-plugin-id" className="fixed inset-0 bg-black/80 …">
    …
  </div>,
  document.body,
);
```

### Scoping runtime-injected custom CSS

If your plugin injects raw CSS at runtime (e.g. `.plugin-communication`'s markdown typography), prefix selectors with `.oscarr-<plugin-id>-*` to avoid colliding with core or other plugins. The bundle-CSS scope rewriter only operates on `dist/frontend/index.css` — anything you `document.head.appendChild(<style>)` at runtime is up to you.

### Tailwind version alignment

The scaffolder pins `tailwindcss` to the core's exact version. Major version drift (e.g. core v3 → v4) changes syntax for some utilities (opacity, arbitrary values) and will eventually require running the scaffolder again to re-pin. Keep your plugin's `tailwindcss` in lockstep with the Oscarr you're targeting.

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

Settings are validated on save: required fields are checked and types are enforced (string, number, boolean, password). Settings are cached in memory and the cache is invalidated on update or plugin toggle.

Settings are stored as a JSON blob in the `PluginState` table and managed via:
- `GET /api/plugins/:id/settings` — get schema + current values
- `PUT /api/plugins/:id/settings` — update values (validated)

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

1. **Discovery**: On startup, Oscarr scans the plugins directory for directories with a `manifest.json`
2. **Validation**: Manifest must have `id`, `name`, `version`, `entry`, and `apiVersion: "v1"`
3. **Loading**: Entry module is dynamically imported, `register(ctx)` is called
4. **Install**: On first load, `onInstall(ctx)` is called if defined (tracked by DB flag `onInstallRan`, never re-fires)
5. **Enable**: `onEnable(ctx)` is called if defined (best-effort, does not block the toggle)
6. **Route registration**: Plugin routes are registered with Fastify
7. **Job registration**: Plugin jobs are registered with the scheduler
8. **Runtime**: Plugin is active — routes serve requests, jobs run on schedule

### Enable/disable

Plugins can be enabled or disabled from the admin panel without restarting:
- `PUT /api/plugins/:id/toggle` with `{ enabled: boolean }`
- Disabling drops the plugin's router from the dispatcher (requests 404 instantly), pauses its jobs, and clears its RBAC overrides. Re-enabling rebuilds everything from the plugin's `registerRoutes`.
- `onEnable(ctx)` is called when a plugin is enabled, `onDisable(ctx)` when disabled (both best-effort)

### Plugin state persistence

Plugin state (enabled flag + settings) is stored in the `PluginState` table:

```prisma
model PluginState {
  id            Int       @id @default(autoincrement())
  pluginId      String    @unique
  enabled       Boolean   @default(true)
  settings      String    @default("{}")  // JSON blob for plugin-specific settings
  onInstallRan  Boolean   @default(false) // Tracks whether onInstall() has been executed
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

## Plugin logs

All plugin log output (`info`, `warn`, `error`) is captured to the `PluginLog` database table. Logs can be retrieved via the API:

```
GET /api/plugins/:id/logs?limit=100
```

The `limit` parameter accepts values up to 500 (default: 100).

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
| `hooks.routes` | `{ prefix: string }` | No | Route prefix object |
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
| `registerNotificationProviders(registry)` | No | Register notification providers |
| `onInstall(ctx)` | No | Run once on first install (tracked by DB flag, never re-fires) |
| `onEnable(ctx)` | No | Run when plugin is enabled (best-effort) |
| `onDisable(ctx)` | No | Run when plugin is disabled (best-effort) |

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

Declare new permissions so admins can assign them to roles. Use the context methods provided to your `register` function:

```typescript
export function register(ctx: PluginContext): PluginRegistration {
  // 1. Declare the permission (appears in admin role editor)
  ctx.registerPluginPermission('myplugin.access', 'Access My Plugin features');
  ctx.registerPluginPermission('myplugin.admin', 'Manage My Plugin settings');

  // 2. Protect your routes with these permissions
  ctx.registerRoutePermission('GET:/api/plugins/my-plugin/data', { permission: 'myplugin.access' });
  ctx.registerRoutePermission('PUT:/api/plugins/my-plugin/config', { permission: 'myplugin.admin' });

  return {
    manifest: require('./manifest.json'),
    // ...
  };
}
```

> **Removed:** Importing `registerPluginPermission` / `registerRoutePermission` directly from `rbac.js` is no longer supported — the signatures now require a `pluginId` owner so cleanup on uninstall works. Always go through `ctx.*` so the engine can tear down your overrides when the plugin is disabled or uninstalled.

### How it works

1. **Plugin registers permissions** via `ctx.registerPluginPermission(key, description)` — these appear in the admin Roles tab with a "plugin" badge
2. **Plugin protects routes** via `ctx.registerRoutePermission(routeKey, rule)` — the RBAC middleware enforces the permission
3. **Admin assigns permissions** to roles from the admin panel — users with matching roles get access

### Route rule format

The `registerRoutePermission` key is `METHOD:/full/path` matching the dispatcher's
URL for your sub-route. It **must** start with `/api/plugins/<your-plugin-id>/` — a
plugin can only rewrite RBAC rules inside its own namespace. Anything else throws
at call time (this is what prevents a plugin with the `permissions` capability
from downgrading a core admin route).

```typescript
// Exact route
ctx.registerRoutePermission('GET:/api/plugins/my-plugin/stats', {
  permission: 'myplugin.access',
});

// Owner-scoped route (non-admin users only see their own data)
ctx.registerRoutePermission('GET:/api/plugins/my-plugin/history', {
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

## Admin UI

The admin panel provides several tools for managing plugins:

- **Installed tab**: Toggle plugins on/off, view version info, detect available updates, uninstall (hot — no restart)
- **Discover tab**: Browse community plugins from the GitHub registry and install with consent prompt
- **Reload plugins button**: Graceful server restart — only needed to pick up plugins you dropped into `packages/plugins/` by hand. Installs and uninstalls from the UI are already live.
- **Plugin with frontend**: Renders the plugin's custom component in the admin tab instead of the default settings form

## Capabilities

Any ctx method outside of `log` and service-bound methods (`getServiceConfig*`, `getArrClient`) lives inside a capability bucket. Your plugin must list the buckets it uses in `manifest.capabilities`. Calling a method in an undeclared bucket throws a clear error pointing at the missing manifest entry.

| Bucket              | ctx methods                                                      | When to declare it                            |
|---------------------|------------------------------------------------------------------|-----------------------------------------------|
| `users:read`        | `getUser`, `findUserByEmail`, `findUserByProvider`, `getUserProviders` | Lookup user profile or their linked providers |
| `users:write`       | `setUserRole`, `setUserDisabled`, `issueAuthToken`               | Change role, disable, impersonate             |
| `settings:plugin`   | `getSetting`, `setSetting`, `getPluginDataDir`                   | Store plugin-scoped state or files            |
| `settings:app`      | `getAppSettings`, `listFolderRules`                              | Read Oscarr-wide settings (site name, routing rules, etc.) |
| `notifications`     | `sendNotification`, `sendUserNotification`                       | Send alerts to users or notification channels |
| `permissions`       | `registerRoutePermission`, `registerPluginPermission`            | Declare RBAC rules for the plugin's routes    |
| `events`            | `events.on / off / emit`                                         | Use the cross-plugin event bus                |
| `tmdb:read`         | `tmdb.search`, `tmdb.movie`, `tmdb.tv`                           | Fetch TMDB metadata (cached + locale-aware)   |
| `requests:read`     | `requests.listForUser`, `media.batchStatus`, `media.getById`     | Read the user's request state + Oscarr library status |
| `requests:write`    | `requests.create`                                                | Create a media request on behalf of a user (full pipeline: validation → guard → blacklist → auto-approve → sendToService → notify) |

`log` and service methods are gated separately:
- **`log`** is always available. Secrets are scrubbed from `ctx.log.*(msg)` calls before persistence to avoid leaking tokens into the admin-visible `PluginLog` table.
- **Service methods** (`getServiceConfig`, `getServiceConfigRaw`, `getArrClient`) are gated by `manifest.services`. List any service type your plugin needs access to.

### Declaring capability reasons

Use `capabilityReasons` to explain *why* a plugin needs a sensitive capability. The admin sees this when enabling the plugin:

```json
{
  "capabilities": ["users:write"],
  "capabilityReasons": {
    "users:write": "Downgrades a user's role when their subscription expires."
  }
}
```

## Install flow (for end users)

Plugins no longer require `git clone + npm install + npm run build + restart`. Instead:

1. The plugin author tags a release on GitHub with a pre-built `dist/` committed (or attached as a release asset).
2. Admin opens **Admin → Plugins → Discover**, finds the plugin, clicks **Install**.
3. Oscarr downloads the tarball, validates the manifest, drops it in `packages/plugins/<id>/`, and hot-loads the plugin. No restart.

The `Install` button resolves the GitHub tarball of the plugin repo's HEAD. To install a plugin from an arbitrary URL, the admin UI exposes an "Install from URL" option (see the `POST /api/plugins/install { url }` endpoint).

## Dev loop

Once the plugin is symlinked into `packages/plugins/`, the tightest iteration cycle is:

1. Run `npm run dev` in your plugin dir — esbuild watches `src/` and rewrites `dist/index.js` on every save.
2. In the Oscarr admin UI, toggle the plugin **off** then **on** to re-import the fresh bundle. The dispatcher drops the old router + ctx + RBAC state and rebuilds from the new module — no server restart needed.
3. Watch logs via **Admin → Plugins → (your plugin) → Logs** (or tail the Oscarr server stdout). `ctx.log.info/warn/error` is persisted to the `PluginLog` table and scrubbed for secrets before display.

> **Why symlink rather than copy:** the plugin loader follows symlinks so your source edits are picked up as soon as esbuild rewrites `dist/`. Copying would force a manual resync after every build.

### Reset during dev

Plugin state (settings + `onInstallRan` flag) lives in the `PluginState` table. To force a clean install — e.g. to re-run `onInstall` — delete the row:

```sql
DELETE FROM "PluginState" WHERE "pluginId" = 'hello-oscarr';
```

Then toggle the plugin off/on and `onInstall(ctx)` fires again.

### Frontend-only changes

If your plugin has a `frontend/` bundle, the browser caches it aggressively. After a rebuild, hard-refresh the admin page (Shift+Reload) or bump the plugin's `version` in `manifest.json` — Oscarr uses that in the module URL as a cache buster.

## Release workflow

When you tag a new release, commit the pre-built `dist/` directory so it lands in the GitHub source tarball. A minimal GitHub Actions workflow:

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && npm run build
      - uses: ncipollo/release-action@v1
        with:
          artifacts: "dist.tar.gz"
          generateReleaseNotes: true
```

## Migration guide (pre-v0.6.3 → v0.6.3)

Existing plugins need three additions to load under the new engine:

1. **`engines.oscarr`** — declare the semver range of Oscarr versions you support. For a plugin that works today on 0.6.x: `{ "oscarr": ">=0.6.0 <1.0.0", "testedAgainst": ["0.6.3"] }`.
2. **`services`** — if your plugin calls `ctx.getServiceConfig*()` or `ctx.getArrClient()`, list each service type. E.g. `["radarr"]` or `["plex", "tautulli"]`. Plugins that don't touch services skip this field entirely.
3. **`capabilities`** — list the ctx method buckets you use (see the Capabilities table above). A plugin that only uses `ctx.log` needs no capabilities field — `log` is always granted.

Without these, the plugin either fails to load (missing `engines` → compat status `unknown` but still loads) or throws at runtime when it calls a gated method.

## Current limitations

- Plugins cannot modify the database schema (no Prisma migrations)
- Plugin frontend components are lazy-loaded via ESM and cannot import from the main app bundle (use `@oscarr/sdk` instead)
- No plugin dependency system (no way to declare that plugin A requires plugin B)
- Plugin modules stay in Node's ESM loader cache until process restart — a hot-uninstall drops routes + ctx + RBAC state but the module code itself only disappears on next boot
- The event bus is in-process only (no persistence, no cross-restart delivery)
