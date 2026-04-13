import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import MediaGrid from '@/components/MediaGrid';
import FilterBar, { DEFAULT_FILTERS, type FilterValues } from '@/components/FilterBar';
import { useMediaStatus } from '@/hooks/useMediaStatus';
import { ALL_GENRES } from '@/components/GenreRow';
import { buildDiscoverParams } from '@/utils/buildDiscoverParams';
import type { TmdbMedia } from '@/types';

const SORT_OPTIONS_MOVIE = [
  { value: 'popularity.desc', labelKey: 'filter.sort_popularity' },
  { value: 'vote_average.desc', labelKey: 'filter.sort_rating' },
  { value: 'primary_release_date.desc', labelKey: 'filter.sort_newest' },
  { value: 'primary_release_date.asc', labelKey: 'filter.sort_oldest' },
];

const SORT_OPTIONS_TV = [
  { value: 'popularity.desc', labelKey: 'filter.sort_popularity' },
  { value: 'vote_average.desc', labelKey: 'filter.sort_rating' },
  { value: 'first_air_date.desc', labelKey: 'filter.sort_newest' },
  { value: 'first_air_date.asc', labelKey: 'filter.sort_oldest' },
];


export default function DiscoverGenrePage() {
  const { t } = useTranslation();
  const { mediaType, genreId } = useParams<{ mediaType: string; genreId: string }>();
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({ ...DEFAULT_FILTERS });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<number>());

  const gid = parseInt(genreId || '0');
  const genre = ALL_GENRES.find((g) => g.id === gid && g.mediaType === mediaType);
  const genreName = genre ? t(genre.nameKey) : t('genre.unknown');

  const statuses = useMediaStatus(results);
  const filteredResults = useMemo(() => {
    if (!filters.hideRequested) return results;
    return results.filter(item => {
      const type = item.media_type || (item.title ? 'movie' : 'tv');
      const key = `${type}:${item.id}`;
      if (!(key in statuses)) return false;
      return statuses[key].status === 'unknown';
    });
  }, [results, filters.hideRequested, statuses]);

  function dedup(items: TmdbMedia[]): TmdbMedia[] {
    return items.filter((item) => {
      if (seenIds.current.has(item.id)) return false;
      seenIds.current.add(item.id);
      return true;
    });
  }

  const prevRouteRef = useRef(`${mediaType}:${genreId}`);

  useEffect(() => {
    const routeKey = `${mediaType}:${genreId}`;
    const isRouteChange = prevRouteRef.current !== routeKey;
    prevRouteRef.current = routeKey;

    if (isRouteChange) {
      setResults([]);
      setLoading(true);
    } else {
      setTransitioning(true);
    }
    setPage(1);
    seenIds.current.clear();
    const fp = buildDiscoverParams(filters);

    api.get(`/tmdb/discover/${mediaType}/genre/${genreId}?page=1${fp}`).then(({ data }) => {
      setResults(dedup(data.results.map((r: TmdbMedia) => ({ ...r, media_type: mediaType }))));
      setTotalPages(data.total_pages);
    }).catch((err) => {
      console.error('Failed to discover:', err);
    }).finally(() => { setLoading(false); setTransitioning(false); });
  }, [mediaType, genreId, filters]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const fp = buildDiscoverParams(filters);
    try {
      const { data } = await api.get(`/tmdb/discover/${mediaType}/genre/${genreId}?page=${nextPage}${fp}`);
      const items = dedup(data.results.map((r: TmdbMedia) => ({ ...r, media_type: mediaType })));
      setResults((prev) => [...prev, ...items]);
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, totalPages, mediaType, genreId, filters]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 pt-4 pb-16">
      <FilterBar
        filters={filters}
        onChange={setFilters}
        sortOptions={mediaType === 'movie' ? SORT_OPTIONS_MOVIE : SORT_OPTIONS_TV}
        title={genreName}
        subtitle={mediaType === 'movie' ? t('discover.movies') : t('discover.series')}
        backButton={
          <Link to="/" className="p-2 glass rounded-xl hover:bg-white/10 transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
        }
      />

      <div className={clsx('transition-opacity duration-300', transitioning && 'opacity-40 pointer-events-none')}>
        <MediaGrid media={filteredResults} loading={loading} />
      </div>

      {!loading && page < totalPages && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore && <Loader2 className="w-6 h-6 text-ndp-accent animate-spin" />}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="text-center py-20">
          <p className="text-ndp-text-muted text-lg">{t('discover.no_results')}</p>
        </div>
      )}
    </div>
  );
}
