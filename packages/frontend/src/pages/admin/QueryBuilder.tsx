import { useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';

export interface DiscoverQuery {
  mediaType: 'movie' | 'tv';
  genres?: number[];
  yearGte?: number;
  yearLte?: number;
  releasedWithin?: string; // 'last_30d' | 'last_90d' | 'last_6m' | 'last_1y' | ''
  voteAverageGte?: number;
  voteCountGte?: number;
  sortBy?: string;
  language?: string;
}

interface QueryBuilderProps {
  query: DiscoverQuery;
  onChange: (query: DiscoverQuery) => void;
  previewResults: any[];
  previewLoading: boolean;
}

interface Genre {
  id: number;
  name: string;
}

const MOVIE_SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Popularity ↓' },
  { value: 'popularity.asc', label: 'Popularity ↑' },
  { value: 'vote_average.desc', label: 'Rating ↓' },
  { value: 'vote_average.asc', label: 'Rating ↑' },
  { value: 'primary_release_date.desc', label: 'Release date ↓' },
  { value: 'primary_release_date.asc', label: 'Release date ↑' },
  { value: 'revenue.desc', label: 'Revenue ↓' },
  { value: 'revenue.asc', label: 'Revenue ↑' },
];

const TV_SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Popularity ↓' },
  { value: 'popularity.asc', label: 'Popularity ↑' },
  { value: 'vote_average.desc', label: 'Rating ↓' },
  { value: 'vote_average.asc', label: 'Rating ↑' },
  { value: 'first_air_date.desc', label: 'Air date ↓' },
  { value: 'first_air_date.asc', label: 'Air date ↑' },
];

const RELEASE_WINDOW_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'last_6m', label: 'Last 6 months' },
  { value: 'last_1y', label: 'Last year' },
];

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'pt', label: 'Portuguese' },
];

