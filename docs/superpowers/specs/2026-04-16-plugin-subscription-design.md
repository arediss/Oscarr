# plugin-subscription — Design spec

**Date:** 2026-04-16
**Status:** Brainstormed, approved — pending implementation plan.
**Plugin location:** `~/Oscarr/plugin-subscription/` (outside core git), symlinked into `packages/plugins/` at runtime.

## Goal

Let admins track per-user subscription tiers in Oscarr. When a subscription expires, the plugin automatically notifies the user and changes their RBAC role. The plugin ships as a self-contained external package — no feature-specific code lives in the core repo.

## Non-goals

- **No payment processing.** Admin sets dates and tiers manually; `priceLabel` is a display string only.
- **No subscription history.** One current subscription per user; renewals overwrite the row.
- **No automatic tier upgrades/downgrades based on usage.** Admin-driven only.
- **No public signup flow.** Users cannot self-subscribe.

## Core changes (two small generic additions — reusable by any plugin)

The current `PluginContext` (v1) is read-only for users and has no way to give a plugin its own data folder. Two small additions, both **generic** and **not subscription-specific**:

1. **`setUserRole(userId: number, roleName: string): Promise<void>`**
   - Verifies the role exists in the `Role` table; throws if not.
   - Updates `User.role`.
   - ~10 lines in `context/v1.ts` + 1 line in the `PluginContext` type.

2. **`getPluginDataDir(): Promise<string>`**
   - Returns the absolute path to `{backendRoot}/data/plugins/{pluginId}/`, creating it if needed.
   - Gives each plugin a namespaced filesystem folder that sits **next to `oscarr.db`** so it's covered by the same Docker volume mount and the same backup / snapshot story.
   - Plugin-agnostic; any plugin that wants structured local storage uses this.
   - ~8 lines in `context/v1.ts` + 1 line in type + maybe a small shared helper `utils/dataPath.ts` for resolving the data root.

## Plugin file layout

```
plugin-subscription/
├── manifest.json
├── package.json
├── src/
│   ├── index.ts              # register(ctx) entry
│   ├── schema.prisma         # extension Prisma (tables plugin)
│   ├── migrations/           # Prisma migrations owned by the plugin
│   ├── routes.ts             # REST endpoints
│   ├── jobs.ts               # daily expiration check
│   ├── notifications.ts      # notification templates
│   └── permissions.ts        # permission strings
├── frontend/
│   ├── index.tsx             # compiled entry (served via /api/plugins/subscription/frontend/*)
│   ├── AvatarEntry.tsx       # contribution to `avatar.menu`
│   ├── admin/
│   │   ├── TiersTab.tsx      # CRUD tiers
│   │   └── UsersTab.tsx      # assign / revoke user subscriptions
│   └── api.ts                # fetch wrappers
└── dist/                     # build output (gitignored)
```

## Data model (JSON file in plugin data folder)

**Why not DB tables?** The plugin must be uninstallable by removing its folder — no orphan DB schema left behind. Dedicated Prisma tables would require migrations that can't be cleanly dropped when the plugin is gone. So all domain data lives on disk, in a folder owned by the plugin.

**Storage location:** `{backendRoot}/data/plugins/subscription/data.json` — discovered via `ctx.getPluginDataDir()`. Sits next to `oscarr.db`, covered by the same Docker volume and the same backup policy.

**Admin settings (role names, notify threshold)** stay in `PluginState.settings` (DB JSON column) because that's the standard surface the core plugin settings UI writes to. The orphan row left in `PluginState` if the plugin is removed is negligible (small JSON blob in a pre-existing core table — not a dead schema).

**File shape** — single atomic file per plugin, `data.json`:

```jsonc
{
  "version": 1,
  "tiers": [
    {
      "id": "tier_01HXY...",               // ULID or UUID
      "name": "Monthly",
      "description": "Standard monthly plan",
      "durationDays": 30,
      "priceLabel": "9.99€/month",
      "createdAt": "2026-04-16T12:00:00.000Z",
      "updatedAt": "2026-04-16T12:00:00.000Z"
    }
  ],
  "subscriptions": {
    "42": {                                // keyed by userId (string)
      "tierId": "tier_01HXY...",
      "startedAt": "2026-04-16T00:00:00.000Z",
      "expiresAt": "2026-05-16T00:00:00.000Z",
      "notifiedAt": null,                  // set when pre-expiry notif sent
      "expiredAt": null,                   // set by cron at expiration
      "createdAt": "2026-04-16T12:00:00.000Z",
      "updatedAt": "2026-04-16T12:00:00.000Z"
    }
  }
}
```

Notes:
- `version` allows future schema migrations inside the plugin (no impact on core).
- Constraints enforced in code instead of by the DB:
  - Tier `name` unique — checked before insert.
  - One active sub per user — enforced by keying subscriptions by `userId`.
  - Tier delete blocked if a subscription references it — checked before delete.
- Renewal = overwrite the existing user's subscription row (reset dates, clear `notifiedAt` / `expiredAt`). No history.
- Writes are serialized inside the plugin via a simple in-memory mutex (admin UI has low write volume + daily cron + zero concurrent writes realistically, but the mutex prevents races under load).

## Plugin settings (stored in `PluginState.settings` JSON)

```ts
{
  premiumRoleName: string,       // role assigned when sub is created/renewed
  downgradeRoleName: string,     // role assigned at expiration
  notifyDaysBefore: number,      // default 7
  notifyOnExpiration: boolean    // default true — second notif on the expiry day itself
}
```

