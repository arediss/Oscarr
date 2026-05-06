import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { QueryBuilder, type DiscoverQuery } from './QueryBuilder';

interface HomepageSection {
  id: string;
  title: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
  size?: 'default' | 'large';
  builtinKey?: string;
  endpoint?: string; // Raw GET endpoint for custom sections (e.g. /tmdb/movies/now_playing)
  query?: {
    mediaType?: string;
    genres?: number[];
    yearGte?: number;
    yearLte?: number;
    voteAverageGte?: number;
    voteCountGte?: number;
    sortBy?: string;
    language?: string;
    releasedWithin?: string;
    [key: string]: unknown;
  };
}

interface SectionEditorProps {
  section: HomepageSection | null; // null = new custom section
  onSave: (section: HomepageSection) => void;
  onClose: () => void;
}

const DEFAULT_QUERY: DiscoverQuery = {
  mediaType: 'movie',
  genres: [],
  sortBy: 'popularity.desc',
};

export function SectionEditor({ section, onSave, onClose }: Readonly<SectionEditorProps>) {
  const { t } = useTranslation();
  const isNew = section === null;
  const isBuiltin = section?.type === 'builtin';
  const fieldId = useId();

  const [title, setTitle] = useState(section?.title || '');
  const [size, setSize] = useState<'default' | 'large'>(section?.size || 'default');
  const [enabled, setEnabled] = useState(section?.enabled ?? true);
  const [customMode, setCustomMode] = useState<'discover' | 'endpoint'>(section?.endpoint ? 'endpoint' : 'discover');
  const [endpoint, setEndpoint] = useState(section?.endpoint || '');
  const [endpointPreview, setEndpointPreview] = useState<any[]>([]);
  const [endpointPreviewLoading, setEndpointPreviewLoading] = useState(false);
  const [query, setQuery] = useState<DiscoverQuery>(() => {
    if (section?.query) {
      return {
        mediaType: (section.query.mediaType as 'movie' | 'tv') || 'movie',
        genres: section.query.genres?.map(Number) || [],
        yearGte: section.query.yearGte,
        yearLte: section.query.yearLte,
        voteAverageGte: section.query.voteAverageGte,
        sortBy: section.query.sortBy || 'popularity.desc',
        language: section.query.language,
      };
    }
    return { ...DEFAULT_QUERY };
  });
  const [previewResults, setPreviewResults] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview fetch
  const fetchPreview = useCallback(async (q: DiscoverQuery) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.post('/admin/homepage/preview', {
        mediaType: q.mediaType,
        genres: q.genres?.length ? q.genres : undefined,
        yearGte: q.yearGte,
        yearLte: q.yearLte,
        voteAverageGte: q.voteAverageGte,
        sortBy: q.sortBy,
        language: q.language,
      });
      setPreviewResults(data.results || []);
    } catch (err) {
      console.error('Preview fetch failed', err);
      setPreviewResults([]);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Auto-preview for custom sections when query changes
  useEffect(() => {
    if (isBuiltin || customMode !== 'discover') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPreview(query);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isBuiltin, customMode, fetchPreview]);

  // Auto-preview for endpoint mode
  useEffect(() => {
    if (isBuiltin || customMode !== 'endpoint' || !endpoint) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEndpointPreviewLoading(true);
      try {
        const { data } = await api.get(endpoint);
        setEndpointPreview(Array.isArray(data) ? data : data.results || []);
      } catch {
        setEndpointPreview([]);
      } finally {
        setEndpointPreviewLoading(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [endpoint, isBuiltin, customMode]);

  const handleSave = () => {
    let saved: HomepageSection;
    if (isBuiltin) {
      saved = { ...section, title, size, enabled };
    } else if (customMode === 'endpoint') {
      saved = {
        id: section?.id || crypto.randomUUID(),
        title: title || 'Custom Section',
        type: 'custom',
        enabled,
        size,
        endpoint: endpoint.startsWith('/') ? endpoint : `/${endpoint}`,
      };
    } else {
      saved = {
        id: section?.id || crypto.randomUUID(),
        title: title || 'Custom Section',
        type: 'custom',
        enabled,
        size,
        query: {
          mediaType: query.mediaType,
          genres: query.genres?.length ? query.genres : undefined,
          yearGte: query.yearGte,
          yearLte: query.yearLte,
          releasedWithin: query.releasedWithin,
          voteAverageGte: query.voteAverageGte,
          voteCountGte: query.voteCountGte,
          sortBy: query.sortBy,
          language: query.language,
        },
      };
    }
    onSave(saved);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', handleKey);
    return () => globalThis.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-ndp-surface border border-white/10"
        style={{
          maxWidth: 1024,
          width: '100%',
          maxHeight: '90vh',
          margin: '0 16px',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <h3 className="text-base font-semibold text-ndp-text">
            {isNew
              ? t('admin.homepage.new_section', 'New custom section')
              : t('admin.homepage.edit_section', 'Edit section')}
          </h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Title */}
            <div>
              <label htmlFor={`${fieldId}-title`} className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
                {t('admin.homepage.section_title', 'Section title')}
              </label>
              <input
                id={`${fieldId}-title`}
                className="input"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('admin.homepage.title_placeholder', 'e.g. Best of 2025')}
                style={{ width: '100%' }}
              />
            </div>

            {/* Size selector */}
            <div>
              <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
                {t('admin.homepage.card_size', 'Card size')}
              </label>
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
                <button
                  type="button"
                  onClick={() => setSize('default')}
                  style={{
                    padding: '6px 18px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    background: size === 'default' ? 'var(--color-accent, #6366f1)' : 'transparent',
                    color: size === 'default' ? '#fff' : 'var(--color-text-dim, #888)',
                    transition: 'all 0.15s',
                  }}
                >
                  {t('admin.homepage.size_default', 'Default')}
                </button>
                <button
                  type="button"
                  onClick={() => setSize('large')}
                  style={{
                    padding: '6px 18px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    background: size === 'large' ? 'var(--color-accent, #6366f1)' : 'transparent',
                    color: size === 'large' ? '#fff' : 'var(--color-text-dim, #888)',
                    transition: 'all 0.15s',
                  }}
                >
                  {t('admin.homepage.size_large', 'Large')}
                </button>
              </div>
            </div>

            {/* Enabled toggle (always shown for builtin, also for custom) */}
            {isBuiltin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className="relative flex-shrink-0"
                  style={{ width: 48, height: 24 }}
                >
                  <span
                    className={`absolute inset-0 rounded-full transition-colors ${enabled ? 'bg-ndp-accent' : 'bg-white/10'}`}
                  />
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : ''}`}
                  />
                </button>
                <span className="text-sm text-ndp-text">
                  {enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')}
                </span>
              </div>
            )}

            {/* Custom section mode selector + content */}
            {!isBuiltin && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                  {/* Mode toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <p className="text-xs font-medium text-ndp-text-dim">{t('admin.homepage.source', 'Data source')}</p>
                    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 }}>
                      <button
                        type="button"
                        onClick={() => setCustomMode('discover')}
                        style={{
                          padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: customMode === 'discover' ? 'var(--color-accent, #6366f1)' : 'transparent',
                          color: customMode === 'discover' ? '#fff' : 'var(--color-text-dim, #888)', transition: 'all 0.15s',
                        }}
                      >
                        {t('admin.homepage.mode_discover', 'Discover')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMode('endpoint')}
                        style={{
                          padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: customMode === 'endpoint' ? 'var(--color-accent, #6366f1)' : 'transparent',
                          color: customMode === 'endpoint' ? '#fff' : 'var(--color-text-dim, #888)', transition: 'all 0.15s',
                        }}
                      >
                        {t('admin.homepage.mode_endpoint', 'Endpoint')}
                      </button>
                    </div>
                  </div>

                  {/* Endpoint mode */}
                  {customMode === 'endpoint' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
                          {t('admin.homepage.endpoint_url', 'API endpoint')}
                        </label>
                        <input
                          className="input font-mono"
                          type="text"
                          value={endpoint}
                          onChange={e => setEndpoint(e.target.value)}
                          placeholder="/tmdb/movies/now_playing"
                          style={{ width: '100%', fontSize: 13 }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[
                          { label: 'Now Playing', value: '/tmdb/movies/now_playing' },
                          { label: 'Top Rated Movies', value: '/tmdb/movies/top_rated' },
                          { label: 'Top Rated TV', value: '/tmdb/tv/top_rated' },
                          { label: 'Airing Today', value: '/tmdb/tv/airing_today' },
                          { label: 'On The Air', value: '/tmdb/tv/on_the_air' },
                        ].map(preset => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => { setEndpoint(preset.value); if (!title) setTitle(preset.label); }}
                            style={{
                              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                              border: endpoint === preset.value ? '1px solid var(--color-accent, #6366f1)' : '1px solid rgba(255,255,255,0.1)',
                              background: endpoint === preset.value ? 'rgba(99,102,241,0.15)' : 'transparent',
                              color: endpoint === preset.value ? 'var(--color-accent, #6366f1)' : 'var(--color-text-dim, #888)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      {/* Endpoint preview */}
                      <div>
                        <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 8 }}>
                          {t('admin.homepage.preview', 'Preview')}
                          {endpointPreviewLoading && <span className="ml-2 text-ndp-text-dim">...</span>}
                        </label>
                        {endpointPreview.length > 0 ? (
                          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                            {endpointPreview.slice(0, 10).map((item: any) => (
                              <div key={item.id} style={{ flexShrink: 0, width: 80, textAlign: 'center' }}>
                                {item.poster_path ? (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w154${item.poster_path}`}
                                    alt=""
                                    style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: 6 }}
                                  />
                                ) : (
                                  <div style={{ width: 80, height: 120, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="text-ndp-text-dim" style={{ fontSize: 10 }}>No poster</span>
                                  </div>
                                )}
                                <p className="text-ndp-text-dim" style={{ fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.title || item.name}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : endpoint && !endpointPreviewLoading ? (
                          <p className="text-ndp-text-dim" style={{ fontSize: 12 }}>{t('admin.homepage.preview_empty', 'No results or invalid endpoint.')}</p>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Discover mode */}
                  {customMode === 'discover' && (
                    <>
                      <p className="text-xs font-medium text-ndp-text-dim" style={{ marginBottom: 12 }}>
                        {t('admin.homepage.query_builder', 'TMDB discover query')}
                      </p>
                      <QueryBuilder
                        query={query}
                        onChange={setQuery}
                        previewResults={previewResults}
                        previewLoading={previewLoading}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '14px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <button
            onClick={onClose}
            className="btn-secondary text-sm"
            style={{ padding: '8px 20px' }}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            className="btn-primary text-sm"
            style={{ padding: '8px 20px' }}
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
