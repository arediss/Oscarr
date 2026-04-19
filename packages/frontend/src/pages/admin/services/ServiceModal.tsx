import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, Plug, RefreshCw, Save } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { useServiceSchemas, type ServiceData } from '@/hooks/useServiceSchemas';

interface ServiceModalProps {
  service: ServiceData | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Create / edit form for a service. Dynamic fields driven by the service schema, with two
 *  Plex-specific helpers (fetch saved token from the admin's linked account, auto-detect the
 *  server's machineIdentifier via /identity). */
export function ServiceModal({ service, onClose, onSaved }: ServiceModalProps) {
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
    } catch (err) { toastApiError(err, t('admin.services.detect_machine_id_failed')); }
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
    } catch (err) { toastApiError(err, t(isEdit ? 'admin.services.save_failed' : 'admin.services.create_failed')); }
    finally { setSaving(false); }
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
    document.body,
  );
}
