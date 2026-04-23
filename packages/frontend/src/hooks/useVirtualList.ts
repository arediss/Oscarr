import { useRef } from 'react';
import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from '@tanstack/react-virtual';

/** Thin wrapper around @tanstack/react-virtual with two scroll modes:
 *
 *  - `mode: 'container'` (default) — the caller's `parentRef` element is the scroll viewport.
 *    Use when the list is inside a modal, dialog, or any bounded region with its own scroll.
 *    The wrapping div needs an explicit height (h-64, max-h-[70dvh], etc.).
 *
 *  - `mode: 'window'` — the browser window is the scroll viewport. No fixed height on the
 *    wrapper; the list flows naturally with the rest of the page content, and the browser's
 *    own scrollbar drives everything. Use when the list is the dominant content of the page
 *    (admin LogsTab, UsersTab, RequestsPage) and cutting it off inside a fixed-height box
 *    would feel abrupt. Caller must still pass a `parentRef` for `measureElement` to work. */
export interface UseVirtualListOptions {
  count: number;
  /** Height estimate in px — doesn't need to be exact, measureElement corrects on first paint. */
  estimateSize: number;
  /** Rows rendered outside the viewport to reduce flicker during fast scroll. Default 5. */
  overscan?: number;
  /** 'container' (default) = scroll inside parentRef; 'window' = scroll the browser window. */
  mode?: 'container' | 'window';
}

export interface UseVirtualListResult {
  parentRef: React.RefObject<HTMLDivElement | null>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element> | Virtualizer<Window, Element>;
  items: ReturnType<Virtualizer<HTMLDivElement, Element>['getVirtualItems']>;
}

export function useVirtualList({ count, estimateSize, overscan = 5, mode = 'container' }: UseVirtualListOptions): UseVirtualListResult {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const containerV = useVirtualizer({
    count: mode === 'container' ? count : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });
  const windowV = useWindowVirtualizer({
    count: mode === 'window' ? count : 0,
    estimateSize: () => estimateSize,
    overscan,
    // measureElement needs to know the parent's offset relative to the document so virtual
    // items' translateY values stay correct (parentRef sits somewhere below the admin topbar).
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });
  const rowVirtualizer = mode === 'window' ? windowV : containerV;
  return { parentRef, rowVirtualizer, items: rowVirtualizer.getVirtualItems() };
}