export function QueryBuilder({ query, onChange, previewResults, previewLoading }: QueryBuilderProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genresLoading, setGenresLoading] = useState(false);

  // Fetch genres when media type changes
  useEffect(() => {
    let cancelled = false;
    async function fetchGenres() {
      setGenresLoading(true);
      try {
        const { data } = await api.get(`/tmdb/genres/${query.mediaType}`);
        if (!cancelled) setGenres(data.genres || []);
      } catch (err) {
        console.error('Failed to fetch genres', err);
        if (!cancelled) setGenres([]);
      } finally {
        if (!cancelled) setGenresLoading(false);
      }
    }
    fetchGenres();
    return () => { cancelled = true; };
  }, [query.mediaType]);

  const toggleGenre = (id: number) => {
    const current = query.genres || [];
    const next = current.includes(id)
      ? current.filter(g => g !== id)
      : [...current, id];
    onChange({ ...query, genres: next });
  };

  const setMediaType = (mt: 'movie' | 'tv') => {
    // Reset genres when switching media type since IDs differ
    // Also reset sortBy if current value isn't valid for the new media type
    const validSorts = mt === 'tv' ? TV_SORT_OPTIONS : MOVIE_SORT_OPTIONS;
    const sortStillValid = validSorts.some(o => o.value === query.sortBy);
    onChange({ ...query, mediaType: mt, genres: [], sortBy: sortStillValid ? query.sortBy : 'popularity.desc' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Media type toggle — group of buttons, labelled by a sibling span */}
      <div role="group" aria-labelledby={`${fieldId}-media-type`}>
        <span id={`${fieldId}-media-type`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
          {t('admin.homepage.media_type', 'Media type')}
        </span>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
          <button
            type="button"
            onClick={() => setMediaType('movie')}
            style={{
              padding: '6px 18px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: query.mediaType === 'movie' ? 'var(--color-accent, #6366f1)' : 'transparent',
              color: query.mediaType === 'movie' ? '#fff' : 'var(--color-text-dim, #888)',
              transition: 'all 0.15s',
            }}
          >
            {t('common.movie', 'Movie')}
          </button>
          <button
            type="button"
            onClick={() => setMediaType('tv')}
            style={{
              padding: '6px 18px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: query.mediaType === 'tv' ? 'var(--color-accent, #6366f1)' : 'transparent',
              color: query.mediaType === 'tv' ? '#fff' : 'var(--color-text-dim, #888)',
              transition: 'all 0.15s',
            }}
          >
            {t('common.tv', 'TV')}
          </button>
        </div>
      </div>

      {/* Genres — group of toggle chips */}
      <div role="group" aria-labelledby={`${fieldId}-genres`}>
        <span id={`${fieldId}-genres`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
          {t('admin.homepage.genres', 'Genres')}
        </span>
        {genresLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
            <Loader2 className="w-4 h-4 animate-spin text-ndp-text-dim" />
            <span className="text-xs text-ndp-text-dim">{t('common.loading', 'Loading...')}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {genres.map(genre => {
              const active = query.genres?.includes(genre.id) ?? false;
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleGenre(genre.id)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 999,
                    border: active ? '1px solid var(--color-accent, #6366f1)' : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: active ? 'var(--color-accent, #6366f1)' : 'var(--color-text-dim, #888)',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Release window + Year range + Rating + Votes row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label htmlFor={`${fieldId}-release-window`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.release_window', 'Released within')}
          </label>
          <select
            id={`${fieldId}-release-window`}
            className="input"
            value={query.releasedWithin || ''}
            onChange={e => {
              const val = e.target.value || undefined;
              // Clear year fields when using a relative window
              onChange({ ...query, releasedWithin: val, yearGte: val ? undefined : query.yearGte, yearLte: val ? undefined : query.yearLte });
            }}
            style={{ width: '100%' }}
          >
            {RELEASE_WINDOW_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-year-from`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.year_from', 'Year from')}
          </label>
          <input
            id={`${fieldId}-year-from`}
            className="input"
            type="number"
            placeholder="2020"
            value={query.yearGte ?? ''}
            disabled={!!query.releasedWithin}
            onChange={e => onChange({ ...query, yearGte: e.target.value ? Number(e.target.value) : undefined })}
            style={{ width: '100%', opacity: query.releasedWithin ? 0.4 : 1 }}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-year-to`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.year_to', 'Year to')}
          </label>
          <input
            id={`${fieldId}-year-to`}
            className="input"
            type="number"
            placeholder="2026"
            value={query.yearLte ?? ''}
            disabled={!!query.releasedWithin}
            onChange={e => onChange({ ...query, yearLte: e.target.value ? Number(e.target.value) : undefined })}
            style={{ width: '100%', opacity: query.releasedWithin ? 0.4 : 1 }}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-min-rating`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.min_rating', 'Min. rating')}
          </label>
          <input
            id={`${fieldId}-min-rating`}
            className="input"
            type="number"
            min={0}
            max={10}
            step={0.5}
            placeholder="0"
            value={query.voteAverageGte ?? ''}
            onChange={e => onChange({ ...query, voteAverageGte: e.target.value ? Number(e.target.value) : undefined })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-min-votes`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.min_votes', 'Min. votes')}
          </label>
          <input
            id={`${fieldId}-min-votes`}
            className="input"
            type="number"
            min={0}
            step={10}
            placeholder="0"
            value={query.voteCountGte ?? ''}
            onChange={e => onChange({ ...query, voteCountGte: e.target.value ? Number(e.target.value) : undefined })}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Sort + Language row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label htmlFor={`${fieldId}-sort`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.sort_by', 'Sort by')}
          </label>
          <select
            id={`${fieldId}-sort`}
            className="input"
            value={query.sortBy || 'popularity.desc'}
            onChange={e => onChange({ ...query, sortBy: e.target.value })}
            style={{ width: '100%' }}
          >
            {(query.mediaType === 'tv' ? TV_SORT_OPTIONS : MOVIE_SORT_OPTIONS).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-language`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.language', 'Language')}
          </label>
          <select
            id={`${fieldId}-language`}
            className="input"
            value={query.language || ''}
            onChange={e => onChange({ ...query, language: e.target.value || undefined })}
            style={{ width: '100%' }}
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview — region of results, labelled via aria. Not a form control. */}
      <div role="region" aria-labelledby={`${fieldId}-preview`}>
        <span id={`${fieldId}-preview`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 8 }}>
          {t('admin.homepage.preview', 'Preview')}
          {previewLoading && (
            <Loader2 className="w-3 h-3 animate-spin inline-block ml-2" style={{ verticalAlign: 'middle' }} />
          )}
        </span>
        {previewResults.length > 0 ? (
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 8,
              scrollbarWidth: 'thin',
            }}
          >
            {previewResults.slice(0, 12).map((item: any) => (
              <div
                key={item.id}
                style={{
                  flexShrink: 0,
                  width: 100,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 100,
                    height: 150,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.05)',
                  }}
                >
                  {item.poster_path ? (
                    <img
                      src={posterUrl(item.poster_path, 'w185')}
                      alt={item.title || item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: 'var(--color-text-dim, #888)',
                    }}>
                      No poster
                    </div>
                  )}
                </div>
                <p style={{
                  fontSize: 11,
                  marginTop: 4,
                  color: 'var(--color-text, #fff)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.title || item.name}
                </p>
              </div>
            ))}
          </div>
        ) : !previewLoading ? (
          <p className="text-xs text-ndp-text-dim" style={{ padding: '12px 0' }}>
            {t('admin.homepage.preview_empty', 'Adjust the filters above to see a preview.')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
