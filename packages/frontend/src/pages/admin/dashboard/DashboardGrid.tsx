import { useMemo, useState } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardLayout, type DashboardLayout, type LayoutItem } from './useDashboardLayout';
import { WidgetChrome } from './WidgetChrome';
import { WidgetPickerModal } from './WidgetPickerModal';
import { getBuiltInWidget } from './builtInCatalog';
import { PluginWidget, parsePluginLayoutI } from './PluginWidget';
import { usePluginUI } from '@/plugins/usePlugins';

const ResponsiveGridLayout = WidthProvider(Responsive);
const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 50;

interface RenderableItem extends LayoutItem {
  title: string;
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
        return { ...item, title: builtIn.title, body: <Body />, ghost: false };
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
            body: <p className="text-xs text-ndp-text-dim">Plugin disabled or removed.</p>,
            ghost: true,
          };
        }
        const props = contribution.props as { title: string };
        return {
          ...item,
          title: props.title,
          body: <PluginWidget pluginId={parsed.pluginId} widgetId={parsed.widgetId} contribution={contribution} />,
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
      <div className="flex items-center justify-end gap-1.5">
        {!editMode ? (
          <>
            <button
              onClick={enterEdit}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-ndp-surface-light px-2.5 py-1 text-xs font-medium text-ndp-text hover:bg-ndp-surface-hover"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={onReset}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/5 bg-ndp-surface-light text-ndp-text hover:bg-ndp-surface-hover"
              title="Reset to default"
              aria-label="Reset to default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-ndp-surface-light px-2.5 py-1 text-xs font-medium text-ndp-text hover:bg-ndp-surface-hover"
            >
              <Plus className="h-3.5 w-3.5" /> Add widget
            </button>
            <button
              onClick={cancel}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-ndp-surface-light px-2.5 py-1 text-xs font-medium text-ndp-text hover:bg-ndp-surface-hover"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              onClick={onSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-ndp-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-ndp-accent-hover"
            >
              <Save className="h-3.5 w-3.5" /> Save
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
