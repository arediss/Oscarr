import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useTmdbList } from '@/hooks/useTmdbList';
import MediaGrid from '@/components/MediaGrid';
import type { TmdbMedia } from '@/types';

export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [totalResults, setTotalResults] = useState(0);

  const query = searchParams.get('q') || '';

  const { data: results, loading } = useTmdbList<TmdbMedia>(
    query ? `/tmdb/search?q=${encodeURIComponent(query)}` : null,
    [query],
    {
      transform: (data) => {
        setTotalResults(data.total_results ?? 0);
        return (data.results as (TmdbMedia & { media_type: string })[]).filter(
          (r) => r.media_type === 'movie' || r.media_type === 'tv',
        );
      },
    },
  );

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      {query && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-ndp-text">
            {loading ? t('search.searching') : t('search.result', { count: totalResults, query })}
          </h2>
        </div>
      )}

      <MediaGrid media={results} loading={loading} />

      {!loading && results.length === 0 && query && (
        <div className="text-center py-20">
          <p className="text-ndp-text-muted text-lg">{t('search.no_results')}</p>
          <p className="text-ndp-text-dim text-sm mt-2">{t('search.try_other')}</p>
        </div>
      )}

      {!query && !loading && (
        <div className="text-center py-20">
          <Search className="w-16 h-16 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted text-lg">{t('search.use_search_bar')}</p>
        </div>
      )}
    </div>
  );
}
