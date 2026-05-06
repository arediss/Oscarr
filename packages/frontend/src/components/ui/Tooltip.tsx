import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  /** Allow the label to wrap and grow to a comfortable width. Defaults to false (single-line). */
  multiline?: boolean;
}

interface Position {
  top: number;
  left: number;
}

/** Hover-triggered tooltip rendered via a portal to document.body so it escapes any clipping
 *  ancestor (cards with overflow:hidden, transformed parents, stacking contexts). */
export function Tooltip({ label, children, disabled, side = 'bottom', className, multiline = false }: TooltipProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);

  const recalc = useCallback(() => {
    const trigger = triggerRef.current;
    const tip = tooltipRef.current;
    if (!trigger || !tip) return;
    const tr = trigger.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const centerX = tr.left + tr.width / 2;
    const top = side === 'bottom' ? tr.bottom + 6 : tr.top - tipRect.height - 6;
    const left = centerX - tipRect.width / 2;
    // Clamp to viewport so the tip doesn't slide off-screen on edge-of-viewport triggers.
    const margin = 8;
    const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
    setPos({ top, left: clampedLeft });
  }, [side]);

  useEffect(() => {
    if (!open) return;
    recalc();
    const handler = () => recalc();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, recalc]);

  const show = () => { if (!disabled) setOpen(true); };
  const hide = () => setOpen(false);

  return (
    <>
      <div
        ref={triggerRef}
        className={clsx('relative', className)}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {open && !disabled && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          style={pos ? { top: pos.top, left: pos.left } : { opacity: 0 }}
          className={clsx(
            'pointer-events-none fixed px-2 py-1 rounded-md bg-ndp-surface border border-white/10 text-xs text-ndp-text shadow-lg shadow-black/40 z-[1000]',
            'transition-opacity duration-100',
            multiline ? 'whitespace-normal w-max max-w-[16rem] text-left leading-snug' : 'whitespace-nowrap',
            pos ? 'opacity-100' : 'opacity-0',
          )}
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}
