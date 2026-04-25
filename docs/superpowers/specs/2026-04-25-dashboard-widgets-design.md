# Admin Dashboard Widgets — Design Spec

**Issue:** [#159](https://github.com/arediss/Oscarr/issues/159)
**Date:** 2026-04-25
**Target release:** 0.8.0
**Scope:** Admin DashboardTab only — `/home` user dashboard is out of scope for this spec.

## Goal

Replace the static `DashboardTab` (currently 4 hard-coded stats) with a Home-Assistant-style composable dashboard. Widgets — built-in or contributed by plugins — are placed on a 12-column grid that the admin rearranges via drag-and-drop. Layout is global (one shared layout across all admins) and persisted in `AppSettings`.

## Non-goals

- Per-admin layout (decided: shared layout for all admins).
- User-facing `/dashboard` route — the user-facing variant from issue #159 is deferred.
- Multiple instances of the same widget on a single dashboard.
- Per-widget settings UI — widgets render their own internals; configuration lives inside the widget's own component if needed.
- Mobile drag-and-drop — mobile renders widgets as a vertical stack ordered by `(y, x)`, no DnD.
- Theming or color overrides per widget.

## Architecture overview

```
Frontend (React)
  AdminPage > DashboardTab
     │
     └─► <DashboardGrid>           ← react-grid-layout
            • GET /api/admin/dashboard-layout
            • toggle Edit ↔ View
            • Add/Remove via WidgetPickerModal
            • PUT /api/admin/dashboard-layout on Save
            │
            └─► <WidgetChrome>     ← shared title bar + icon + overflow menu
                   │
                   ├─► <BuiltInWidget id=…>
                   └─► <PluginWidget pluginId+widgetId=…>
                        (delegates to existing PluginHookComponent)

Backend (Fastify)
  GET  /api/admin/dashboard-layout      returns { version, items[] }
  PUT  /api/admin/dashboard-layout      validates body via Zod, persists
  DELETE /api/admin/dashboard-layout    clears the column, GET falls back to defaults

  Plugin engine
    • manifestSchema validates ui[].props for hookPoint=admin.dashboard.widget
      via a dedicated Zod sub-schema (id, title, icon, defaultSize, minSize, maxSize)
    • getUIContributions('admin.dashboard.widget') — already exists, no changes

  Storage
    AppSettings.adminDashboardLayout  String?  (JSON)
```

## Decisions

| Topic | Decision |
|---|---|
| Layout scope | Global — one shared layout for all admins, stored in `AppSettings.adminDashboardLayout` |
| DnD library | `react-grid-layout` (active maintenance, ships resize + responsive breakpoints, JSON format `{i,x,y,w,h}` matches our persistence) |
| Plugin contribution model | Reuse existing `hookPoint` + `getUIContributions` (option C: hookPoint + Zod sub-schema for typed `props`) — no duplicate widget infrastructure |
| Edit mode | Explicit toggle button, off by default. View mode = read-only grid; Edit mode = drag handles, remove buttons, Add button, Save / Cancel |
| Widget picker | Modale, vertical list with miniature preview (title + icon + default size). Filter `[All / Built-in / Plugins]`. Widgets already on dashboard are greyed out |
| Reset to default | `DELETE /api/admin/dashboard-layout` (or PUT with `{ reset: true }`) — clears the column, next GET returns hard-coded defaults |
| Mobile | Edit mode disabled on `< md` viewports. Render stacks vertically by `(y, x)` order |

## MVP widget catalogue (built-in)

3 widgets shipped in the first release. The other 6 from issue #159 are tracked as backlog.

### `stats-counters`
Mini-widget row with the 4 existing counters: total users, pending requests, services configured, plugins installed.
- Default size: `12 × 1` (full-width thin row)
- Min size: `4 × 1`
- Source: existing admin endpoints (`/api/admin/users/count`, `/api/admin/requests/count?status=pending`, `/api/admin/services` length, `/api/plugins` length)

### `service-health`
Reachability + version of every configured `*arr` / media server (Radarr, Sonarr, Plex, Jellyfin, Emby).
- Default size: `6 × 3`
- Min size: `4 × 2`
- Source: existing `getSystemStatus()` per `ArrClient` + Plex `/identity`. Pings refreshed every 60s. Stale data shown with a warning chip.

### `system`
Oscarr version + update available chip + uptime + count of plugin updates available.
- Default size: `6 × 3`
- Min size: `4 × 2`
- Source: `/api/app/version` + the existing plugin update check + `process.uptime()` exposed via a new `/api/admin/system/uptime` endpoint.

## Persistence

### DB

```prisma
model AppSettings {
  // ...
  adminDashboardLayout String?  // JSON: { version, items[] }
  // ...
}
```

One Prisma migration. The column is nullable; null means "use defaults".

### JSON shape

```json
{
  "version": 1,
  "items": [
    { "i": "builtin:stats-counters", "x": 0, "y": 0, "w": 12, "h": 1 },
    { "i": "builtin:service-health", "x": 0, "y": 1, "w": 6,  "h": 3 },
    { "i": "builtin:system",         "x": 6, "y": 1, "w": 6,  "h": 3 }
  ]
}
```

- `i` — unique identifier. Schema: `builtin:<id>` for core widgets, `plugin:<pluginId>:<widgetId>` for plugin-contributed widgets. Self-explanatory and collision-free.
- `x, y, w, h` — `react-grid-layout` native format on a 12-column grid.
- `version` — schema version, future-proof for migrations.

### Default layout

Hard-coded in the backend; returned by GET when the column is null.

```json
{
  "version": 1,
  "items": [
    { "i": "builtin:stats-counters", "x": 0, "y": 0, "w": 12, "h": 1 },
    { "i": "builtin:service-health", "x": 0, "y": 1, "w": 6,  "h": 3 },
    { "i": "builtin:system",         "x": 6, "y": 1, "w": 6,  "h": 3 }
  ]
}
```

## Plugin contribution API

Plugins declare a widget exactly like any other UI contribution, on a new hook point:

```json
// packages/plugins/<plugin>/manifest.json
{
  "hooks": {
    "ui": [{
      "hookPoint": "admin.dashboard.widget",
      "props": {
        "id": "weekly-stats",
        "title": "Tautulli — semaine",
        "icon": "BarChart",
        "defaultSize": { "w": 4, "h": 3 },
        "minSize":     { "w": 2, "h": 2 }
      }
    }]
  }
}
```

The plugin's frontend bundle (`frontend/index.tsx`) exposes a React component that matches `props.id`. The core resolves it through the existing `PluginHookComponent`, inheriting all current sandboxing: per-plugin Tailwind isolation via `data-oscarr-plugin`, error boundary, async lazy-load.

### Manifest validation (Zod sub-schema)

```ts
// packages/backend/src/plugins/manifestSchema.ts (extension)
const dashboardWidgetPropsSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  icon: z.string().optional(),                                             // Lucide icon name
  defaultSize: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
  minSize: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }).optional(),
  maxSize: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }).optional(),
});

// In the manifest validator: when ui[].hookPoint === 'admin.dashboard.widget',
// dashboardWidgetPropsSchema.parse(ui[].props) — invalid manifest = plugin
// rejected at load time, surfaced via `plugin.error`.
```

A malformed manifest never reaches the dashboard render path.

## Frontend components

### `<DashboardGrid>` (top level)

- Fetches layout via `useDashboardLayout()` hook (GET on mount, mutation function for PUT)
- Manages `editMode: boolean` state (default false)
- Renders `react-grid-layout`'s `<Responsive>` with breakpoints `{ lg: 1200, md: 996, sm: 768, xs: 0 }`
- On `< md` (sm/xs): renders a vertical stack ordered by `(y, x)` — no DnD
- Toolbar: `[Edit / Done]`, `[+ Add widget]` (edit only), overflow menu (`Reset to default`)
- On Save: PUT layout, exit edit mode. On Cancel: discard local edits, exit edit mode.

### `<WidgetChrome>`

Shared wrapper around every widget body:
- Title bar: icon + title + (edit-mode-only) drag handle + remove button
- Body: hosts the widget's React component inside an `<ErrorBoundary>`
- Click on the title or body in view mode does nothing dashboard-level (the widget's own internals can navigate, fetch, etc.)

### `<WidgetPickerModal>`

- Vertical list of available widgets — built-in catalogue + `getUIContributions('admin.dashboard.widget')`
- Filter chips at the top: `[All] [Built-in] [Plugins]`
- Each row: icon, title, source badge, default size (`w × h`), state (`Already on dashboard` greyed if `i` already in layout)
- Click on a non-greyed row appends `{ i, x: 0, y: ∞, w: defaultSize.w, h: defaultSize.h }` to the local layout draft and closes the modal. `react-grid-layout` will compact the y axis on next render.

### `<BuiltInWidget>`

Switch on `widgetId` → renders one of `<StatsCountersWidget>`, `<ServiceHealthWidget>`, `<SystemWidget>`. Each widget owns its own data fetching (no cross-widget data sharing).

### `<PluginWidget>`

Wraps existing `<PluginHookComponent>` with `pluginId` + `hookPoint=admin.dashboard.widget` + a filter on `props.id` to render only the matching contribution from that plugin.

## Backend endpoints

```ts
// packages/backend/src/routes/admin/dashboard.ts (new)
app.get('/dashboard-layout', async () => {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings?.adminDashboardLayout) return DEFAULT_LAYOUT;
  return JSON.parse(settings.adminDashboardLayout);
});

app.put('/dashboard-layout', { schema: { body: layoutBodySchema } }, async (request) => {
  // body validated by Fastify schema (or Zod) — { version, items[] }
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { adminDashboardLayout: JSON.stringify(request.body) },
    create: { id: 1, adminDashboardLayout: JSON.stringify(request.body), updatedAt: new Date() },
  });
  return { ok: true };
});

app.delete('/dashboard-layout', async () => {
  await prisma.appSettings.update({
    where: { id: 1 },
    data: { adminDashboardLayout: null },
  });
  return { ok: true };
});
```

All three routes go through the existing `admin.*` RBAC middleware.

## Drag-and-drop UX

### View mode (default)
Read-only grid. No drag handles visible. Widgets are interactive (click into their internals freely). Toolbar shows just the `[Edit]` button.

### Edit mode
- Drag handles appear in widget chrome title bars (top-left corner)
- Each widget chrome shows a small `×` (remove) button
- Toolbar shows `[Add widget]` `[Cancel]` `[Save]` and the overflow `[Reset to default]`
- Drag/resize updates a local layout draft (state, not yet persisted)
- `Save` PUTs the draft, exits to view mode
- `Cancel` discards the draft, exits to view mode

### Widget picker
Triggered by `[Add widget]` in edit mode. Modal as described above.

### Ghost widgets

If the layout JSON references an `i` that no longer exists (plugin disabled, plugin uninstalled, built-in widget removed by a future Oscarr version):

- View mode: show a placeholder card "Widget unavailable — plugin disabled or removed"
- Edit mode: same placeholder + an explicit `Remove from dashboard` button
- The placeholder is non-interactive (no drag, no fetch) — purely informational

The placeholder is a sentinel UI; the layout JSON is **not** auto-cleaned. The admin remains in control: they may re-enable the plugin and the widget reappears with its data.

## Error handling

- **Widget render error** — each widget body wrapped in an `<ErrorBoundary>`. Fallback shows "Widget error" + a `Retry` button that remounts the widget. The rest of the dashboard keeps working.
- **Plugin manifest invalid** — `dashboardWidgetPropsSchema.parse()` failure at plugin load time. Plugin marked `error`, no contribution registered, no chance of reaching the render path. Logged via `logEvent`.
- **Backend data error inside a widget** — the widget owns its own state (loading, error, ok). `service-health` showing "Radarr unreachable" is a normal state, not an exception.
- **Layout PUT failure** — toast error, draft kept on screen, admin can retry. No silent loss of edits.

## Testing

No unit tests — consistent with project policy through 0.7.x.

**Manual pre-merge checklist:**
1. Drag and resize the 3 built-in widgets, click Save, reload the page → layout persisted.
2. Enter edit mode, move widgets, click Cancel → layout reverts.
3. Install a plugin that ships an `admin.dashboard.widget` contribution (use the migrated `tautulli-insights` from #159 step 9 if available, or stub one). Open the picker → plugin widget listed. Add it → renders with chrome. Drag → persists.
4. Disable the plugin → widget shows ghost placeholder. Edit mode → `Remove` button works.
5. Click `Reset to default` in the overflow menu → layout returns to the hard-coded defaults.
6. Resize browser to mobile viewport → widgets stack vertically, no edit toolbar visible.

## Open questions deferred to the implementation plan

- Exact polling cadence for `service-health` (60s mentioned, refine during build).
- Whether `system` widget's "uptime" needs its own endpoint or can be derived from existing telemetry.
- Modal styling — reuse existing `<Modal>` component from the codebase (verify what's there).
- Lucide icon validation — the manifest accepts any string; consider an enum check at plugin load time so a typo'd icon name shows a fallback rather than blank.

## Out of scope (backlog)

The following items from issue #159 are explicitly out of scope and tracked for later releases:

- 6 backlog widgets: `recently-available`, `upcoming-releases`, `popular-this-week`, `recent-activity`, `active-downloads`, `storage`
- User-facing `/dashboard` route — the spec stays admin-tab-only
- Per-admin layouts (decided: shared)
- Multi-instance widgets (e.g. two `service-health` widgets on the same dashboard with different filters)
- Per-instance settings UI
- Mobile drag-and-drop
- Plugin SDK helper for widget authors (just docs for v1; helper if friction emerges)

These can each be picked up as a follow-up spec without re-architecting the v1 design.
