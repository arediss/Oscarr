import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Plus, X, Check, Trash2, Shield, Link2, CheckCircle, Clock } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { useModal } from '@/hooks/useModal';

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
  allowedRoles: string | null;
  approvalMode: string | null;
  mappings: QualityMappingType[];
}

interface ServiceType {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

interface RoleType {
  id: number;
  name: string;
}

export function QualityTab() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<QualityOptionType[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [roles, setRoles] = useState<RoleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOption, setEditingOption] = useState<number | null>(null);
  const { dialogRef: optionDialogRef, titleId: optionTitleId } = useModal({
    open: editingOption !== null,
    onClose: () => setEditingOption(null),
  });
  const [editingMapping, setEditingMapping] = useState<{ qualityOptionId: number; serviceId: number } | null>(null);
  const { dialogRef: mappingDialogRef, titleId: mappingTitleId } = useModal({
    open: editingMapping !== null,
    onClose: () => setEditingMapping(null),
  });
  const [profiles, setProfiles] = useState<{ id: number; name: string }[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<number>>(new Set());
  const [savingMapping, setSavingMapping] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [optRes, svcRes, roleRes] = await Promise.all([
        api.get('/admin/quality-options'),
        api.get('/admin/services'),
        api.get('/admin/roles'),
      ]);
      setOptions(optRes.data);
      setServices(svcRes.data.filter((s: ServiceType) => ['radarr', 'sonarr'].includes(s.type) && s.enabled));
      setRoles(roleRes.data.filter((r: RoleType) => r.name !== 'admin'));
    } catch (err) { toastApiError(err, t('admin.quality.load_failed')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const addOption = async () => {
    if (!newLabel.trim()) return;
    try {
      await api.post('/admin/quality-options', { label: newLabel.trim() });
      setNewLabel('');
      setAdding(false);
      load();
    } catch (err) { toastApiError(err, t('admin.quality.add_option_failed')); }
  };

  const deleteOption = async (id: number) => {
    try {
      await api.delete(`/admin/quality-options/${id}`);
      load();
    } catch (err) { toastApiError(err, t('admin.quality.delete_option_failed')); }
  };

  const updateAllowedRoles = async (optionId: number, roleName: string, add: boolean) => {
    const opt = options.find(o => o.id === optionId);
    if (!opt) return;
    const current: string[] = opt.allowedRoles ? JSON.parse(opt.allowedRoles) : [];
    const next = add ? [...current, roleName] : current.filter(r => r !== roleName);
    try {
      await api.put(`/admin/quality-options/${optionId}`, { allowedRoles: next });
      load();
    } catch (err) { toastApiError(err, t('admin.quality.update_roles_failed')); }
  };

  const updateApprovalMode = async (optionId: number, mode: string | null) => {
    try {
      await api.put(`/admin/quality-options/${optionId}`, { approvalMode: mode });
      load();
    } catch (err) { toastApiError(err, t('admin.quality.update_approval_failed')); }
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
    } catch (err) { toastApiError(err, t('admin.quality.profiles_fetch_failed')); }
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
    } catch (err) { toastApiError(err, t('admin.quality.save_mappings_failed')); }
    finally { setSavingMapping(false); }
  };

  const deleteMapping = async (mappingId: number) => {
    try {
      await api.delete(`/admin/quality-mappings/${mappingId}`);
      load();
    } catch (err) { toastApiError(err, t('admin.quality.delete_mapping_failed')); }
  };

