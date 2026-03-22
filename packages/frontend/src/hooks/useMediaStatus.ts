import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import type { TmdbMedia } from '@/types';

interface MediaStatus {
  status: string;
  requestStatus?: string;
}

type StatusMap = Record<string, MediaStatus>;

// Global cache to avoid redundant requests across components
const globalCache: StatusMap = {};
let pendingIds: { tmdbId: number; mediaType: string }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listeners: (() => void)[] = [];

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    const batch = [...pendingIds];
    pendingIds = [];
    flushTimer = null;

    if (batch.length === 0) return;

    // Deduplicate
    const unique = batch.filter((item, i, arr) =>
      arr.findIndex((b) => b.tmdbId === item.tmdbId && b.mediaType === item.mediaType) === i
    );

    // Only request ones we don't have cached
    const uncached = unique.filter((item) => !((`${item.mediaType}:${item.tmdbId}`) in globalCache));
    if (uncached.length === 0) return;

    try {
      const { data } = await api.post('/media/batch-status', { ids: uncached });
      Object.assign(globalCache, data);
      // Mark items not found as "unknown"
      for (const item of uncached) {
        const key = `${item.mediaType}:${item.tmdbId}`;
        if (!(key in globalCache)) {
          globalCache[key] = { status: 'unknown' };
        }
      }
      listeners.forEach((cb) => cb());
    } catch {
      // Silently fail
    }
  }, 150); // Debounce 150ms to batch requests
}

export function useMediaStatus(media: TmdbMedia[]): StatusMap {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const idRef = useRef(0);

  useEffect(() => {
    const currentId = ++idRef.current;

    const items = media
      .filter((m) => m.id && (m.media_type || m.title || m.name))
      .map((m) => ({
        tmdbId: m.id,
        mediaType: m.media_type || (m.title ? 'movie' : 'tv'),
      }));

    if (items.length === 0) return;

    // Add to pending batch
    pendingIds.push(...items);
    scheduleFlush();

    // Build initial state from cache
    const fromCache: StatusMap = {};
    for (const item of items) {
      const key = `${item.mediaType}:${item.tmdbId}`;
      if (key in globalCache) {
        fromCache[key] = globalCache[key];
      }
    }
    if (Object.keys(fromCache).length > 0) {
      setStatuses(fromCache);
    }

    // Listen for updates
    const listener = () => {
      if (currentId !== idRef.current) return;
      const updated: StatusMap = {};
      for (const item of items) {
        const key = `${item.mediaType}:${item.tmdbId}`;
        if (key in globalCache) {
          updated[key] = globalCache[key];
        }
      }
      setStatuses(updated);
    };

    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, [media]);

  return statuses;
}

export function getStatusForMedia(
  statuses: StatusMap,
  tmdbId: number,
  mediaType: string
): MediaStatus | null {
  return statuses[`${mediaType}:${tmdbId}`] || null;
}
