import type { ReactNode } from 'react';
import { Component as ReactComponent } from 'react';
import { GripVertical, X } from 'lucide-react';

interface WidgetChromeProps {
  title: string;
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

export function WidgetChrome({ title, editMode, onRemove, children }: WidgetChromeProps) {
  return (
    <div className="relative h-full">
      <WidgetErrorBoundary>{children}</WidgetErrorBoundary>
      {editMode && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-xl outline outline-1 outline-dashed outline-white/20" />
          <span
            className="widget-drag-handle absolute top-1 left-1 z-10 inline-flex h-6 w-6 cursor-move items-center justify-center rounded-md bg-black/60 text-ndp-text-dim backdrop-blur-sm hover:text-ndp-text"
            title={`Drag ${title}`}
            aria-label={`Drag ${title}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          {onRemove && (
            <button
              onClick={onRemove}
              className="absolute top-1 right-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-ndp-text-dim backdrop-blur-sm hover:bg-ndp-danger/80 hover:text-white"
              title={`Remove ${title}`}
              aria-label={`Remove ${title}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
