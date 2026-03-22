import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!category) return;
    setResults([]);
    setPage(1);
    setLoading(true);

    api.get(`${category.endpoint}?page=1`).then(({ data }) => {
      const items = data.results.map((r: TmdbMedia) => ({
        ...r,
        media_type: r.media_type || category.mediaType || (r.title ? 'movie' : 'tv'),
      }));
      setResults(items);
      setTotalPages(Math.min(data.total_pages, 20)); // TMDB caps at 500 pages but we limit
    }).catch((err) => {
      console.error('Failed to fetch category:', err);
    }).finally(() => setLoading(false));
  }, [slug]);

  const loadMore = async () => {
    if (!category || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const { data } = await api.get(`${category.endpoint}?page=${nextPage}`);
      const items = data.results.map((r: TmdbMedia) => ({
        ...r,
        media_type: r.media_type || category.mediaType || (r.title ? 'movie' : 'tv'),
      }));
      setResults((prev) => [...prev, ...items]);
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  };

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

      {!loading && page < totalPages && (
        <div className="flex justify-center mt-8">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="btn-secondary flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            Charger plus
          </button>
        </div>
      )}
    </div>
  );
}
