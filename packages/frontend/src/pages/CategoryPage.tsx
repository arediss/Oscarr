import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import MediaGrid from '@/components/MediaGrid';
import type { TmdbMedia } from '@/types';

const CATEGORIES: Record<string, { title: string; endpoint: string; mediaType: string }> = {
  trending: {
    title: 'Tendances de la semaine',
    endpoint: '/tmdb/trending',
    mediaType: '',
  },
  'movies-popular': {
    title: 'Films populaires',
    endpoint: '/tmdb/movies/popular',
    mediaType: 'movie',
  },
  'tv-popular': {
    title: 'Séries populaires',
    endpoint: '/tmdb/tv/popular',
    mediaType: 'tv',
  },
  'movies-upcoming': {
    title: 'Prochainement au cinéma',
    endpoint: '/tmdb/movies/upcoming',
    mediaType: 'movie',
  },
};

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const category = CATEGORIES[slug || ''];
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<number>());

  useEffect(() => {
    if (!category) return;
    setResults([]);
    setPage(1);
    setLoading(true);
    seenIds.current.clear();

    api.get(`${category.endpoint}?page=1`).then(({ data }) => {
      const items = dedup(data.results.map((r: TmdbMedia) => ({
        ...r,
        media_type: r.media_type || category.mediaType || (r.title ? 'movie' : 'tv'),
      })));
      setResults(items);
      setTotalPages(Math.min(data.total_pages, 20));
    }).catch((err) => {
      console.error('Failed to fetch category:', err);
    }).finally(() => setLoading(false));
  }, [slug]);

  function dedup(items: TmdbMedia[]): TmdbMedia[] {
    return items.filter((item) => {
      if (seenIds.current.has(item.id)) return false;
      seenIds.current.add(item.id);
      return true;
    });
  }

  const loadMore = useCallback(async () => {
    if (!category || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const { data } = await api.get(`${category.endpoint}?page=${nextPage}`);
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
  }, [category, loadingMore, page, totalPages]);

  // Infinite scroll via Intersection Observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  if (!category) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-20 text-center">
        <p className="text-ndp-text-muted text-lg">Catégorie introuvable</p>
        <Link to="/" className="btn-primary inline-block mt-4">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="p-2 glass rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <h1 className="text-2xl font-bold text-ndp-text">{category.title}</h1>
      </div>

      <MediaGrid media={results} loading={loading} skeletonCount={21} />

      {/* Infinite scroll sentinel */}
      {!loading && page < totalPages && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore && <Loader2 className="w-6 h-6 text-ndp-accent animate-spin" />}
        </div>
      )}
    </div>
  );
}
