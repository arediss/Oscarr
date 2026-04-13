import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Pencil, Trash2, Plus, RotateCcw, Save } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { Spinner } from './Spinner';
import { SectionEditor } from './SectionEditor';

const BUILTIN_ENDPOINTS: Record<string, string> = {
  hero: 'TMDB Trending → Hero carousel',
  recently_added: 'GET /media/recent',
  trending: 'GET /tmdb/trending',
  popular_movies: 'GET /tmdb/movies/popular',
  popular_tv: 'GET /tmdb/tv/popular',
  trending_anime: 'GET /tmdb/tv/trending-anime',
  genres: 'TMDB Genres → Genre cards',
  upcoming: 'GET /tmdb/movies/upcoming',
};

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

function formatQueryPreview(query?: HomepageSection['query']): string {
  if (!query) return '';
  const parts: string[] = [];
  if (query.mediaType) parts.push(query.mediaType === 'movie' ? 'Movies' : 'Series');
  if (query.genres?.length) parts.push(`${query.genres.length} genre${query.genres.length > 1 ? 's' : ''}`);
  if (query.yearGte && query.yearLte) parts.push(`${query.yearGte}–${query.yearLte}`);
  else if (query.yearGte) parts.push(`${query.yearGte}+`);
  else if (query.yearLte) parts.push(`until ${query.yearLte}`);
  if (query.voteAverageGte) parts.push(`${query.voteAverageGte}+ rating`);
  return parts.join(' \u00b7 ');
}

