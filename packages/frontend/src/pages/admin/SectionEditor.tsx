import { useState, useEffect, useRef, useCallback } from 'react';
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
  query?: {
    mediaType?: string;
    genres?: number[];
    yearGte?: number;
    yearLte?: number;
    voteAverageGte?: number;
    sortBy?: string;
    language?: string;
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

export function SectionEditor({ section, onSave, onClose }: SectionEditorProps) {
  const { t } = useTranslation();
  const isNew = section === null;
  const isBuiltin = section?.type === 'builtin';

  const [title, setTitle] = useState(section?.title || '');
  const [size, setSize] = useState<'default' | 'large'>(section?.size || 'default');
  const [enabled, setEnabled] = useState(section?.enabled ?? true);
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
    if (isBuiltin) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPreview(query);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isBuiltin, fetchPreview]);

  const handleSave = () => {
    const saved: HomepageSection = isBuiltin
      ? { ...section!, title, size, enabled }
      : {
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
            voteAverageGte: query.voteAverageGte,
            sortBy: query.sortBy,
            language: query.language,
          },
        };
    onSave(saved);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
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
              <label className="text-xs font-medium text-ndp-text-dim" style={{ display: 'block', marginBottom: 6 }}>
                {t('admin.homepage.section_title', 'Section title')}
              </label>
              <input
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

            {/* Query builder for custom sections */}
            {!isBuiltin && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                  <p className="text-xs font-medium text-ndp-text-dim" style={{ marginBottom: 12 }}>
                    {t('admin.homepage.query_builder', 'TMDB discover query')}
                  </p>
                  <QueryBuilder
                    query={query}
                    onChange={setQuery}
                    previewResults={previewResults}
                    previewLoading={previewLoading}
                  />
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
