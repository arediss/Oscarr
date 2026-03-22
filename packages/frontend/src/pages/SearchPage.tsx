import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import MediaCard, { MediaCardSkeleton } from '@/components/MediaCard';
import type { TmdbMedia } from '@/types';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/tmdb/search?q=${encodeURIComponent(q)}`);
      // Filter out people results
      setResults(data.results.filter((r: TmdbMedia & { media_type: string }) =>
        r.media_type === 'movie' || r.media_type === 'tv'
      ));
      setTotalResults(data.total_results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-10">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-ndp-text-dim" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un film, une série..."
            className="w-full pl-14 pr-6 py-4 bg-ndp-surface border border-white/10 rounded-2xl text-ndp-text placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/50 focus:border-ndp-accent transition-all text-base"
            autoFocus
          />
        </div>
      </form>

      {/* Results */}
      {searchParams.get('q') && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ndp-text">
            {loading ? 'Recherche en cours...' : `${totalResults} résultat${totalResults > 1 ? 's' : ''} pour "${searchParams.get('q')}"`}
          </h2>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
        {loading
          ? Array.from({ length: 14 }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))
          : results.map((media) => (
              <MediaCard key={`${media.media_type}-${media.id}`} media={media} />
            ))}
      </div>

      {!loading && results.length === 0 && searchParams.get('q') && (
        <div className="text-center py-20">
          <p className="text-ndp-text-muted text-lg">Aucun résultat trouvé</p>
          <p className="text-ndp-text-dim text-sm mt-2">Essayez avec d'autres mots-clés</p>
        </div>
      )}

      {!searchParams.get('q') && !loading && (
        <div className="text-center py-20">
          <Search className="w-16 h-16 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted text-lg">Recherchez un film ou une série</p>
        </div>
      )}
    </div>
  );
}
