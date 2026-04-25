# Admin Dashboard Widgets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static admin DashboardTab with a Home-Assistant-style composable widget grid (drag-and-drop), backed by 3 built-in widgets (System / Service Health / Stats Counters) and a typed contribution API for plugins.

**Architecture:** Reuses the existing plugin `hookPoint` mechanism (`getUIContributions('admin.dashboard.widget')`) plus a Zod sub-schema validating widget `props` (id/title/icon/sizes). Layout JSON `{ version, items: [{i,x,y,w,h}] }` persisted in `AppSettings.adminDashboardLayout` (global, shared across admins). Frontend uses `react-grid-layout` for grid+resize+breakpoints.

**Tech Stack:** Backend — Fastify, Prisma, Zod. Frontend — React 19, react-grid-layout, Tailwind. No unit tests for this feature (consistent with 0.7.x project policy); each task ends with manual verification steps.

**Spec:** [docs/superpowers/specs/2026-04-25-dashboard-widgets-design.md](../specs/2026-04-25-dashboard-widgets-design.md)

---

## File Structure

**Backend (new):**
- `packages/backend/src/routes/admin/dashboard.ts` — GET / PUT / DELETE `/api/admin/dashboard-layout`

**Backend (modified):**
- `packages/backend/prisma/schema.prisma` — add `adminDashboardLayout` column to `AppSettings`
- `packages/backend/prisma/migrations/<timestamp>_admin_dashboard_layout/migration.sql` — generated migration
- `packages/backend/src/routes/admin/index.ts` — register `dashboardRoutes`
- `packages/backend/src/plugins/manifestSchema.ts` — Zod sub-schema for `admin.dashboard.widget` props

**Frontend (new) — all under `packages/frontend/src/pages/admin/dashboard/`:**
- `useDashboardLayout.ts` — hook fetching/saving the layout
- `WidgetChrome.tsx` — title bar + drag handle + remove button wrapper
- `DashboardGrid.tsx` — top-level grid, edit mode, save flow
- `WidgetPickerModal.tsx` — modal listing built-in + plugin widgets
- `builtInCatalog.ts` — registry mapping `builtin:<id>` → component + metadata
- `PluginWidget.tsx` — wraps PluginHookComponent for `admin.dashboard.widget`
- `widgets/StatsCountersWidget.tsx`
- `widgets/ServiceHealthWidget.tsx`
- `widgets/SystemWidget.tsx`

**Frontend (modified):**
- `packages/frontend/package.json` — add `react-grid-layout` dep
- `packages/frontend/src/pages/admin/DashboardTab.tsx` — replace contents with `<DashboardGrid />`

**Docs (modified):**
- `docs/plugins.md` — document the new `admin.dashboard.widget` hook point with example

---

## Task 1: Add Prisma column for admin dashboard layout

**Files:**
- Modify: `packages/backend/prisma/schema.prisma:165-192` (AppSettings model)

- [ ] **Step 1: Add the column to the Prisma model**

Find the `AppSettings` model in `packages/backend/prisma/schema.prisma` and add the new column right after `homepageLayout`:

```prisma
homepageLayout        String?   // JSON array of HomepageSection configs
adminDashboardLayout  String?   // JSON: { version, items[{ i, x, y, w, h }] } — null = use defaults
setupChecklistDismissed Boolean @default(false)
```

- [ ] **Step 2: Generate the migration**

```bash
cd packages/backend && npx prisma migrate dev --name admin_dashboard_layout
```

Expected: a new directory `prisma/migrations/<timestamp>_admin_dashboard_layout/` containing a `migration.sql` like:

```sql
-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "adminDashboardLayout" TEXT;
```

The migration runs automatically on the dev DB.

- [ ] **Step 3: Regenerate the Prisma client**

```bash
cd packages/backend && npx prisma generate
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/
git commit -m "feat(db): add AppSettings.adminDashboardLayout column

Stores the admin dashboard's widget grid layout as JSON
({ version, items[{ i, x, y, w, h }] }). Nullable; null means
'use the hard-coded defaults'."
```

---

## Task 2: Backend dashboard layout routes

**Files:**
- Create: `packages/backend/src/routes/admin/dashboard.ts`
- Modify: `packages/backend/src/routes/admin/index.ts:1-40` (register the new routes)

- [ ] **Step 1: Create the dashboard route file**

