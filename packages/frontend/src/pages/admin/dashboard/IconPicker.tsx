import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban } from 'lucide-react';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { DASHBOARD_ICONS } from './dashboardIcons';

interface Props {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  trigger: React.ReactNode;
}

export function IconPicker({ value, onChange, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popW = 256;
    const popH = 280;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (top + popH > window.innerHeight - 8) top = rect.top - popH - 4;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <>
      <span ref={triggerRef} onClick={() => setOpen((o) => !o)} className="inline-flex">{trigger}</span>
      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[60] w-64 rounded-lg border border-white/10 bg-ndp-surface shadow-xl shadow-black/50 p-2"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="grid grid-cols-7 gap-1 max-h-64 overflow-auto">
            <button
              onClick={() => { onChange(undefined); setOpen(false); }}
              className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/5 ${!value ? 'bg-ndp-accent/15 text-ndp-accent' : 'text-ndp-text-dim'}`}
              title="No icon"
              aria-label="No icon"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
            {DASHBOARD_ICONS.map((name) => (
              <button
                key={name}
                onClick={() => { onChange(name); setOpen(false); }}
                className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/5 ${value === name ? 'bg-ndp-accent/15 text-ndp-accent' : 'text-ndp-text-dim'}`}
                title={name}
                aria-label={name}
              >
                <DynamicIcon name={name} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
