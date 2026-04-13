import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface CalendarItem {
  type: 'movie' | 'episode';
  title: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  date: string;
  tmdbId?: number;
  tvdbId?: number;
  poster: string | null;
  hasFile?: boolean;
  episodeCount?: number;
}

interface UseCalendarReturn {
  items: CalendarItem[];
  loading: boolean;
  error: Error | null;
}

export function useCalendar(days: number = 30): UseCalendarReturn {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get(`/services/calendar?days=${days}`)
      .then(({ data }) => setItems(data))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [days]);

  return { items, loading, error };
}
