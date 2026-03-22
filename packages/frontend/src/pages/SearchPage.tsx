import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import MediaGrid from '@/components/MediaGrid';
import type { TmdbMedia } from '@/types';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);

  const q = searchParams.get('q') || '';

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setTotalResults(0);
      return;
    }
    setLoading(true);
    api.get(`/tmdb/search?q=${encodeURIComponent(q)}`)
      .then(({ data }) => {
        setResults(data.results.filter((r: TmdbMedia & { media_type: string }) =>
          r.media_type === 'movie' || r.media_type === 'tv'
        ));
        setTotalResults(data.total_results);
      })
      .catch((err) => console.error('Search failed:', err))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      {q && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ndp-text">
            {loading ? 'Recherche en cours...' : `${totalResults} résultat${totalResults > 1 ? 's' : ''} pour "${q}"`}
          </h2>
        </div>
      )}

      <MediaGrid media={results} loading={loading} />

      {!loading && results.length === 0 && q && (
        <div className="text-center py-20">
          <p className="text-ndp-text-muted text-lg">Aucun résultat trouvé</p>
          <p className="text-ndp-text-dim text-sm mt-2">Essayez avec d'autres mots-clés</p>
        </div>
      )}

      {!q && !loading && (
        <div className="text-center py-20">
          <Search className="w-16 h-16 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted text-lg">Utilisez la barre de recherche ci-dessus</p>
        </div>
      )}
    </div>
  );
}
