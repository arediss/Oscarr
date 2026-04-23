import { useRef } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';

/** Thin wrapper around @tanstack/react-virtual with Oscarr-specific defaults: scroll inherits
 *  from the page root (so the browser's own scrollbar drives the list), sensible overscan, and
 *  a `measureElement` hook for variable-height rows.
 *
 *  Pattern:
 *    const { parentRef, rowVirtualizer, items } = useVirtualList({ count, estimateSize: 80 });
 *    return (
 *      <div ref={parentRef} style={{ height: '70dvh', overflow: 'auto' }}>
 *        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
 *          {items.map(v => (
 *            <div key={v.key} ref={rowVirtualizer.measureElement}
 *                 data-index={v.index}
 *                 style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${v.start}px)` }}>
 *              {renderRow(data[v.index])}
 *            </div>
 *          ))}
 *        </div>
 *      </div>
 *    ); */
export interface UseVirtualListOptions {
  count: number;
  /** Height estimate in px — doesn't need to be exact, measureElement corrects on first paint. */
  estimateSize: number;
  /** Rows rendered outside the viewport to reduce flicker during fast scroll. Default 5. */
  overscan?: number;
}

export interface UseVirtualListResult {
  parentRef: React.RefObject<HTMLDivElement | null>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  items: ReturnType<Virtualizer<HTMLDivElement, Element>['getVirtualItems']>;
}

export function useVirtualList({ count, estimateSize, overscan = 5 }: UseVirtualListOptions): UseVirtualListResult {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });
  return { parentRef, rowVirtualizer, items: rowVirtualizer.getVirtualItems() };
}