  const seedDefaults = async () => {
    try {
      await api.post('/admin/quality-options/seed');
      load();
    } catch (err) { toastApiError(err, t('admin.quality.seed_failed')); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ndp-accent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ndp-text">{t('admin.quality.options_title')}</h2>
        <div className="flex items-center gap-2">
          {options.length === 0 && (
            <button onClick={seedDefaults} className="btn-secondary text-sm">{t('admin.quality.add_defaults')}</button>
          )}
          <button onClick={() => setAdding(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> {t('common.add')}
          </button>
        </div>
      </div>

      {/* Quality cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {options.map((opt) => {
          const isSelected = editingOption === opt.id;
          const allowedRoles: string[] = opt.allowedRoles ? JSON.parse(opt.allowedRoles) : [];

          // Group mappings by service
          const byService = new Map<string, { name: string; profiles: string[] }>();
          for (const m of opt.mappings) {
            const key = String(m.service.id);
            if (!byService.has(key)) byService.set(key, { name: m.service.name, profiles: [] });
            byService.get(key)!.profiles.push(m.qualityProfileName);
          }

          return (
            <div
              key={opt.id}
              className={clsx(
                'card p-4 flex flex-col gap-2.5 transition-all cursor-pointer',
                isSelected ? 'ring-1 ring-ndp-accent/30' : 'hover:bg-white/[0.02]',
              )}
              onClick={() => setEditingOption(isSelected ? null : opt.id)}
            >
              {/* Label */}
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-ndp-text">{opt.label}</span>
                {allowedRoles.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-ndp-accent/50" />
                    <span className="text-[10px] text-ndp-accent/60">{allowedRoles.length}</span>
                  </div>
                )}
              </div>

              {/* Mappings grouped by service */}
              <div className="flex flex-wrap gap-1.5">
                {[...byService.entries()].map(([key, svc]) => (
                  <span key={key} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-ndp-success/10 text-ndp-success font-medium">
                    <Link2 className="w-3 h-3 text-ndp-success/50" />
                    <span className="text-ndp-text-dim">{svc.name}:</span>
                    {svc.profiles.join(', ')}
                  </span>
                ))}
                {opt.mappings.length === 0 && (
                  <span className="flex items-center gap-1 text-xs text-ndp-text-dim italic">
                    <Link2 className="w-3 h-3" />
                    {t('admin.quality.no_mappings')}
                  </span>
                )}
              </div>

              {/* Roles + approval */}
              <div className="flex flex-wrap items-center gap-1.5">
                {allowedRoles.length > 0 ? allowedRoles.map(r => (
                  <span key={r} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-ndp-accent/10 text-ndp-accent font-medium">
                    <Shield className="w-2.5 h-2.5" />
                    {r}
                  </span>
                )) : (
                  <span className="flex items-center gap-1 text-[10px] text-ndp-text-dim">
                    <Shield className="w-2.5 h-2.5" />
                    {t('admin.quality.all_roles')}
                  </span>
                )}
                {opt.approvalMode === 'auto' && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-ndp-success/10 text-ndp-success font-medium">
                    <CheckCircle className="w-2.5 h-2.5" />
                    {t('admin.quality.approval_auto')}
                  </span>
                )}
                {opt.approvalMode === 'manual' && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-ndp-warning/10 text-ndp-warning font-medium">
                    <Clock className="w-2.5 h-2.5" />
                    {t('admin.quality.approval_manual')}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Add new card */}
        {adding && (
          <div className="card p-4 flex flex-col gap-3 ring-1 ring-ndp-accent/30">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOption()}
              placeholder={t('admin.quality.new_placeholder')}
              className="input text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => { setAdding(false); setNewLabel(''); }} className="btn-secondary text-xs flex-1">{t('common.cancel')}</button>
              <button onClick={addOption} disabled={!newLabel.trim()} className="btn-primary text-xs flex-1">{t('common.add')}</button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal — flat layout like RBAC modal */}
      {editingOption && (() => {
        const opt = options.find(o => o.id === editingOption);
        if (!opt) return null;
        const allowedRoles: string[] = opt.allowedRoles ? JSON.parse(opt.allowedRoles) : [];

        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div
              ref={optionDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={optionTitleId}
              className="card p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 id={optionTitleId} className="text-lg font-bold text-ndp-text">{opt.label}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => { deleteOption(opt.id); setEditingOption(null); }} aria-label={t('common.delete')} className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingOption(null)} aria-label={t('common.close')} className="p-1 rounded-lg hover:bg-white/5 text-ndp-text-dim">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-5">
                {/* Mappings */}
                <div>
                  <label className="text-sm text-ndp-text mb-2 block font-medium">{t('admin.quality.mapping_title')}</label>
                  <div className="flex flex-wrap gap-2">
                    {opt.mappings.map((m) => (
                      <span key={m.id} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-ndp-success/10 text-ndp-success font-medium">
                        <span className="text-ndp-text-dim">{m.service.name}:</span>
                        {m.qualityProfileName}
                        <button onClick={() => deleteMapping(m.id)} className="hover:text-ndp-danger transition-colors ml-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                    {services.map((svc) => (
                      <button key={svc.id} onClick={() => openMapping(opt.id, svc.id)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white/5 text-ndp-text-muted hover:bg-white/10 hover:text-ndp-accent transition-colors">
                        <Plus className="w-4 h-4" /> {svc.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Roles — checkbox list like RBAC */}
                <div>
                  <label className="text-sm text-ndp-text mb-2 block font-medium">{t('admin.quality.allowed_roles')}</label>
                  <div className="space-y-0.5">
                    {roles.map((role) => {
                      const isAllowed = allowedRoles.includes(role.name);
                      return (
                        <button
                          key={role.id}
                          onClick={() => updateAllowedRoles(opt.id, role.name, !isAllowed)}
                          className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left', isAllowed ? 'bg-ndp-accent/10 text-ndp-text' : 'text-ndp-text-muted hover:bg-white/5')}
                        >
                          <div className={clsx('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', isAllowed ? 'bg-ndp-accent border-ndp-accent' : 'border-white/20')}>
                            {isAllowed && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-sm font-medium capitalize">{role.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-ndp-text-dim mt-2">
                    {allowedRoles.length === 0 ? t('admin.quality.all_roles') : t('admin.quality.restricted_roles', { count: allowedRoles.length })}
                  </p>
                </div>

                {/* Approval — segmented control like cleanup */}
                <div>
                  <label className="text-sm text-ndp-text mb-2 block font-medium">{t('admin.quality.approval_mode')}</label>
                  <div className="flex gap-1 bg-ndp-surface-light rounded-lg p-1">
                    {([
                      { value: null, labelKey: 'admin.quality.approval_inherit', style: 'bg-white/10 text-ndp-text shadow-sm' },
                      { value: 'auto', labelKey: 'admin.quality.approval_auto', style: 'bg-ndp-success/20 text-ndp-success shadow-sm' },
                      { value: 'manual', labelKey: 'admin.quality.approval_manual', style: 'bg-ndp-warning/20 text-ndp-warning shadow-sm' },
                    ] as const).map((mode) => (
                      <button
                        key={String(mode.value)}
                        onClick={() => updateApprovalMode(opt.id, mode.value)}
                        className={clsx(
                          'flex-1 text-xs font-medium py-2 rounded-md transition-all duration-200',
                          opt.approvalMode === mode.value ? mode.style : 'text-ndp-text-dim hover:text-ndp-text-muted',
                        )}
                      >
                        {t(mode.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {services.length === 0 && options.length > 0 && (
        <div className="card p-6 text-center text-ndp-text-muted">
          <p>{t('admin.quality.no_services')}</p>
        </div>
      )}

      {/* Profile select modal */}
      {editingMapping && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={() => setEditingMapping(null)}>
          <div
            ref={mappingDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={mappingTitleId}
            className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id={mappingTitleId} className="text-lg font-bold text-ndp-text mb-1">{t('admin.quality.select_profile')}</h3>
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
                      onClick={() => setSelectedProfiles(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
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
