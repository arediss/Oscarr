import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { KeyRound, Loader2, Check, Copy, Pencil, Power, X, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

interface AuthProviderField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'url';
  required?: boolean;
  placeholder?: string;
  help?: string;
}

interface AuthProviderRow {
  id: string;
  label: string;
  type: 'oauth' | 'credentials';
  configSchema: AuthProviderField[];
  requiresService: boolean;
  serviceAvailable: boolean;
  enabled: boolean;
  config: Record<string, string>;
}

const MASK = '__MASKED__';

/** Per-provider badge color so they're visually distinguishable at a glance. */
const PROVIDER_ACCENT: Record<string, string> = {
  plex: 'bg-[#e5a00d]/15 text-[#e5a00d]',
  discord: 'bg-[#5865F2]/15 text-[#8692ff]',
  jellyfin: 'bg-[#00a4dc]/15 text-[#00a4dc]',
  emby: 'bg-[#52b54b]/15 text-[#52b54b]',
  email: 'bg-white/10 text-ndp-text-muted',
};

export function AuthProvidersTab() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AuthProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AuthProviderRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/auth-providers');
      setProviders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const toggle = async (p: AuthProviderRow) => {
    setTogglingId(p.id);
    try {
      await api.patch(`/admin/auth-providers/${p.id}`, { enabled: !p.enabled });
      await fetchProviders();
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout title={t('admin.authProviders.title')} count={providers.length}>
      <p className="text-sm text-ndp-text-dim mb-6">{t('admin.authProviders.subtitle')}</p>

      {providers.length === 0 ? (
        <div className="card p-12 text-center">
          <KeyRound className="w-12 h-12 text-ndp-text-dim mx-auto mb-4 opacity-50" />
          <p className="text-sm text-ndp-text">{t('admin.authProviders.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              busy={togglingId === p.id}
              onToggle={() => toggle(p)}
              onEdit={() => setEditing(p)}
            />
          ))}
        </div>
      )}

      {editing && createPortal(
        <ProviderConfigModal
          provider={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchProviders(); }}
        />,
        document.body
      )}
    </AdminTabLayout>
  );
}

function ProviderRow({
  provider, busy, onToggle, onEdit,
}: {
  provider: AuthProviderRow;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  // Grey out the row when a required Service isn't configured — the toggle would "work"
  // server-side but the login wouldn't, so we signal unavailability without hiding the entry.
  const unavailable = provider.requiresService && !provider.serviceAvailable;
  const hasSettings = provider.configSchema.length > 0;
  const accent = PROVIDER_ACCENT[provider.id] ?? 'bg-ndp-accent/15 text-ndp-accent';

  return (
    <div className={clsx('card', unavailable && 'opacity-50')}>
      <div className="flex items-center gap-4 p-4">
        <span
          className={clsx(
            'w-2.5 h-2.5 rounded-full flex-shrink-0',
            provider.enabled && !unavailable ? 'bg-ndp-success' : 'bg-ndp-text-dim'
          )}
        />

        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0', accent)}>
          {provider.label.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ndp-text truncate">{provider.label}</span>
            <span className="text-xs text-ndp-text-dim">
              {provider.type === 'oauth' ? 'OAuth 2.0' : 'Credentials'}
            </span>
          </div>
          {unavailable ? (
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-ndp-warning">
              <AlertTriangle className="w-3 h-3" />
              {t('admin.authProviders.service_required', { service: provider.label })}
            </div>
          ) : (
            <div className="text-xs text-ndp-text-dim mt-0.5">
              {hasSettings
                ? t('admin.authProviders.n_fields', { count: provider.configSchema.length })
                : t('admin.authProviders.no_config')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {hasSettings && (
            <button
              onClick={onEdit}
              disabled={unavailable}
              className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('common.edit')}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onToggle}
            disabled={busy || unavailable}
            className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={provider.enabled ? t('common.disable') : t('common.enable')}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Power className={clsx('w-4 h-4', provider.enabled && !unavailable && 'text-ndp-success')} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderConfigModal({
  provider, onClose, onSaved,
}: {
  provider: AuthProviderRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Record<string, string>>(provider.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Strip fields that still hold the server-side MASK so we don't clobber stored secrets.
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) {
        if (v === MASK) continue;
        cleaned[k] = v;
      }
      await api.patch(`/admin/auth-providers/${provider.id}`, { config: cleaned });
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err as Error).message;
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="card w-full max-w-lg shadow-2xl shadow-black/50" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ndp-text">{provider.label}</h2>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              {provider.type === 'oauth' ? 'OAuth 2.0' : 'Credentials'} · {t('admin.authProviders.configure')}
            </p>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-4 flex flex-col gap-3">
          {provider.configSchema.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={typeof config[field.key] === 'string' ? config[field.key] : ''}
              onChange={(v) => setConfig((prev) => ({ ...prev, [field.key]: v }))}
            />
          ))}
          {error && (
            <div className="flex items-center gap-2 text-xs text-ndp-danger bg-ndp-danger/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 pt-4 pb-6 border-t border-white/5">
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="btn-secondary text-sm flex-1 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary text-sm flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('admin.authProviders.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigField({
  field, value, onChange,
}: {
  field: AuthProviderField;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const isMasked = value === MASK;
  const [revealMasked, setRevealMasked] = useState(false);
  const displayValue = isMasked && !revealMasked ? '••••••••' : value;
  // When the server sent a placeholder and the field is empty, offer quick access to the
  // suggested value so the admin doesn't have to guess (e.g. Discord redirect URI).
  const hasValue = !!value && !isMasked;
  const showSuggestion = !hasValue && !!field.placeholder;

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ndp-text-dim">
        {field.label}{field.required && ' *'}
      </span>
      <div className="flex gap-2">
        <input
          type={field.type === 'password' && !revealMasked ? 'password' : 'text'}
          value={displayValue}
          placeholder={field.placeholder}
          onFocus={() => {
            if (isMasked) {
              onChange('');
              setRevealMasked(true);
            }
          }}
          onChange={(e) => onChange(e.target.value)}
          className="input flex-1"
        />
        {field.type === 'url' && hasValue && (
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(value); }}
            className="btn-secondary px-3"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
      {showSuggestion && (
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className="text-ndp-text-dim flex-shrink-0">{t('admin.authProviders.suggested')}:</span>
          <code className="flex-1 bg-black/30 rounded px-2 py-1 text-ndp-text font-mono truncate">
            {field.placeholder}
          </code>
          <button
            type="button"
            onClick={() => onChange(field.placeholder!)}
            className="px-2 py-1 rounded bg-ndp-accent/15 text-ndp-accent hover:bg-ndp-accent/25 transition-colors flex-shrink-0"
            title={t('admin.authProviders.use_suggested')}
          >
            {t('common.use')}
          </button>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(field.placeholder!); }}
            className="p-1 rounded text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
            title={t('common.copy')}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {field.help && <p className="text-xs text-ndp-text-dim">{field.help}</p>}
    </label>
  );
}
