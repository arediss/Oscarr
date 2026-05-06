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

export function WidgetPickerModal({ open, onClose, onPick, alreadyOnDashboard }: Readonly<Props>) {
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