Configured via the existing plugin settings UI (declared in `manifest.settings`).

## Permissions

Registered via `ctx.registerPluginPermission`:

| Permission | Description |
|---|---|
| `subscription.tiers.manage` | CRUD on `SubscriptionTier` |
| `subscription.subs.manage` | Assign / revoke `UserSubscription` for any user |
| `subscription.view.self` | Read your own subscription (auto-granted to any authenticated user via `ownerScoped` route rule) |

## REST API (prefixed `/api/plugins/subscription/`)

| Method | Path | Permission | Body / notes |
|---|---|---|---|
| GET    | `/tiers` | `tiers.manage` or `subs.manage` | List all tiers |
| POST   | `/tiers` | `tiers.manage` | `{ name, description?, durationDays, priceLabel }` |
| PUT    | `/tiers/:id` | `tiers.manage` | Partial update |
| DELETE | `/tiers/:id` | `tiers.manage` | 409 if subs reference it |
| GET    | `/subscriptions` | `subs.manage` | List all, paginated |
| GET    | `/subscriptions/user/:userId` | `subs.manage` | Single user's sub |
| POST   | `/subscriptions` | `subs.manage` | `{ userId, tierId, startedAt }` — upsert on `userId` |
| DELETE | `/subscriptions/:id` | `subs.manage` | Revoke manually; does NOT auto-downgrade role (admin decides) |
| GET    | `/me` | `view.self` | The calling user's current sub + tier info |

POST `/subscriptions` behavior:
1. Upsert by `userId` (renew = overwrite).
2. Compute `expiresAt = startedAt + tier.durationDays`.
3. Reset `notifiedAt` and `expiredAt` to null.
4. Call `ctx.setUserRole(userId, settings.premiumRoleName)`.

## Scheduled job

`manifest.hooks.jobs`:
```json
[{ "key": "subscription_check", "label": "Check subscriptions", "cron": "0 3 * * *" }]
```

Daily pass at 03:00. Two queries, idempotent:

1. **Expiration step** — `UserSubscription` where `expiresAt <= now() AND expiredAt IS NULL`:
   - Set `expiredAt = now()`.
   - `ctx.setUserRole(userId, settings.downgradeRoleName)`.
   - `ctx.sendUserNotification(userId, { type: 'subscription_expired', title: ..., message: ... })`.

2. **Pre-expiry notice step** — `UserSubscription` where `expiresAt BETWEEN now() AND now() + notifyDaysBefore AND notifiedAt IS NULL AND expiredAt IS NULL`:
   - Send "expires in N days" notification.
   - Set `notifiedAt = now()`.

**Error handling:**
- If `premiumRoleName` or `downgradeRoleName` doesn't exist in DB: log error, skip that user, and continue processing the remaining users. An admin-facing alert surface (error summary per run) can be added later if needed — not in MVP scope.
- If a user row is missing (orphan): delete the `UserSubscription` row (defensive cleanup).

## UI contributions (no core touches)

| Hookpoint | Contribution | Guard |
|---|---|---|
| `admin.tabs` | Tab "Subscriptions" containing two sub-tabs: Tiers (CRUD) and Users (assign/revoke) | `tiers.manage` OR `subs.manage` |
| `avatar.menu` | Entry `🪙 Premium until DD/MM/YYYY` (or `No subscription` fallback) — non-clickable info row | any authenticated user |

No dedicated `/p/subscription/*` page. No home row, no media-detail hook.

## Notification templates

Two notification types registered:

- `subscription_expiring_soon`
  - title: `"Ta subscription expire bientôt"`
  - message: `"Ton tier {tierName} expire le {expiresAt}. Contacte l'admin pour renouveler."`
- `subscription_expired`
  - title: `"Subscription expirée"`
  - message: `"Ton tier {tierName} a expiré. Ton rôle est passé à {downgradeRoleName}."`

Both i18n-ready (keys under `plugin.subscription.notifications.*`), fallback strings in English inline.

## Testing strategy

- **Unit**: job logic (two queries + side effects) tested with a Prisma test DB, injecting fake `ctx.setUserRole` and `ctx.sendUserNotification` mocks. Freeze clock to verify idempotency (running the job twice should not duplicate notifications or role changes).
- **Integration**: REST routes exercised against an in-memory SQLite Prisma instance.
- **Manual smoke**: happy path (assign sub → role changes → wait → expire → role downgraded + notif) before shipping.

No E2E browser tests in scope — UI is admin-only CRUD, visually-trivial.

## Risks & open items

1. **Cascade on `User` deletion.** If core's `User` model doesn't cascade to plugin tables, orphan rows accumulate. The job's orphan-cleanup step handles it defensively, but the cleaner fix is for the plugin migration to declare the FK with cascade. Decide during implementation after checking how the core's `User` FKs behave with plugin-owned tables.
2. **Cron granularity.** Daily at 03:00 means a user whose sub expires at 02:59 gets the "expired" notification 24h later. Acceptable for MVP; revisit if a user complains.
3. **Role existence drift.** If an admin deletes the role configured as `premiumRoleName`, future assignments fail. Mitigation: log + admin notif; plugin does not auto-fallback to another role (intentional — explicit config).

## What we're NOT doing

- Payment / Stripe / any provider integration.
- Subscription history or audit log.
- Proration or partial-month refunds.
- User-facing renewal flow.
- Automatic tier promotion (only admin can change tiers).
- Multi-currency. `priceLabel` is a free-form string.
