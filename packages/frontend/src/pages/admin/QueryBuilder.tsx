import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import api, { posterUrl } from '@/lib/api';

export interface DiscoverQuery {
  mediaType: 'movie' | 'tv';
  genres?: number[];
  yearGte?: number;
  yearLte?: number;
  voteAverageGte?: number;
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

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'primary_release_date.desc', label: 'Release date' },
  { value: 'revenue.desc', label: 'Revenue' },
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
    onChange({ ...query, mediaType: mt, genres: [] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Media type toggle */}
      <div>
        <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
          {t('admin.homepage.media_type', 'Media type')}
        </label>
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

      {/* Genres */}
      <div>
        <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
          {t('admin.homepage.genres', 'Genres')}
        </label>
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

      {/* Year range + Rating row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.year_from', 'Year from')}
          </label>
          <input
            className="input"
            type="number"
            placeholder="2020"
            value={query.yearGte ?? ''}
            onChange={e => onChange({ ...query, yearGte: e.target.value ? Number(e.target.value) : undefined })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.year_to', 'Year to')}
          </label>
          <input
            className="input"
            type="number"
            placeholder="2026"
            value={query.yearLte ?? ''}
            onChange={e => onChange({ ...query, yearLte: e.target.value ? Number(e.target.value) : undefined })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.min_rating', 'Min. rating')}
          </label>
          <input
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
      </div>

      {/* Sort + Language row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.sort_by', 'Sort by')}
          </label>
          <select
            className="input"
            value={query.sortBy || 'popularity.desc'}
            onChange={e => onChange({ ...query, sortBy: e.target.value })}
            style={{ width: '100%' }}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
            {t('admin.homepage.language', 'Language')}
          </label>
          <select
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

      {/* Preview */}
      <div>
        <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 8 }}>
          {t('admin.homepage.preview', 'Preview')}
          {previewLoading && (
            <Loader2 className="w-3 h-3 animate-spin inline-block ml-2" style={{ verticalAlign: 'middle' }} />
          )}
        </label>
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
