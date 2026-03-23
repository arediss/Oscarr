import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import MediaGrid from '@/components/MediaGrid';
import { ALL_GENRES } from '@/components/GenreRow';
import type { TmdbMedia } from '@/types';

export default function DiscoverGenrePage() {
  const { t } = useTranslation();
  const { mediaType, genreId } = useParams<{ mediaType: string; genreId: string }>();
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<number>());

  const gid = parseInt(genreId || '0');
  const genre = ALL_GENRES.find((g) => g.id === gid && g.mediaType === mediaType);
  const genreName = genre ? t(genre.nameKey) : t('genre.unknown');

  function dedup(items: TmdbMedia[]): TmdbMedia[] {
    return items.filter((item) => {
      if (seenIds.current.has(item.id)) return false;
      seenIds.current.add(item.id);
      return true;
    });
  }

  useEffect(() => {
    setResults([]);
    setPage(1);
    setLoading(true);
    seenIds.current.clear();

    api.get(`/tmdb/discover/${mediaType}/genre/${genreId}?page=1`).then(({ data }) => {
      setResults(dedup(data.results.map((r: TmdbMedia) => ({ ...r, media_type: mediaType }))));
      setTotalPages(data.total_pages);
    }).catch((err) => {
      console.error('Failed to discover:', err);
    }).finally(() => setLoading(false));
  }, [mediaType, genreId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const { data } = await api.get(`/tmdb/discover/${mediaType}/genre/${genreId}?page=${nextPage}`);
      const items = dedup(data.results.map((r: TmdbMedia) => ({ ...r, media_type: mediaType })));
      setResults((prev) => [...prev, ...items]);
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, totalPages, mediaType, genreId]);

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
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="p-2 glass rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div>
          <p className="text-xs text-ndp-accent uppercase tracking-wider font-semibold">
            {mediaType === 'movie' ? t('discover.movies') : t('discover.series')}
          </p>
          <h1 className="text-2xl font-bold text-ndp-text">{genreName}</h1>
        </div>
      </div>

      <MediaGrid media={results} loading={loading} />

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
