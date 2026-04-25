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
  if (!editMode) {
    return (
      <div className="h-full">
        <WidgetErrorBoundary>{children}</WidgetErrorBoundary>
      </div>
    );
  }
  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="widget-drag-handle cursor-move text-ndp-text-dim hover:text-ndp-text">
          <GripVertical className="h-4 w-4" />
        </span>
        {icon && <DynamicIcon name={icon} className="h-4 w-4 text-ndp-text-dim" />}
        <h3 className="flex-1 truncate text-sm font-medium text-ndp-text">{title}</h3>
        {onRemove && (
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