export function HomepageTab() {
  const { t } = useTranslation();
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingSection, setEditingSection] = useState<HomepageSection | null | 'new'>(null);

  // Drag and drop reorder
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/admin/homepage');
        setSections(data.sections || data || []);
      } catch (err) {
        console.error('Failed to load homepage sections', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleDragStart = (index: number) => { dragItem.current = index; };
  const handleDragEnter = (index: number) => { dragOverItem.current = index; };
  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return;
    const reordered = [...sections];
    const [dragged] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, dragged);
    setSections(reordered);
    dragItem.current = null;
    dragOverItem.current = null;
    // Auto-save on reorder
    try {
      await api.put('/admin/homepage', { sections: reordered });
    } catch (err) {
      console.error('Failed to save reorder', err);
    }
  };

  const toggleSection = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const deleteSection = async (id: string) => {
    const updated = sections.filter(s => s.id !== id);
    setSections(updated);
    setConfirmDeleteId(null);
    try {
      await api.put('/admin/homepage', { sections: updated });
    } catch (err) {
      console.error('Failed to save after delete:', err);
    }
  };

  const addCustomSection = () => {
    setEditingSection('new');
  };

  const resetToDefault = async () => {
    setConfirmReset(false);
    try {
      const { data } = await api.put('/admin/homepage', { reset: true });
      setSections(data.sections || data || []);
    } catch (err) {
      console.error('Failed to reset homepage', err);
    }
  };

  const saveSections = async () => {
    setSaving(true);
    try {
      await api.put('/admin/homepage', { sections });
    } catch (err) {
      console.error('Failed to save homepage sections', err);
    } finally {
      setSaving(false);
    }
  };

  const editSection = (id: string) => {
    const target = sections.find(s => s.id === id);
    if (target) setEditingSection(target);
  };

  const handleSectionSave = async (updated: HomepageSection) => {
    let next: HomepageSection[];
    if (editingSection === 'new') {
      next = [...sections, updated];
    } else {
      next = sections.map(s => s.id === updated.id ? updated : s);
    }
    setSections(next);
    setEditingSection(null);
    try {
      await api.put('/admin/homepage', { sections: next });
    } catch (err) {
      console.error('Failed to save after section edit', err);
    }
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout
      title={t('admin.tab.homepage', 'Homepage')}
      count={sections.length}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setConfirmReset(true)} className="btn-secondary text-sm flex items-center gap-2 px-4 py-2">
            <RotateCcw className="w-4 h-4" /> {t('admin.homepage.reset', 'Reset to default')}
          </button>
          <button onClick={addCustomSection} className="btn-secondary text-sm flex items-center gap-2 px-4 py-2">
            <Plus className="w-4 h-4" /> {t('admin.homepage.add_section', 'Add custom section')}
          </button>
          <button onClick={saveSections} disabled={saving} className="btn-primary text-sm flex items-center gap-2 px-4 py-2">
            <Save className="w-4 h-4" /> {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </button>
        </div>
      }
    >
      <p className="text-xs text-ndp-text-dim mb-4">
        {t('admin.homepage.help', 'Drag sections to reorder. Toggle visibility or add custom sections.')}
      </p>

      <div className="space-y-3">
        {sections.map((section, index) => {
          const queryPreview = formatQueryPreview(section.query);
          return (
            <div
              key={section.id}
              className={`card cursor-grab active:cursor-grabbing transition-opacity ${!section.enabled ? 'opacity-40' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="flex items-center gap-3 p-4">
                <GripVertical className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ndp-text">{t(section.title, section.title)}</span>
                    {section.type === 'builtin' ? (
                      <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-1.5 py-0.5 rounded">Builtin</span>
                    ) : section.endpoint ? (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Endpoint</span>
                    ) : (
                      <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">Discover</span>
                    )}
                    <span className="text-[10px] bg-white/5 text-ndp-text-dim px-1.5 py-0.5 rounded">
                      {section.size === 'large' ? 'Large' : 'Default'}
                    </span>
                  </div>
                  {section.type === 'custom' && section.endpoint && (
                    <p className="text-xs text-ndp-text-dim mt-1 font-mono opacity-60">GET {section.endpoint}</p>
                  )}
                  {section.type === 'custom' && !section.endpoint && queryPreview && (
                    <p className="text-xs text-ndp-text-dim mt-1">{queryPreview}</p>
                  )}
                  {section.type === 'builtin' && section.builtinKey && (
                    <p className="text-xs text-ndp-text-dim mt-1 font-mono opacity-60">{BUILTIN_ENDPOINTS[section.builtinKey] || section.builtinKey}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Toggle switch */}
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="relative flex-shrink-0"
                    style={{ width: 48, height: 24 }}
                  >
                    <span
                      className={`absolute inset-0 rounded-full transition-colors ${section.enabled ? 'bg-ndp-accent' : 'bg-white/10'}`}
                    />
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${section.enabled ? 'translate-x-6' : ''}`}
                    />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => editSection(section.id)}
                    className="p-1.5 text-ndp-text-dim hover:text-ndp-accent hover:bg-ndp-accent/10 rounded-lg transition-colors"
                    title={t('common.edit', 'Edit')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete (custom only) */}
                  {section.type === 'custom' && (
                    <button
                      onClick={() => setConfirmDeleteId(section.id)}
                      className="p-1.5 text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 rounded-lg transition-colors"
                      title={t('common.delete', 'Delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {sections.length === 0 && (
          <div className="text-center py-12 text-ndp-text-dim text-sm">
            {t('admin.homepage.empty', 'No sections configured. Add a custom section or reset to defaults.')}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-ndp-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ndp-text">{t('admin.homepage.confirm_delete_title', 'Delete section?')}</h3>
            <p className="text-sm text-ndp-text-muted">{t('admin.homepage.confirm_delete_desc', 'This custom section will be removed from the homepage layout.')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary text-sm">{t('common.cancel', 'Cancel')}</button>
              <button onClick={() => deleteSection(confirmDeleteId)} className="px-4 py-2 bg-ndp-danger/10 text-ndp-danger hover:bg-ndp-danger/20 rounded-xl text-sm font-medium transition-colors">{t('common.delete', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation modal */}
      {confirmReset && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={() => setConfirmReset(false)}>
          <div className="bg-ndp-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ndp-text">{t('admin.homepage.confirm_reset_title', 'Reset to default?')}</h3>
            <p className="text-sm text-ndp-text-muted">{t('admin.homepage.confirm_reset_desc', 'This will replace your current layout with the default homepage sections.')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmReset(false)} className="btn-secondary text-sm">{t('common.cancel', 'Cancel')}</button>
              <button onClick={resetToDefault} className="px-4 py-2 bg-ndp-danger/10 text-ndp-danger hover:bg-ndp-danger/20 rounded-xl text-sm font-medium transition-colors">{t('admin.homepage.reset', 'Reset to default')}</button>
            </div>
          </div>
        </div>
      )}
      {/* Section editor modal */}
      {editingSection !== null && (
        <SectionEditor
          section={editingSection === 'new' ? null : editingSection}
          onSave={handleSectionSave}
          onClose={() => setEditingSection(null)}
        />
      )}
    </AdminTabLayout>
  );
}
