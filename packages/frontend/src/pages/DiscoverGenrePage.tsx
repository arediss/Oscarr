import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import MediaGrid from '@/components/MediaGrid';
import { ALL_GENRES } from '@/components/GenreRow';
import type { TmdbMedia } from '@/types';

export default function DiscoverGenrePage() {
  const { mediaType, genreId } = useParams<{ mediaType: string; genreId: string }>();
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const gid = parseInt(genreId || '0');
  const genre = ALL_GENRES.find((g) => g.id === gid && g.mediaType === mediaType);
  const genreName = genre?.name || 'Genre inconnu';

  useEffect(() => {
    setResults([]);
    setPage(1);
    setLoading(true);

    api.get(`/tmdb/discover/${mediaType}/genre/${genreId}?page=1`).then(({ data }) => {
      setResults(data.results.map((r: TmdbMedia) => ({ ...r, media_type: mediaType })));
      setTotalPages(data.total_pages);
    }).catch((err) => {
      console.error('Failed to discover:', err);
    }).finally(() => setLoading(false));
  }, [mediaType, genreId]);

  const loadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const { data } = await api.get(`/tmdb/discover/${mediaType}/genre/${genreId}?page=${nextPage}`);
      setResults((prev) => [...prev, ...data.results.map((r: TmdbMedia) => ({ ...r, media_type: mediaType }))]);
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="p-2 glass rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div>
          <p className="text-xs text-ndp-accent uppercase tracking-wider font-semibold">
            {mediaType === 'movie' ? 'Films' : 'Séries'}
          </p>
          <h1 className="text-2xl font-bold text-ndp-text">{genreName}</h1>
        </div>
      </div>

      {/* Results grid */}
      <MediaGrid media={results} loading={loading} />

      {/* Load more */}
      {!loading && page < totalPages && (
        <div className="flex justify-center mt-8">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="btn-secondary flex items-center gap-2"
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Charger plus
          </button>
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="text-center py-20">
          <p className="text-ndp-text-muted text-lg">Aucun résultat pour ce genre</p>
        </div>
      )}
    </div>
  );
}