Create `packages/backend/src/routes/admin/dashboard.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';

const DEFAULT_LAYOUT = {
  version: 1,
  items: [
    { i: 'builtin:stats-counters', x: 0, y: 0, w: 12, h: 1 },
    { i: 'builtin:service-health', x: 0, y: 1, w: 6,  h: 3 },
    { i: 'builtin:system',         x: 6, y: 1, w: 6,  h: 3 },
  ],
} as const;

const layoutBodySchema = {
  type: 'object',
  required: ['version', 'items'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['i', 'x', 'y', 'w', 'h'],
        properties: {
          i: { type: 'string', minLength: 1 },
          x: { type: 'integer', minimum: 0 },
          y: { type: 'integer', minimum: 0 },
          w: { type: 'integer', minimum: 1 },
          h: { type: 'integer', minimum: 1 },
        },
      },
    },
  },
} as const;

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard-layout', async () => {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.adminDashboardLayout) return DEFAULT_LAYOUT;
    try {
      return JSON.parse(settings.adminDashboardLayout);
    } catch {
      return DEFAULT_LAYOUT;
    }
  });

  app.put('/dashboard-layout', { schema: { body: layoutBodySchema } }, async (request) => {
    const body = request.body as { version: number; items: unknown[] };
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { adminDashboardLayout: JSON.stringify(body) },
      create: { id: 1, adminDashboardLayout: JSON.stringify(body), updatedAt: new Date() },
    });
    return { ok: true };
  });

  app.delete('/dashboard-layout', async () => {
    await prisma.appSettings.upsert({
      where: { id: 1 },
      update: { adminDashboardLayout: null },
      create: { id: 1, updatedAt: new Date() },
    });
    return { ok: true };
  });
}
```

- [ ] **Step 2: Register the routes in admin index**

Edit `packages/backend/src/routes/admin/index.ts`. Add the import alongside the others and call it inside `adminRoutes`:

```ts
import { dashboardRoutes } from './dashboard.js';
```

Then inside `export async function adminRoutes(app: FastifyInstance) {`, add this line near the other tab-specific routes (e.g. right after `homepageRoutes`):

```ts
await dashboardRoutes(app);
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manual smoke test**

Start the dev backend (`npm run dev:backend` from the repo root). Then:

```bash
# As an authenticated admin (use cookie or replay browser session)
curl -s http://localhost:3001/api/admin/dashboard-layout | jq .
```

Expected: returns the DEFAULT_LAYOUT JSON.

```bash
curl -s -X PUT http://localhost:3001/api/admin/dashboard-layout \
  -H 'content-type: application/json' \
  -H 'X-Requested-With: oscarr' \
  -d '{"version":1,"items":[{"i":"builtin:system","x":0,"y":0,"w":12,"h":2}]}'
```

Expected: `{ "ok": true }`. The next GET returns the new layout.

```bash
curl -s -X DELETE http://localhost:3001/api/admin/dashboard-layout \
  -H 'X-Requested-With: oscarr'
```

Expected: `{ "ok": true }`. Next GET returns DEFAULT_LAYOUT.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/admin/dashboard.ts packages/backend/src/routes/admin/index.ts
git commit -m "feat(api): admin dashboard layout endpoints

GET /api/admin/dashboard-layout — returns persisted layout or hard-coded
defaults. PUT — body-validated upsert. DELETE — reset to defaults."
```

---

## Task 3: Plugin manifest schema for `admin.dashboard.widget`

**Files:**
- Modify: `packages/backend/src/plugins/manifestSchema.ts:36-40` (uiContribution schema)

- [ ] **Step 1: Add the widget props sub-schema and apply it conditionally**

In `packages/backend/src/plugins/manifestSchema.ts`, replace the existing `const uiContribution = …` block with:

```ts
const sizeSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
}).strict();

const dashboardWidgetPropsSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric + dashes'),
  title: z.string().min(1),
  icon: z.string().optional(),                    // Lucide icon name
  defaultSize: sizeSchema,
  minSize: sizeSchema.optional(),
  maxSize: sizeSchema.optional(),
}).strict();

const uiContribution = z.object({
  hookPoint: z.string().min(1),
  props: z.record(z.unknown()),
  order: z.number().optional(),
}).strict().superRefine((data, ctx) => {
  // For the dashboard widget hook, validate props with the dedicated schema so a malformed
  // contribution is rejected at plugin load instead of crashing the dashboard at render.
  if (data.hookPoint === 'admin.dashboard.widget') {
    const result = dashboardWidgetPropsSchema.safeParse(data.props);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['props', ...issue.path],
          message: issue.message,
        });
      }
    }
  }
});
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Manual smoke test (negative case)**

Create a temporary fake plugin manifest with a bad widget props, e.g. via a unit script:

```bash
node -e "
import('./packages/backend/dist/plugins/manifestSchema.js').then(m => {
  try {
    m.parseManifest({
      id: 'test', name: 'Test', version: '0.1.0', apiVersion: 'v1', entry: 'dist/index.js',
      hooks: { ui: [{ hookPoint: 'admin.dashboard.widget', props: { id: 'BAD UPPER', title: 'x', defaultSize: { w: 1, h: 1 } } }] }
    }, '/tmp');
  } catch (e) { console.log('rejected as expected:', e.message); }
})
"
```

Expected output includes the rejection with the path `hooks.ui.0.props.id` and the regex error.

(If the dist isn't built, run after `npm run build:bundle --workspace=packages/backend`. This is for verification only, no need to keep the script.)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/plugins/manifestSchema.ts
git commit -m "feat(plugins): typed schema for admin.dashboard.widget contributions

When a plugin declares a 'admin.dashboard.widget' hookPoint, its props
are now validated against a dedicated Zod sub-schema (id/title/icon/
defaultSize/minSize/maxSize). Invalid manifests are rejected at load
time instead of failing later at render."
```

