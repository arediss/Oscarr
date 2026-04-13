import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Pencil, Trash2, Plus, RotateCcw, Save } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { Spinner } from './Spinner';

interface HomepageSection {
  id: string;
  title: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
  query?: {
    mediaType?: string;
    genres?: string[];
    yearFrom?: number;
    [key: string]: unknown;
  };
}

function formatQueryPreview(query?: HomepageSection['query']): string {
  if (!query) return '';
  const parts: string[] = [];
  if (query.mediaType) parts.push(query.mediaType === 'movie' ? 'Movies' : 'Series');
  if (query.genres?.length) parts.push(query.genres.join(', '));
  if (query.yearFrom) parts.push(`${query.yearFrom}+`);
  return parts.join(' \u00b7 ');
}

export function HomepageTab() {
  const { t } = useTranslation();
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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
    setSections(prev => prev.filter(s => s.id !== id));
    setConfirmDeleteId(null);
  };

  const addCustomSection = () => {
    const newSection: HomepageSection = {
      id: `custom-${Date.now()}`,
      title: 'New Section',
      type: 'custom',
      enabled: true,
      query: { mediaType: 'movie', genres: [], },
    };
    setSections(prev => [...prev, newSection]);
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
    // Placeholder — SectionEditor modal comes in Task 3
    console.log('Edit section', id);
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
                    <span className="text-sm font-semibold text-ndp-text">{section.title}</span>
                    {section.type === 'builtin' ? (
                      <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-1.5 py-0.5 rounded">Builtin</span>
                    ) : (
                      <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">Custom</span>
                    )}
                  </div>
                  {section.type === 'custom' && queryPreview && (
                    <p className="text-xs text-ndp-text-dim mt-1">{queryPreview}</p>
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
          <div className="bg-ndp-bg-card border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
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
          <div className="bg-ndp-bg-card border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ndp-text">{t('admin.homepage.confirm_reset_title', 'Reset to default?')}</h3>
            <p className="text-sm text-ndp-text-muted">{t('admin.homepage.confirm_reset_desc', 'This will replace your current layout with the default homepage sections.')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmReset(false)} className="btn-secondary text-sm">{t('common.cancel', 'Cancel')}</button>
              <button onClick={resetToDefault} className="px-4 py-2 bg-ndp-danger/10 text-ndp-danger hover:bg-ndp-danger/20 rounded-xl text-sm font-medium transition-colors">{t('admin.homepage.reset', 'Reset to default')}</button>
            </div>
          </div>
        </div>
      )}
    </AdminTabLayout>
  );
}
