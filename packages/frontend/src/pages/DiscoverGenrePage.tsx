import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import MediaCard, { MediaCardSkeleton } from '@/components/MediaCard';
import { MOVIE_GENRES, TV_GENRES } from '@/components/GenreRow';
import type { TmdbMedia } from '@/types';

export default function DiscoverGenrePage() {
  const { mediaType, genreId } = useParams<{ mediaType: string; genreId: string }>();
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const allGenres = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const genre = allGenres.find((g) => g.id === parseInt(genreId || '0'));
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
        {loading
          ? Array.from({ length: 14 }).map((_, i) => <MediaCardSkeleton key={i} />)
          : results.map((media) => (
              <MediaCard key={`${media.media_type}-${media.id}`} media={media} />
            ))}
      </div>

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
