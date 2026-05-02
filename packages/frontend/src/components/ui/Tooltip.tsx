import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface TooltipProps {
  label: string;
  children: ReactNode;
  /** Suppress the tooltip (e.g. while a dropdown is open and would overlap). */
  disabled?: boolean;
  /** Side the tooltip appears on. Defaults to bottom. */
  side?: 'top' | 'bottom';
  /** Extra classes for the wrapper (e.g. `flex-shrink-0` when nested in a flex row). */
  className?: string;
}

export function Tooltip({ label, children, disabled, side = 'bottom', className }: TooltipProps) {
  return (
    <div className={clsx('relative group', className)}>
      {children}
      {!disabled && (
        <span
          role="tooltip"
          className={clsx(
            'pointer-events-none absolute left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-ndp-surface border border-white/10 text-xs text-ndp-text whitespace-nowrap shadow-lg shadow-black/40 z-50',
            'opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-100',
            side === 'bottom'
              ? 'top-full mt-1.5 translate-y-1 group-hover:translate-y-0'
              : 'bottom-full mb-1.5 -translate-y-1 group-hover:translate-y-0',
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
