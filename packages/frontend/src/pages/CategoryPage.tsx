import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import MediaGrid from '@/components/MediaGrid';
import FilterBar, { DEFAULT_FILTERS, type FilterValues } from '@/components/FilterBar';
import { useMediaStatus } from '@/hooks/useMediaStatus';
import type { TmdbMedia } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();

interface CategoryDef {
  titleKey: string;
  mediaType: 'movie' | 'tv' | 'all';
  genreId: number;
  defaultFilters?: Partial<FilterValues>;
  originCountry?: string;
  keyword?: number;
}

const CATEGORIES: Record<string, CategoryDef> = {
  trending: {
    titleKey: 'category.trending',
    mediaType: 'all',
    genreId: 0,
  },
  'movies-popular': {
    titleKey: 'category.popular_movies',
    mediaType: 'movie',
    genreId: 0,
  },
  'tv-popular': {
    titleKey: 'category.popular_series',
    mediaType: 'tv',
    genreId: 0,
  },
  'movies-upcoming': {
    titleKey: 'category.coming_soon',
    mediaType: 'movie',
    genreId: 0,
    defaultFilters: {
      releaseYear: CURRENT_YEAR,
      sortBy: 'primary_release_date.asc',
    },
  },
  'anime-trending': {
    titleKey: 'category.trending_anime',
    mediaType: 'tv',
    genreId: 16, // Animation
    keyword: 210024, // TMDB "anime" keyword
  },
};

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

function buildFilterParams(f: FilterValues, cat: CategoryDef): string {
  const params = new URLSearchParams();
  if (f.sortBy && f.sortBy !== 'popularity.desc') params.set('sortBy', f.sortBy);
  if (f.voteAverageGte > 0) params.set('voteAverageGte', String(f.voteAverageGte));
  if (f.releaseYear != null) {
    params.set('releaseDateGte', `${f.releaseYear}-01-01`);
    params.set('releaseDateLte', `${f.releaseYear}-12-31`);
  }
  if (cat.originCountry) params.set('originCountry', cat.originCountry);
  if (cat.keyword) params.set('keyword', String(cat.keyword));
  const str = params.toString();
  return str ? `&${str}` : '';
}

export default function CategoryPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const category = CATEGORIES[slug || ''];
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [filters, setFilters] = useState<FilterValues>({ ...DEFAULT_FILTERS });
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<number>());

  const abortRef = useRef<AbortController | null>(null);

  function dedup(items: TmdbMedia[]): TmdbMedia[] {
    return items.filter((item) => {
      if (seenIds.current.has(item.id)) return false;
      seenIds.current.add(item.id);
      return true;
    });
  }

  function buildUrl(pageNum: number, f: FilterValues): string {
    const fp = buildFilterParams(f, category!);
    return `/tmdb/discover/${category!.mediaType}/genre/${category!.genreId}?page=${pageNum}${fp}`;
  }

  const slugRef = useRef(slug);
  const filtersRef = useRef(filters);

  function fetchPage(f: FilterValues, isSlugChange: boolean) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTransitioning(false);
    if (isSlugChange) {
      setResults([]);
      setLoading(true);
    } else {
      setTransitioning(true);
    }
    setPage(1);
    seenIds.current = new Set();

    api.get(buildUrl(1, f), { signal: controller.signal }).then(({ data }) => {
      const items = dedup(data.results.map((r: TmdbMedia) => ({
        ...r,
        media_type: r.media_type || category!.mediaType || (r.title ? 'movie' : 'tv'),
      })));
      setResults(items);
      setTotalPages(Math.min(data.total_pages, 20));
    }).catch((err) => {
      if (!controller.signal.aborted) console.error('Failed to fetch category:', err);
    }).finally(() => {
      if (!controller.signal.aborted) { setLoading(false); setTransitioning(false); }
    });
    return () => controller.abort();
  }

  // Slug change: reset filters + fetch
  useEffect(() => {
    if (!category) return;
    const effectiveFilters = { ...DEFAULT_FILTERS, ...category.defaultFilters };
    filtersRef.current = effectiveFilters;
    setFilters(effectiveFilters);
    slugRef.current = slug;
    return fetchPage(effectiveFilters, true);
  }, [slug]);

  // Filter change (user interaction only, not from slug reset)
  useEffect(() => {
    if (!category || slugRef.current !== slug) return;
    if (filtersRef.current === filters) return;
    filtersRef.current = filters;
    return fetchPage(filters, false);
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (!category || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const { data } = await api.get(buildUrl(nextPage, filters));
      const items = dedup(data.results.map((r: TmdbMedia) => ({
        ...r,
        media_type: r.media_type || category.mediaType || (r.title ? 'movie' : 'tv'),
      })));
      setResults((prev) => [...prev, ...items]);
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [category, loadingMore, page, totalPages, filters]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Client-side "hide requested" filter (only one that needs status data)
  const statuses = useMediaStatus(results);
  const displayResults = useMemo(() => {
    if (!filters.hideRequested) return results;
    return results.filter(item => {
      const type = item.media_type || (item.title ? 'movie' : 'tv');
      const key = `${type}:${item.id}`;
      if (!(key in statuses)) return false; // status not loaded yet — hide to prevent flash
      return statuses[key].status === 'unknown';
    });
  }, [results, filters.hideRequested, statuses]);

  if (!category) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-20 text-center">
        <p className="text-ndp-text-muted text-lg">{t('category.not_found')}</p>
        <Link to="/" className="btn-primary inline-block mt-4">{t('category.back_home')}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 pt-4 pb-16">
      <FilterBar
        filters={filters}
        onChange={setFilters}
        sortOptions={category.mediaType === 'tv' ? SORT_OPTIONS_TV : SORT_OPTIONS_MOVIE}
        title={t(category.titleKey)}
        backButton={
          <Link to="/" className="p-2 glass rounded-xl hover:bg-white/10 transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
        }
      />

      <div className={clsx('transition-opacity duration-300', transitioning && 'opacity-40 pointer-events-none')}>
        <MediaGrid media={displayResults} loading={loading} skeletonCount={21} />
      </div>

      {!loading && page < totalPages && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore && <Loader2 className="w-6 h-6 text-ndp-accent animate-spin" />}
        </div>
      )}
    </div>
  );
}
