import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, RefreshCw, Plus, Trash2, Pencil, Power, Save, Server, Star, Plug, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useServiceSchemas, type ServiceData } from '@/hooks/useServiceSchemas';

export function ServicesTab() {
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas();
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<ServiceData | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; version?: string }>>({});
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/services');
      setServices(data);
      return data as ServiceData[];
    } catch { return []; } finally { setLoading(false); }
  }, []);

  const testAllServices = useCallback((serviceList: ServiceData[]) => {
    serviceList.forEach(async (svc) => {
      if (!svc.enabled) return;
      try {
        const { data } = await api.post(`/admin/services/${svc.id}/test`);
        setTestResults(prev => ({ ...prev, [svc.id]: { ok: true, version: data.version } }));
      } catch {
        setTestResults(prev => ({ ...prev, [svc.id]: { ok: false } }));
      }
    });
  }, []);

  useEffect(() => {
    fetchServices().then((svcs) => { if (svcs.length) testAllServices(svcs); });
  }, [fetchServices, testAllServices]);

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await api.delete(`/admin/services/${id}`);
      fetchServices();
    } catch { /* empty */ }
    finally { setDeleting(false); setConfirmDelete(null); }
  };

  const handleToggle = async (service: ServiceData) => {
    try {
      await api.put(`/admin/services/${service.id}`, { enabled: !service.enabled });
      fetchServices();
    } catch { /* ignore */ }
  };

  const handleSetDefault = async (service: ServiceData) => {
    try {
      await api.put(`/admin/services/${service.id}`, { isDefault: true });
      fetchServices();
    } catch { /* ignore */ }
  };

  const handleTest = async (service: ServiceData) => {
    setTesting(service.id);
    try {
      const { data } = await api.post(`/admin/services/${service.id}/test`);
      setTestResults(prev => ({ ...prev, [service.id]: { ok: true, version: data.version } }));
    } catch {
      setTestResults(prev => ({ ...prev, [service.id]: { ok: false } }));
    } finally { setTesting(null); }
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout
      title={t('admin.tab.services')}
      count={services.length}
      actions={
        <button onClick={() => { setEditingService(null); setShowModal(true); }} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> {t('common.add')}
        </button>
      }
    >

      {services.length === 0 ? (
        <div className="card p-12 text-center">
          <Server className="w-12 h-12 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted">{t('admin.services.no_services')}</p>
          <p className="text-sm text-ndp-text-dim mt-1">{t('admin.services.no_services_help')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((service) => {
            const schema = SERVICE_SCHEMAS[service.type];
            const result = testResults[service.id] || null;
            return (
              <div key={service.id} className={clsx('card', !service.enabled && 'opacity-50')}>
                <div className="flex items-center gap-4 p-4">
                  {/* Status dot */}
                  <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', service.enabled ? 'bg-ndp-success' : 'bg-ndp-text-dim')} />

                  {/* Icon + info */}
                  <img src={schema?.icon || '/favicon.svg'} alt={schema?.label || service.type} className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ndp-text truncate">{service.name}</span>
                      {service.isDefault && (
                        <span className="px-1.5 py-0.5 bg-ndp-accent/10 text-ndp-accent text-[10px] font-semibold rounded-full flex-shrink-0">{t('common.default_badge')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-ndp-text-dim">{schema?.label || service.type}</span>
                      {service.config.url && <span className="text-xs text-ndp-text-dim truncate">{service.config.url}</span>}
                    </div>
                  </div>

                  {/* Test result */}
                  {result && (
                    <span className={clsx('text-xs px-2 py-1 rounded-lg flex-shrink-0', result.ok ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger')}>
                      {result.ok ? (result.version ? `v${result.version}` : t('status.connected')) : t('status.connection_failed')}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => handleTest(service)} disabled={testing === service.id} className="p-2 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors" title={t('common.test')}>
                      {testing === service.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setEditingService(service); setShowModal(true); }} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={t('common.edit')}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleToggle(service)} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={service.enabled ? t('common.disable') : t('common.enable')}>
                      <Power className={clsx('w-4 h-4', service.enabled && 'text-ndp-success')} />
                    </button>
                    {!service.isDefault && (
                      <button onClick={() => handleSetDefault(service)} className="p-2 text-ndp-text-dim hover:text-ndp-warning hover:bg-white/5 rounded-lg transition-colors" title={t('admin.services.set_default')}>
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    <button onClick={() => setConfirmDelete(service.id)} className="p-2 text-ndp-text-dim hover:text-ndp-danger hover:bg-white/5 rounded-lg transition-colors" title={t('common.delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-ndp-text mb-2">{t('admin.danger.confirm_title')}</h3>
            <p className="text-sm text-ndp-text-muted mb-6">
              {t('admin.services.confirm_delete', { name: services.find(s => s.id === confirmDelete)?.name })}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary text-sm flex-1">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="btn-danger text-sm flex-1 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showModal && (
        <ServiceModal
          service={editingService}
          onClose={() => { setShowModal(false); setEditingService(null); }}
          onSaved={() => { setShowModal(false); setEditingService(null); fetchServices(); }}
        />
      )}
    </AdminTabLayout>
  );
}

function ServiceModal({ service, onClose, onSaved }: { service: ServiceData | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas();
  const isEdit = !!service;
  const [type, setType] = useState(service?.type || 'radarr');
  const [name, setName] = useState(service?.name || '');
  const [config, setConfig] = useState<Record<string, string>>(service?.config || {});
  const [isDefault, setIsDefault] = useState(service?.isDefault || false);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [fetchingPlexToken, setFetchingPlexToken] = useState(false);
  const [detectingMachineId, setDetectingMachineId] = useState(false);
  const [modalError, setModalError] = useState('');

  const schema = SERVICE_SCHEMAS[type];

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const fetchPlexToken = async () => {
    setFetchingPlexToken(true);
    try {
      const { data } = await api.get('/admin/plex-token');
      if (data.token) handleConfigChange('token', data.token);
    } catch {
      setModalError(t('admin.services.plex_token_error'));
      setTimeout(() => setModalError(''), 5000);
    } finally { setFetchingPlexToken(false); }
  };

  const detectMachineId = async () => {
    const url = config.url;
    const token = config.token;
    if (!url || !token) return;
    setDetectingMachineId(true);
    try {
      const res = await fetch(`${url}/identity`, {
        headers: { 'X-Plex-Token': token, Accept: 'application/json' },
      });
      const json = await res.json();
      const machineId = json.MediaContainer?.machineIdentifier;
      if (machineId) handleConfigChange('machineId', machineId);
    } catch { /* empty */ }
    finally { setDetectingMachineId(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/admin/services/${service!.id}`, { name, config, isDefault });
      } else {
        await api.post('/admin/services', { name, type, config, isDefault });
      }
      onSaved();
    } catch { /* empty */ } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ndp-text mb-5">{isEdit ? t('admin.services.edit_title') : t('admin.services.add_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label className="text-sm text-ndp-text mb-1.5 block">{t('admin.services.service_type')}</label>
              <select value={type} onChange={(e) => { setType(e.target.value); setConfig({}); }} className="input w-full">
                {Object.entries(SERVICE_SCHEMAS).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm text-ndp-text mb-1.5 block">{t('common.name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${schema?.label || type} Principal`} className="input w-full" required />
          </div>

          {schema?.fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm text-ndp-text mb-1.5 block">{t(field.labelKey)}</label>
              <div className="relative">
                <input
                  type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                  value={config[field.key] || ''}
                  onChange={(e) => handleConfigChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="input w-full pr-10"
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ndp-text-dim hover:text-ndp-text"
                  >
                    {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {/* Plex helpers */}
              {type === 'plex' && field.key === 'token' && (
                <>
                  <button
                    type="button"
                    onClick={fetchPlexToken}
                    disabled={fetchingPlexToken}
                    className="mt-1.5 text-xs text-ndp-accent hover:text-ndp-accent-hover flex items-center gap-1 transition-colors"
                  >
                    {fetchingPlexToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
                    {t('admin.services.use_plex_token')}
                  </button>
                  {modalError && <p className="text-xs text-ndp-danger mt-1">{modalError}</p>}
                </>
              )}
              {type === 'plex' && field.key === 'machineId' && (
                <button
                  type="button"
                  onClick={detectMachineId}
                  disabled={detectingMachineId || !config.url || !config.token}
                  className="mt-1.5 text-xs text-ndp-accent hover:text-ndp-accent-hover flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  {detectingMachineId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {t('admin.services.auto_detect')}
                </button>
              )}
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm text-ndp-text-muted cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
            {t('admin.services.set_default')}
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? t('common.save') : t('common.add')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