---

## Task 4: Add react-grid-layout dependency

**Files:**
- Modify: `packages/frontend/package.json` (dependencies)

- [ ] **Step 1: Install the package**

```bash
npm install react-grid-layout @types/react-grid-layout --workspace=packages/frontend --no-audit --no-fund
```

Expected: adds `react-grid-layout` and `@types/react-grid-layout` to `packages/frontend/package.json` and updates `package-lock.json`.

- [ ] **Step 2: Verify the import works**

Quick sanity check from the workspace root:

```bash
node -e "console.log(require.resolve('react-grid-layout', { paths: ['packages/frontend'] }))"
```

Expected: prints the resolved path under `node_modules`.

- [ ] **Step 3: Typecheck the frontend**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors (no usage yet, just the type package added).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/package.json package-lock.json
git commit -m "chore(frontend): add react-grid-layout

For the admin dashboard widget grid (Task #159). Ships drag-and-drop +
resize + responsive breakpoints out of the box; layout JSON shape
matches our persistence format ({ i, x, y, w, h })."
```

---

## Task 5: useDashboardLayout hook

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/useDashboardLayout.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  version: number;
  items: LayoutItem[];
}

interface UseDashboardLayoutResult {
  layout: DashboardLayout | null;
  loading: boolean;
  error: string | null;
  save: (next: DashboardLayout) => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDashboardLayout(): UseDashboardLayoutResult {
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLayout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DashboardLayout>('/admin/dashboard-layout');
      setLayout(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  const save = useCallback(async (next: DashboardLayout) => {
    await api.put('/admin/dashboard-layout', next);
    setLayout(next);
  }, []);

  const reset = useCallback(async () => {
    await api.delete('/admin/dashboard-layout');
    await fetchLayout();
  }, [fetchLayout]);

  return { layout, loading, error, save, reset, refresh: fetchLayout };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/useDashboardLayout.ts
git commit -m "feat(admin): useDashboardLayout hook

Reads/writes /api/admin/dashboard-layout. Exposes { layout, loading,
error, save, reset, refresh } for the upcoming DashboardGrid."
```

---

## Task 6: Built-in widget catalog skeleton

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts`

- [ ] **Step 1: Create the catalog with placeholder components**

The catalog is the registry mapping a layout `i` like `builtin:stats-counters` to the React component that renders the widget body. The 3 widgets are added in Tasks 9-11; for now we register them as null components so the file compiles, then populate as we go.

```ts
import type { ComponentType } from 'react';

export interface BuiltInWidget {
  id: string;                  // matches the layout 'i' suffix after 'builtin:'
  title: string;               // displayed in WidgetChrome title bar
  icon: string;                // Lucide icon name
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  Component: ComponentType;    // widget body
}

/** Registry of built-in widgets. Keyed by short id (no 'builtin:' prefix). */
export const BUILT_IN_WIDGETS: Record<string, BuiltInWidget> = {};

/** Lookup by layout 'i' (e.g. 'builtin:stats-counters' → the entry). */
export function getBuiltInWidget(layoutI: string): BuiltInWidget | null {
  if (!layoutI.startsWith('builtin:')) return null;
  return BUILT_IN_WIDGETS[layoutI.slice('builtin:'.length)] ?? null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts
git commit -m "feat(admin): scaffold built-in widget catalog

Empty registry + lookup helper. Concrete widgets populate the registry
as they're added in subsequent tasks."
```

---

## Task 7: WidgetChrome wrapper

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/WidgetChrome.tsx`

- [ ] **Step 1: Create the chrome wrapper**

```tsx
import type { ReactNode } from 'react';
import { Component as ReactComponent } from 'react';
import { GripVertical, X } from 'lucide-react';
import { DynamicIcon } from '@/plugins/DynamicIcon';

interface WidgetChromeProps {
  title: string;
  icon?: string;
  editMode: boolean;
  onRemove?: () => void;
  children: ReactNode;
}

/** Per-widget error boundary so one widget crashing doesn't blank the dashboard. */
class WidgetErrorBoundary extends ReactComponent<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn('[Widget] render error:', err.message); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-ndp-text-dim">
          Widget error
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetChrome({ title, icon, editMode, onRemove, children }: WidgetChromeProps) {
  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        {editMode && (
          <span className="widget-drag-handle cursor-move text-ndp-text-dim hover:text-ndp-text">
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        {icon && <DynamicIcon name={icon} className="h-4 w-4 text-ndp-text-dim" />}
        <h3 className="flex-1 truncate text-sm font-medium text-ndp-text">{title}</h3>
        {editMode && onRemove && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-ndp-text-dim hover:bg-white/5 hover:text-ndp-danger"
            aria-label={`Remove ${title}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <WidgetErrorBoundary>{children}</WidgetErrorBoundary>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors. (`DynamicIcon` is already used elsewhere in the codebase — see `AdminLayout.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/WidgetChrome.tsx
git commit -m "feat(admin): WidgetChrome — title bar + drag handle + remove

Shared chrome around every dashboard widget. Hosts the widget body
inside a per-widget error boundary so a crash stays contained."
```

---

## Task 8: PluginWidget wrapper

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/PluginWidget.tsx`

- [ ] **Step 1: Create the wrapper**

`PluginWidget` resolves a layout `i` like `plugin:tautulli:weekly-stats` into the right plugin contribution and hands it off to the existing `PluginHookComponent`.

```tsx
import { usePluginUI } from '@/plugins/usePlugins';
import { PluginHookComponent } from '@/plugins/PluginHookComponent';

interface PluginWidgetProps {
  /** Layout 'i' value. Format: 'plugin:<pluginId>:<widgetId>'. */
  layoutI: string;
}

interface ParsedId { pluginId: string; widgetId: string }

function parsePluginLayoutI(i: string): ParsedId | null {
  if (!i.startsWith('plugin:')) return null;
  const rest = i.slice('plugin:'.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return null;
  return { pluginId: rest.slice(0, sep), widgetId: rest.slice(sep + 1) };
}

export function PluginWidget({ layoutI }: PluginWidgetProps) {
  const parsed = parsePluginLayoutI(layoutI);
  const { contributions } = usePluginUI('admin.dashboard.widget');

  if (!parsed) {
    return <p className="text-xs text-ndp-text-dim">Invalid plugin widget id</p>;
  }
  const contribution = contributions.find(
    (c) => c.pluginId === parsed.pluginId && c.props?.id === parsed.widgetId,
  );
  if (!contribution) return null;  // ghost case — handled by DashboardGrid

  return (
    <PluginHookComponent
      pluginId={parsed.pluginId}
      hookPoint="admin.dashboard.widget"
      context={{ widgetId: parsed.widgetId }}
      contribution={contribution}
    />
  );
}

export { parsePluginLayoutI };
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors. (`usePluginUI` is exported from `packages/frontend/src/plugins/usePlugins`; verify the import path matches what `PluginSlot.tsx` already uses.)

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/PluginWidget.tsx
git commit -m "feat(admin): PluginWidget — resolves plugin:<id>:<widget> ids

Looks up the matching admin.dashboard.widget contribution and delegates
to PluginHookComponent (which inherits the existing CSS isolation +
error boundary)."
```

---

## Task 9: StatsCountersWidget (built-in)

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/widgets/StatsCountersWidget.tsx`
- Modify: `packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts` (register)

- [ ] **Step 1: Create the widget**

Re-uses the same 4 endpoints the existing DashboardTab calls today.

```tsx
import { useEffect, useState } from 'react';
import { Users, Film, Server, Plug } from 'lucide-react';
import api from '@/lib/api';

interface Stats {
  users: number | null;
  pendingRequests: number | null;
  services: number | null;
  plugins: number | null;
}

export function StatsCountersWidget() {
  const [stats, setStats] = useState<Stats>({ users: null, pendingRequests: null, services: null, plugins: null });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.get('/admin/users'),
      api.get('/requests?status=pending'),
      api.get('/admin/services'),
      api.get('/plugins'),
    ]).then((results) => {
      if (cancelled) return;
      const length = (r: PromiseSettledResult<{ data: unknown }>): number | null => {
        if (r.status !== 'fulfilled') return null;
        const d = r.value.data as { results?: unknown[]; data?: unknown[] } | unknown[];
        if (Array.isArray(d)) return d.length;
        if (Array.isArray(d?.results)) return d.results.length;
        if (Array.isArray(d?.data)) return d.data.length;
        return null;
      };
      setStats({
        users: length(results[0]),
        pendingRequests: length(results[1]),
        services: length(results[2]),
        plugins: length(results[3]),
      });
    });
    return () => { cancelled = true; };
  }, []);

  const items: { icon: typeof Users; label: string; value: number | null }[] = [
    { icon: Users, label: 'Users', value: stats.users },
    { icon: Film, label: 'Pending requests', value: stats.pendingRequests },
    { icon: Server, label: 'Services', value: stats.services },
    { icon: Plug, label: 'Plugins', value: stats.plugins },
  ];

  return (
    <div className="grid h-full grid-cols-4 gap-3">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
          <Icon className="h-5 w-5 text-ndp-accent" />
          <div className="min-w-0">
            <p className="truncate text-xs text-ndp-text-dim">{label}</p>
            <p className="text-lg font-semibold text-ndp-text">{value ?? '—'}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Register in the catalog**

Edit `packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts` so it imports and registers the widget:

```ts
import type { ComponentType } from 'react';
import { StatsCountersWidget } from './widgets/StatsCountersWidget';

export interface BuiltInWidget {
  id: string;
  title: string;
  icon: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  Component: ComponentType;
}

export const BUILT_IN_WIDGETS: Record<string, BuiltInWidget> = {
  'stats-counters': {
    id: 'stats-counters',
    title: 'Stats',
    icon: 'BarChart3',
    defaultSize: { w: 12, h: 1 },
    minSize: { w: 4, h: 1 },
    Component: StatsCountersWidget,
  },
};

export function getBuiltInWidget(layoutI: string): BuiltInWidget | null {
  if (!layoutI.startsWith('builtin:')) return null;
  return BUILT_IN_WIDGETS[layoutI.slice('builtin:'.length)] ?? null;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/widgets/StatsCountersWidget.tsx packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts
git commit -m "feat(admin): StatsCountersWidget — 4-counter row

Re-uses the same endpoints the legacy DashboardTab calls. Registered
in builtInCatalog under 'stats-counters' (default size 12x1)."
```

---

## Task 10: ServiceHealthWidget (built-in)

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/widgets/ServiceHealthWidget.tsx`
- Modify: `packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts` (register)

- [ ] **Step 1: Create the widget**

Lists every configured service from `/admin/services` and shows reachability + version. Uses the existing `/admin/services/:id/test` endpoint to ping each.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface Service { id: number; name: string; type: string; enabled: boolean }
interface HealthState { status: 'loading' | 'ok' | 'error'; version?: string; error?: string }

export function ServiceHealthWidget() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [health, setHealth] = useState<Record<number, HealthState>>({});

  useEffect(() => {
    let cancelled = false;
    api.get<Service[]>('/admin/services')
      .then(({ data }) => { if (!cancelled) setServices(data.filter((s) => s.enabled)); })
      .catch(() => { if (!cancelled) setServices([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!services) return;
    setHealth(Object.fromEntries(services.map((s) => [s.id, { status: 'loading' as const }])));
    services.forEach((s) => {
      api.post<{ ok: boolean; version?: string }>(`/admin/services/${s.id}/test`)
        .then(({ data }) => {
          setHealth((h) => ({ ...h, [s.id]: { status: data.ok ? 'ok' : 'error', version: data.version, error: data.ok ? undefined : 'Unreachable' } }));
        })
        .catch((err) => {
          setHealth((h) => ({ ...h, [s.id]: { status: 'error', error: (err as Error).message } }));
        });
    });
  }, [services]);

  const sorted = useMemo(() => services ? [...services].sort((a, b) => a.name.localeCompare(b.name)) : [], [services]);

  if (!services) return <p className="text-xs text-ndp-text-dim">Loading…</p>;
  if (services.length === 0) return <p className="text-xs text-ndp-text-dim">No services configured.</p>;

  return (
    <ul className="space-y-2">
      {sorted.map((s) => {
        const h = health[s.id];
        return (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ndp-text">{s.name}</p>
              <p className="text-[11px] text-ndp-text-dim uppercase">{s.type}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {h?.status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-ndp-text-dim" />}
              {h?.status === 'ok' && <><CheckCircle2 className="h-3.5 w-3.5 text-ndp-success" /><span className="text-ndp-text-dim">{h.version || 'OK'}</span></>}
              {h?.status === 'error' && <><AlertCircle className="h-3.5 w-3.5 text-ndp-danger" /><span className="text-ndp-danger">{h.error || 'Error'}</span></>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Register in the catalog**

Add the entry to `packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts` after the `stats-counters` entry:

```ts
import { ServiceHealthWidget } from './widgets/ServiceHealthWidget';
// ...
'service-health': {
  id: 'service-health',
  title: 'Service health',
  icon: 'Server',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 4, h: 2 },
  Component: ServiceHealthWidget,
},
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors. If the `/admin/services/:id/test` route exists with a different shape, adjust the typing of the response. (Look at `packages/backend/src/routes/admin/services/` to confirm.)

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/widgets/ServiceHealthWidget.tsx packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts
git commit -m "feat(admin): ServiceHealthWidget — reachability + version per service

Lists enabled services and pings each via /admin/services/:id/test.
Registered in builtInCatalog under 'service-health' (default 6x3)."
```

---

## Task 11: SystemWidget (built-in)

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/widgets/SystemWidget.tsx`
- Modify: `packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts` (register)

- [ ] **Step 1: Create the widget**

Surfaces Oscarr version (already exposed via `/api/app/version`) and the count of plugin updates available (already in `/api/plugins`).

```tsx
import { useEffect, useState } from 'react';
import { Sparkles, Plug, Info } from 'lucide-react';
import api from '@/lib/api';

interface VersionResp { version: string; latestVersion?: string; updateAvailable?: boolean }
interface PluginInfo { id: string; updateAvailable?: boolean }

export function SystemWidget() {
  const [v, setV] = useState<VersionResp | null>(null);
  const [pluginUpdates, setPluginUpdates] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<VersionResp>('/app/version').then(({ data }) => { if (!cancelled) setV(data); }).catch(() => {});
    api.get<PluginInfo[]>('/plugins').then(({ data }) => {
      if (cancelled) return;
      const list = Array.isArray(data) ? data : [];
      setPluginUpdates(list.filter((p) => p.updateAvailable).length);
    }).catch(() => { if (!cancelled) setPluginUpdates(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
        <Info className="h-5 w-5 text-ndp-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ndp-text-dim">Oscarr version</p>
          <p className="font-mono text-sm text-ndp-text">{v?.version ?? '—'}</p>
        </div>
        {v?.updateAvailable && (
          <span className="rounded-full bg-ndp-accent/20 px-2 py-0.5 text-[11px] font-medium text-ndp-accent">
            {v.latestVersion} available
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
        <Plug className="h-5 w-5 text-ndp-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ndp-text-dim">Plugin updates</p>
          <p className="text-sm text-ndp-text">{pluginUpdates ?? '—'}</p>
        </div>
        {pluginUpdates && pluginUpdates > 0 ? (
          <Sparkles className="h-4 w-4 text-ndp-accent" />
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register in the catalog**

Add to `builtInCatalog.ts`:

```ts
import { SystemWidget } from './widgets/SystemWidget';
// ...
'system': {
  id: 'system',
  title: 'System',
  icon: 'Info',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 4, h: 2 },
  Component: SystemWidget,
},
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors. If `/api/app/version` returns a different shape than `{ version, latestVersion, updateAvailable }`, adjust `VersionResp` to match the existing route at `packages/backend/src/routes/app.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/widgets/SystemWidget.tsx packages/frontend/src/pages/admin/dashboard/builtInCatalog.ts
git commit -m "feat(admin): SystemWidget — Oscarr version + plugin update count

Reads /api/app/version (existing) and /api/plugins (existing). Registered
in builtInCatalog under 'system' (default 6x3)."
```

---

## Task 12: WidgetPickerModal

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/WidgetPickerModal.tsx`

- [ ] **Step 1: Create the modal**

Lists built-in widgets from the catalog and plugin contributions from `usePluginUI('admin.dashboard.widget')`. Filter chips, greys out widgets already on the dashboard, calls `onPick` on click.

```tsx
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { usePluginUI } from '@/plugins/usePlugins';
import { BUILT_IN_WIDGETS } from './builtInCatalog';

interface PickerEntry {
  layoutI: string;            // e.g. 'builtin:stats-counters' or 'plugin:tautulli:weekly-stats'
  source: 'built-in' | 'plugin';
  title: string;
  icon?: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (entry: PickerEntry) => void;
  alreadyOnDashboard: Set<string>;   // set of layout 'i'
}

type Filter = 'all' | 'built-in' | 'plugin';

export function WidgetPickerModal({ open, onClose, onPick, alreadyOnDashboard }: Props) {
  const { contributions } = usePluginUI('admin.dashboard.widget');
  const [filter, setFilter] = useState<Filter>('all');

  const entries = useMemo<PickerEntry[]>(() => {
    const builtIn: PickerEntry[] = Object.values(BUILT_IN_WIDGETS).map((w) => ({
      layoutI: `builtin:${w.id}`,
      source: 'built-in',
      title: w.title,
      icon: w.icon,
      defaultSize: w.defaultSize,
      minSize: w.minSize,
    }));
    const plugin: PickerEntry[] = contributions.map((c) => {
      const props = c.props as { id: string; title: string; icon?: string; defaultSize: { w: number; h: number }; minSize?: { w: number; h: number } };
      return {
        layoutI: `plugin:${c.pluginId}:${props.id}`,
        source: 'plugin',
        title: props.title,
        icon: props.icon,
        defaultSize: props.defaultSize,
        minSize: props.minSize,
      };
    });
    return [...builtIn, ...plugin];
  }, [contributions]);

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.source === filter);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="text-base font-semibold text-ndp-text">Add widget</h3>
          <button onClick={onClose} className="rounded p-1 text-ndp-text-dim hover:bg-white/5 hover:text-ndp-text" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 border-b border-white/5 px-4 py-2">
          {(['all', 'built-in', 'plugin'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-ndp-accent text-white' : 'bg-white/5 text-ndp-text-dim hover:text-ndp-text'}`}
            >
              {f === 'all' ? 'All' : f === 'built-in' ? 'Built-in' : 'Plugins'}
            </button>
          ))}
        </div>
        <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {filtered.map((e) => {
            const taken = alreadyOnDashboard.has(e.layoutI);
            return (
              <li key={e.layoutI}>
                <button
                  onClick={() => { if (!taken) { onPick(e); onClose(); } }}
                  disabled={taken}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${taken ? 'opacity-40' : 'hover:bg-white/5'}`}
                >
                  {e.icon && <DynamicIcon name={e.icon} className="h-4 w-4 text-ndp-text-dim" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ndp-text">{e.title}</p>
                    <p className="text-[11px] text-ndp-text-dim">
                      {e.source === 'built-in' ? 'Built-in' : 'Plugin'} · {e.defaultSize.w}×{e.defaultSize.h}
                    </p>
                  </div>
                  {taken && <span className="text-[11px] text-ndp-text-dim">On dashboard</span>}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-ndp-text-dim">No widgets available.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/WidgetPickerModal.tsx
git commit -m "feat(admin): WidgetPickerModal — pick built-in + plugin widgets

Lists built-in catalog entries and admin.dashboard.widget plugin
contributions, with [All/Built-in/Plugins] filter. Greys out widgets
already on the dashboard."
```

---

## Task 13: DashboardGrid orchestrator

**Files:**
- Create: `packages/frontend/src/pages/admin/dashboard/DashboardGrid.tsx`

- [ ] **Step 1: Create the orchestrator**

This is the largest piece — wires `react-grid-layout`, edit mode, save flow, ghost-widget handling, and the picker.

```tsx
import { useMemo, useState } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardLayout, type DashboardLayout, type LayoutItem } from './useDashboardLayout';
import { WidgetChrome } from './WidgetChrome';
import { WidgetPickerModal } from './WidgetPickerModal';
import { BUILT_IN_WIDGETS, getBuiltInWidget } from './builtInCatalog';
import { PluginWidget, parsePluginLayoutI } from './PluginWidget';
import { usePluginUI } from '@/plugins/usePlugins';

const ResponsiveGridLayout = WidthProvider(Responsive);
const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 80;

interface RenderableItem extends LayoutItem {
  title: string;
  icon?: string;
  body: React.ReactNode;
  ghost: boolean;     // true = source disappeared (plugin disabled, etc.)
}

export function DashboardGrid() {
  const { layout, loading, error, save, reset } = useDashboardLayout();
  const { contributions } = usePluginUI('admin.dashboard.widget');
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const current = editMode ? (draft ?? layout) : layout;

  const renderables = useMemo<RenderableItem[]>(() => {
    if (!current) return [];
    return current.items.map((item): RenderableItem => {
      const builtIn = getBuiltInWidget(item.i);
      if (builtIn) {
        const Body = builtIn.Component;
        return { ...item, title: builtIn.title, icon: builtIn.icon, body: <Body />, ghost: false };
      }
      const parsed = parsePluginLayoutI(item.i);
      if (parsed) {
        const contribution = contributions.find(
          (c) => c.pluginId === parsed.pluginId && (c.props as { id?: string })?.id === parsed.widgetId,
        );
        if (!contribution) {
          return {
            ...item,
            title: 'Widget unavailable',
            icon: 'AlertTriangle',
            body: <p className="text-xs text-ndp-text-dim">Plugin disabled or removed.</p>,
            ghost: true,
          };
        }
        const props = contribution.props as { title: string; icon?: string };
        return {
          ...item,
          title: props.title,
          icon: props.icon,
          body: <PluginWidget layoutI={item.i} />,
          ghost: false,
        };
      }
      return { ...item, title: item.i, body: <p className="text-xs text-ndp-text-dim">Unknown widget id</p>, ghost: true };
    });
  }, [current, contributions]);

  const enterEdit = () => { setDraft(layout); setEditMode(true); };
  const cancel = () => { setDraft(null); setEditMode(false); };

  const onLayoutChange = (next: Layout[]) => {
    if (!editMode || !draft) return;
    const items: LayoutItem[] = next.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
    setDraft({ ...draft, items });
  };

  const removeItem = (i: string) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((it) => it.i !== i) });
  };

  const onSave = async () => {
    if (!draft) return;
    await save(draft);
    setDraft(null);
    setEditMode(false);
  };

  const addPicked = (entry: { layoutI: string; defaultSize: { w: number; h: number }; minSize?: { w: number; h: number } }) => {
    if (!draft) return;
    const maxY = draft.items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    setDraft({
      ...draft,
      items: [...draft.items, { i: entry.layoutI, x: 0, y: maxY, w: entry.defaultSize.w, h: entry.defaultSize.h }],
    });
  };

  const onReset = async () => {
    if (!confirm('Reset to default layout?')) return;
    await reset();
    setDraft(null);
    setEditMode(false);
  };

  if (loading) return <p className="text-sm text-ndp-text-dim">Loading dashboard…</p>;
  if (error) return <p className="text-sm text-ndp-danger">Failed to load layout: {error}</p>;
  if (!current) return null;

  const alreadyOnDashboard = new Set(current.items.map((it) => it.i));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {!editMode ? (
          <>
            <button onClick={enterEdit} className="btn-secondary inline-flex items-center gap-2 text-sm">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button onClick={onReset} className="btn-secondary inline-flex items-center gap-2 text-sm" title="Reset to default">
              <RotateCcw className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setPickerOpen(true)} className="btn-secondary inline-flex items-center gap-2 text-sm">
              <Plus className="h-4 w-4" /> Add widget
            </button>
            <button onClick={cancel} className="btn-secondary inline-flex items-center gap-2 text-sm">
              <X className="h-4 w-4" /> Cancel
            </button>
            <button onClick={onSave} className="btn-primary inline-flex items-center gap-2 text-sm">
              <Save className="h-4 w-4" /> Save
            </button>
          </>
        )}
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: renderables, md: renderables, sm: renderables, xs: renderables, xxs: renderables }}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        {renderables.map((r) => (
          <div key={r.i}>
            <WidgetChrome
              title={r.title}
              icon={r.icon}
              editMode={editMode}
              onRemove={editMode ? () => removeItem(r.i) : undefined}
            >
              {r.body}
            </WidgetChrome>
          </div>
        ))}
      </ResponsiveGridLayout>

      <WidgetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addPicked}
        alreadyOnDashboard={alreadyOnDashboard}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors. If `react-grid-layout`'s exported types differ in your version, adjust the `Layout` import accordingly (look at `node_modules/react-grid-layout/lib/index.d.ts`).

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/admin/dashboard/DashboardGrid.tsx
git commit -m "feat(admin): DashboardGrid — drag/drop grid with edit mode

Wires react-grid-layout to useDashboardLayout. Edit mode toggles drag
handles + add/remove + save/cancel. Ghost widgets show a placeholder
when their source (plugin or built-in) is missing."
```

---

## Task 14: Wire DashboardGrid into DashboardTab

**Files:**
- Modify: `packages/frontend/src/pages/admin/DashboardTab.tsx` (replace contents)

- [ ] **Step 1: Replace DashboardTab body**

Read the current file first so you preserve any non-content imports/props that are needed:

```bash
cat packages/frontend/src/pages/admin/DashboardTab.tsx
```

Then rewrite it as:

```tsx
import { useTranslation } from 'react-i18next';
import { AdminTabLayout } from './AdminTabLayout';
import { DashboardGrid } from './dashboard/DashboardGrid';

export function DashboardTab() {
  const { t } = useTranslation();
  return (
    <AdminTabLayout
      title={t('admin.dashboard.title', 'Dashboard')}
      description={t('admin.dashboard.description', 'Compose your admin dashboard with built-in and plugin widgets.')}
    >
      <DashboardGrid />
    </AdminTabLayout>
  );
}
```

(If `AdminTabLayout` takes different props in your codebase, check the existing usage in another tab like `BlacklistTab.tsx` and match it.)

- [ ] **Step 2: Typecheck the frontend**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Manual verification**

1. Start the full stack: `npm run dev` from the repo root.
2. Open the app, log in as admin, go to **Admin → Dashboard**.
3. The 3 default widgets render: stats counters (top row), service health (left), system (right).
4. Click **Edit** → drag handles appear, you can move/resize widgets.
5. Click **Add widget** → modal opens with the 3 built-in entries; the ones already on the dashboard are greyed.
6. Click **Save** → reload the page, layout persists.
7. Click **Edit** → **Cancel** → the layout reverts.
8. Click the **reset** button (next to Edit, in view mode) → confirm → defaults restored.
9. Resize the browser to mobile → widgets stack vertically, no Edit/Cancel/Save buttons available (the toolbar is still visible but buttons remain functional; the grid simply uses 2 cols on the smallest breakpoint).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/admin/DashboardTab.tsx
git commit -m "feat(admin): replace static DashboardTab with composable widget grid

DashboardTab now hosts <DashboardGrid /> — admins drag/drop widgets,
add/remove via the picker, persist via /api/admin/dashboard-layout."
```

---

## Task 15: Update plugin docs with the new hook point

**Files:**
- Modify: `docs/plugins.md` (find the UI hook points section and append)

- [ ] **Step 1: Locate the UI hook points section**

```bash
grep -n "hookPoint\|admin.tabs\|nav" docs/plugins.md | head -10
```

Identify where existing hook points are documented (likely a section listing `nav`, `admin.tabs`, `header.actions`, `avatar.menu`).

- [ ] **Step 2: Add the new hook point documentation**

Append a new entry alongside the others:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/plugins.md
git commit -m "docs(plugins): document admin.dashboard.widget hook point

Manifest example, props schema table, frontend contract."
```

---

## End-of-plan manual verification

After all 15 tasks are committed, run this end-to-end smoke pass before merging:

1. **Fresh DB scenario:** wipe `packages/backend/data/oscarr.db` (or use a clean container). Boot. Visit Admin → Dashboard. The 3 default widgets render without any DB row in `AppSettings.adminDashboardLayout` (defaults served by GET).

2. **Persistence:** edit + drag + save. Reload. Layout persisted.

3. **Reset:** click reset. Defaults restored, DB column cleared (verify with `sqlite3 packages/backend/data/oscarr.db "SELECT adminDashboardLayout FROM AppSettings WHERE id=1"` → null).

4. **Plugin contribution end-to-end:** install or symlink any plugin (e.g. existing `tautulli-insights`) and have it temporarily declare a `admin.dashboard.widget` contribution in its manifest with a stub component. Reload Oscarr. The picker shows the widget. Add it. Save. Reload. The widget renders.

5. **Ghost widget:** with the plugin widget on the dashboard, disable the plugin from Admin → Plugins. Go back to Dashboard. The widget shows the "Plugin disabled or removed" placeholder. Edit → Remove → Save. The placeholder is gone.

6. **Bad manifest:** malform the plugin's widget props (e.g. `id: "BAD UPPER"`). Install/load. Plugin should be marked `error` in Admin → Plugins, and the widget should not appear in the picker.

7. **Mobile:** open the dashboard on a < 768px viewport. Widgets stack vertically by `(y, x)`. Editing remains available but lower-fidelity.

If all 7 pass, the feature is done.
