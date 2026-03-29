import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Plus, XCircle, Check, Trash2 } from 'lucide-react';
import api from '@/lib/api';

interface QualityMappingType {
  id: number;
  qualityProfileId: number;
  qualityProfileName: string;
  service: { id: number; name: string; type: string };
}

interface QualityOptionType {
  id: number;
  label: string;
  position: number;
  mappings: QualityMappingType[];
}

interface ServiceType {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

function ServicePicker({ services, onSelect }: { services: ServiceType[]; onSelect: (serviceId: number) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 4, left: rect.left });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); handleOpen(); }}
        className="p-1 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div
          className="fixed z-50"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="card border border-white/10 shadow-2xl py-1 min-w-[160px] animate-fade-in">
            {services.map((svc) => (
              <button
                key={svc.id}
                onClick={() => { onSelect(svc.id); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-ndp-text-muted hover:bg-white/5 hover:text-ndp-text transition-colors"
              >
                {svc.name}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function QualityTab() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<QualityOptionType[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [editingMapping, setEditingMapping] = useState<{ qualityOptionId: number; serviceId: number } | null>(null);
  const [profiles, setProfiles] = useState<{ id: number; name: string }[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<number>>(new Set());
  const [savingMapping, setSavingMapping] = useState(false);

  const load = useCallback(async () => {
    try {
      const [optRes, svcRes] = await Promise.all([
        api.get('/admin/quality-options'),
        api.get('/admin/services'),
      ]);
      setOptions(optRes.data);
      setServices(svcRes.data.filter((s: ServiceType) => ['radarr', 'sonarr'].includes(s.type) && s.enabled));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedDefaults = async () => {
    try {
      await api.post('/admin/quality-options/seed');
      load();
    } catch { /* ignore */ }
  };

  const addOption = async () => {
    if (!newLabel.trim()) return;
    try {
      await api.post('/admin/quality-options', { label: newLabel.trim() });
      setNewLabel('');
      load();
    } catch { /* ignore */ }
  };

  const deleteOption = async (id: number) => {
    try {
      await api.delete(`/admin/quality-options/${id}`);
      load();
    } catch { /* ignore */ }
  };

  const openMapping = async (qualityOptionId: number, serviceId: number) => {
    setEditingMapping({ qualityOptionId, serviceId });
    setProfiles([]);
    setSelectedProfiles(new Set());
    setLoadingProfiles(true);
    try {
      const { data } = await api.get(`/admin/services/${serviceId}/profiles`);
      const opt = options.find(o => o.id === qualityOptionId);
      const existingProfileIds = new Set(
        opt?.mappings.filter(m => m.service.id === serviceId).map(m => m.qualityProfileId) || []
      );
      setProfiles(data.filter((p: { id: number }) => !existingProfileIds.has(p.id)));
    } catch { /* service unreachable */ }
    finally { setLoadingProfiles(false); }
  };

  const saveMappings = async () => {
    if (!editingMapping || selectedProfiles.size === 0) return;
    setSavingMapping(true);
    try {
      for (const profileId of selectedProfiles) {
        const profile = profiles.find(p => p.id === profileId);
        await api.post('/admin/quality-mappings', {
          qualityOptionId: editingMapping.qualityOptionId,
          serviceId: editingMapping.serviceId,
          qualityProfileId: profileId,
          qualityProfileName: profile?.name || `Profile ${profileId}`,
        });
      }
      setEditingMapping(null);
      load();
    } catch { /* ignore */ } finally { setSavingMapping(false); }
  };

  const deleteMapping = async (mappingId: number) => {
    try {
      await api.delete(`/admin/quality-mappings/${mappingId}`);
      load();
    } catch { /* ignore */ }
  };

  const toggleProfile = (id: number) => {
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ndp-accent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ndp-text">{t('admin.quality.options_title')} ({options.length})</h2>
        {options.length === 0 && (
          <button onClick={seedDefaults} className="btn-secondary text-sm">
            {t('admin.quality.add_defaults')}
          </button>
        )}
      </div>

      {/* Quality option cards */}
      <div className="space-y-3">
        {options.map((opt) => (
          <div key={opt.id} className="card">
            <div className="flex items-center gap-4 p-4">
              <span className="text-sm font-semibold text-ndp-text w-20 flex-shrink-0">{opt.label}</span>

              {/* Mappings grouped by service */}
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                {services.map((svc) => {
                  const mappings = opt.mappings.filter(m => m.service.id === svc.id);
                  return mappings.map((mapping) => (
                    <div key={mapping.id} className="flex items-center gap-1 bg-ndp-success/10 px-2.5 py-1 rounded-lg">
                      <span className="text-[10px] text-ndp-text-dim mr-1">{svc.name}</span>
                      <span className="text-ndp-success text-xs font-medium">{mapping.qualityProfileName}</span>
                      <button onClick={() => deleteMapping(mapping.id)} className="text-ndp-success/40 hover:text-ndp-danger transition-colors ml-0.5">
                        <XCircle className="w-3 h-3" />
                      </button>
                    </div>
                  ));
                })}
                {services.length > 0 && (
                  services.length === 1 ? (
                    <button
                      onClick={() => openMapping(opt.id, services[0].id)}
                      className="p-1 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  ) : (
                    <ServicePicker services={services} onSelect={(svcId) => openMapping(opt.id, svcId)} />
                  )
                )}
              </div>

              {/* Delete quality option */}
              <button onClick={() => deleteOption(opt.id)} className="p-1.5 text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 rounded-lg transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add new quality option */}
      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addOption()}
          placeholder={t('admin.quality.new_placeholder')}
          className="input flex-1 text-sm"
        />
        <button onClick={addOption} disabled={!newLabel.trim()} className="btn-primary text-sm flex items-center gap-2 px-4">
          <Plus className="w-4 h-4" /> {t('common.add')}
        </button>
      </div>

      {services.length === 0 && options.length > 0 && (
        <div className="card p-6 text-center text-ndp-text-muted">
          <p>{t('admin.quality.no_services')}</p>
        </div>
      )}

      {/* Multi-select profile modal */}
      {editingMapping && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={() => setEditingMapping(null)}>
          <div className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ndp-text mb-1">{t('admin.quality.select_profile')}</h3>
            <p className="text-xs text-ndp-text-dim mb-4">
              {options.find(o => o.id === editingMapping.qualityOptionId)?.label} → {services.find(s => s.id === editingMapping.serviceId)?.name}
            </p>
            {loadingProfiles ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-ndp-accent" /></div>
            ) : profiles.length === 0 ? (
              <p className="text-ndp-text-muted text-sm py-4">{t('admin.quality.profiles_error')}</p>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {profiles.map((p) => {
                  const isSelected = selectedProfiles.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProfile(p.id)}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-between',
                        isSelected
                          ? 'bg-ndp-accent/10 text-ndp-accent border border-ndp-accent/30'
                          : 'bg-ndp-surface-light text-ndp-text hover:bg-white/10 border border-transparent'
                      )}
                    >
                      {p.name}
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between mt-6">
              <span className="text-xs text-ndp-text-dim">
                {selectedProfiles.size > 0 && t('common.selected', { count: selectedProfiles.size })}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setEditingMapping(null)} className="btn-secondary text-sm">{t('common.cancel')}</button>
                <button onClick={saveMappings} disabled={selectedProfiles.size === 0 || savingMapping} className="btn-primary text-sm flex items-center gap-2">
                  {savingMapping && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('common.save')} {selectedProfiles.size > 0 && `(${selectedProfiles.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
