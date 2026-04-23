import { useState, useId, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, Plug, RefreshCw, Save, KeyRound } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError, showToast } from '@/utils/toast';
import { useServiceSchemas, type ServiceData } from '@/hooks/useServiceSchemas';
import { useModal } from '@/hooks/useModal';

/** Mirrors backend MASK — resubmitting this value tells the backend to keep the stored secret. */
const MASK = '__MASKED__';

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
  const fieldId = useId();
  const { dialogRef, titleId } = useModal({ open: true, onClose });
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

  const promptPassword = (): string | null => {
    const pwd = window.prompt(t('admin.services.reveal_password_prompt'));
    return pwd && pwd.length > 0 ? pwd : null;
  };

  const revealSecret = async (key: string) => {
    if (!service) return;
    const password = promptPassword();
    if (!password) return;
    try {
      const { data } = await api.post(`/admin/services/${service.id}/config/reveal`, { password });
      const value = data?.config?.[key];
      if (typeof value === 'string') {
        handleConfigChange(key, value);
        setShowSecrets((prev) => ({ ...prev, [key]: true }));
      }
    } catch (err) {
      toastApiError(err, t('admin.services.reveal_failed'));
    }
  };

  const copySecret = async (key: string) => {
    if (!service) return;
    const password = promptPassword();
    if (!password) return;
    try {
      const { data } = await api.post(`/admin/services/${service.id}/config/reveal`, { password });
      const value = data?.config?.[key];
      if (typeof value === 'string') {
        await navigator.clipboard.writeText(value);
        showToast(t('common.copied'), 'success');
      }
    } catch (err) {
      toastApiError(err, t('admin.services.reveal_failed'));
    }
  };

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authWindowRef = useRef<Window | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    authWindowRef.current?.close();
    authWindowRef.current = null;
    setFetchingPlexToken(false);
  };

  const fetchPlexToken = async () => {
    setModalError('');
    setFetchingPlexToken(true);
    // Popup must open synchronously on the user gesture or Safari blocks it.
    authWindowRef.current = window.open('about:blank', 'PlexAuth', 'width=600,height=700');
    try {
      const { data } = await api.post<{ pin: { id: number }; authUrl: string }>('/admin/plex-pin');
      if (authWindowRef.current) authWindowRef.current.location.href = data.authUrl;
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts >= 120) {
          stopPolling();
          setModalError(t('admin.services.plex_token_error'));
          return;
        }
        try {
          const res = await api.post<{ token?: string }>('/admin/plex-check', { pinId: data.pin.id });
          if (res.data.token) {
            handleConfigChange('token', res.data.token);
            stopPolling();
          }
        } catch (err) {
          // 400 = PIN not yet validated → keep polling. Anything else (401 session expired,
          // 403 CSRF, 404 bad pin, 429 rate-limit, 5xx) is terminal — stop + surface.
          const status = (err as { response?: { status?: number } }).response?.status;
          if (status !== undefined && status !== 400) {
            stopPolling();
            setModalError(t('admin.services.plex_token_error'));
          }
        }
      }, 1000);
    } catch {
      stopPolling();
      setModalError(t('admin.services.plex_token_error'));
    }
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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold text-ndp-text mb-5">{isEdit ? t('admin.services.edit_title') : t('admin.services.add_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label htmlFor={`${fieldId}-type`} className="text-sm text-ndp-text mb-1.5 block">{t('admin.services.service_type')}</label>
              <select id={`${fieldId}-type`} value={type} onChange={(e) => { setType(e.target.value); setConfig({}); }} className="input w-full">
                {Object.entries(SERVICE_SCHEMAS).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor={`${fieldId}-name`} className="text-sm text-ndp-text mb-1.5 block">{t('common.name')}</label>
            <input id={`${fieldId}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${schema?.label || type} Principal`} className="input w-full" required />
          </div>

          {schema?.fields.map((field) => {
            const isMasked = field.type === 'password' && config[field.key] === MASK;
            return (
            <div key={field.key}>
              <label htmlFor={`${fieldId}-${field.key}`} className="text-sm text-ndp-text mb-1.5 block">{t(field.labelKey)}</label>
              <div className="relative">
                <input
                  id={`${fieldId}-${field.key}`}
                  type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                  value={isMasked ? '' : (config[field.key] || '')}
                  onChange={(e) => handleConfigChange(field.key, e.target.value)}
                  onFocus={() => { if (isMasked) handleConfigChange(field.key, ''); }}
                  placeholder={isMasked ? t('admin.services.secret_stored') : field.placeholder}
                  className="input w-full pr-20"
                />
                {field.type === 'password' && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isEdit && (
                      <button
                        type="button"
                        onClick={() => copySecret(field.key)}
                        className="p-1 text-ndp-text-dim hover:text-ndp-text"
                        title={t('common.copy')}
                        aria-label={t('common.copy')}
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (isMasked) {
                          revealSecret(field.key);
                        } else {
                          setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }));
                        }
                      }}
                      className="p-1 text-ndp-text-dim hover:text-ndp-text"
                      aria-label={showSecrets[field.key] ? t('common.hide') : t('common.show')}
                    >
                      {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
            );
          })}

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
