import { useState } from 'react';
import { X } from 'lucide-react';
import { useModal } from '@/hooks/useModal';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { IconPicker } from './IconPicker';
import type { LayoutItem } from './useDashboardLayout';

interface Props {
  item: LayoutItem;
  defaultTitle: string;
  onSave: (next: Pick<LayoutItem, 'customTitle' | 'customIcon' | 'showTitle'>) => void;
  onClose: () => void;
}

export function WidgetEditModal({ item, defaultTitle, onSave, onClose }: Props) {
  const { dialogRef, titleId } = useModal({ open: true, onClose });
  const [title, setTitle] = useState(item.customTitle ?? '');
  const [icon, setIcon] = useState<string | undefined>(item.customIcon);
  const [showTitle, setShowTitle] = useState(item.showTitle ?? false);

  const submit = () => {
    onSave({
      customTitle: title.trim() || undefined,
      customIcon: icon,
      showTitle: showTitle || undefined,
    });
    onClose();
  };

  const reset = () => {
    setTitle('');
    setIcon(undefined);
    setShowTitle(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-md shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <h2 id={titleId} className="text-base font-semibold text-ndp-text">Customize widget</h2>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="text-xs text-ndp-text-dim">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
              maxLength={80}
              className="input w-full text-sm mt-1"
            />
            <p className="text-[11px] text-ndp-text-dim mt-1">Leave empty to use the widget's default title.</p>
          </div>

          <div>
            <label className="text-xs text-ndp-text-dim">Icon</label>
            <div className="mt-1">
              <IconPicker
                value={icon}
                onChange={setIcon}
                trigger={
                  <button className="inline-flex items-center gap-2 rounded-md border border-white/5 bg-ndp-surface-light px-3 py-1.5 text-sm text-ndp-text hover:bg-ndp-surface-hover">
                    {icon ? <DynamicIcon name={icon} className="h-4 w-4" /> : <span className="text-ndp-text-dim">No icon</span>}
                    {icon && <span className="text-xs text-ndp-text-dim">{icon}</span>}
                  </button>
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-ndp-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTitle}
              onChange={(e) => setShowTitle(e.target.checked)}
              className="h-4 w-4 rounded border-white/10 bg-ndp-surface-light text-ndp-accent focus:ring-ndp-accent/50"
            />
            Show header bar even without a custom title
          </label>

          <div className="flex justify-between gap-2 pt-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-ndp-surface-light px-3 py-1.5 text-xs font-medium text-ndp-text-dim hover:bg-ndp-surface-hover hover:text-ndp-text"
            >
              Use defaults
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-ndp-surface-light px-3 py-1.5 text-xs font-medium text-ndp-text hover:bg-ndp-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="inline-flex items-center gap-1.5 rounded-md bg-ndp-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-ndp-accent-hover"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
