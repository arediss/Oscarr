import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { KeyRound, Loader2, Check, Copy } from 'lucide-react';
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
  enabled: boolean;
  config: Record<string, string>;
}

const MASK = '__MASKED__';

export function AuthProvidersTab() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AuthProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, { enabled?: boolean; config?: Record<string, string> }>>({});

  const fetchProviders = useCallback(() => {
    setLoading(true);
    api.get('/admin/auth-providers')
      .then(({ data }) => setProviders(data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const patch = async (id: string) => {
    const change = dirty[id];
    if (!change) return;
    setSaving(id);
    try {
      await api.patch(`/admin/auth-providers/${id}`, change);
      setDirty(d => { const next = { ...d }; delete next[id]; return next; });
      fetchProviders();
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout title={t('admin.authProviders.title')} count={providers.length}>
      <p className="text-sm text-ndp-text-dim mb-6">{t('admin.authProviders.subtitle')}</p>

      {providers.length === 0 ? (
        <div className="card p-10 text-center">
          <KeyRound className="w-12 h-12 text-ndp-text-dim mx-auto mb-4 opacity-50" />
          <p className="text-sm text-ndp-text">{t('admin.authProviders.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              dirty={dirty[p.id]}
              onChange={(next) => setDirty((d) => ({ ...d, [p.id]: { ...d[p.id], ...next } }))}
              onSave={() => patch(p.id)}
              saving={saving === p.id}
            />
          ))}
        </div>
      )}
    </AdminTabLayout>
  );
}

function ProviderCard({
  provider, dirty, onChange, onSave, saving,
}: {
  provider: AuthProviderRow;
  dirty: { enabled?: boolean; config?: Record<string, string> } | undefined;
  onChange: (next: { enabled?: boolean; config?: Record<string, string> }) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const enabled = dirty?.enabled ?? provider.enabled;
  const config: Record<string, string> = { ...provider.config, ...(dirty?.config ?? {}) };
  const hasChanges = dirty !== undefined;

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ndp-text">{provider.label}</h3>
          <p className="text-xs text-ndp-text-dim mt-0.5">
            {provider.type === 'oauth' ? 'OAuth 2.0' : 'Credentials'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ enabled: !enabled })}
          className={clsx(
            'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
            enabled ? 'bg-ndp-accent' : 'bg-white/10'
          )}
          aria-label={enabled ? t('admin.authProviders.enabled') : t('admin.authProviders.disabled')}
        >
          <span
            className={clsx(
              'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform',
              enabled && 'translate-x-4'
            )}
          />
        </button>
      </div>

      {provider.configSchema.length > 0 && (
        <div className="flex flex-col gap-3">
          {provider.configSchema.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={typeof config[field.key] === 'string' ? config[field.key] : ''}
              onChange={(v) => onChange({ config: { ...(dirty?.config ?? {}), [field.key]: v } })}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end pt-3 border-t border-white/5">
        <button
          type="button"
          onClick={onSave}
          disabled={!hasChanges || saving}
          className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t('admin.authProviders.save')}
        </button>
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
  const isMasked = value === MASK;
  const [revealMasked, setRevealMasked] = useState(false);
  const displayValue = isMasked && !revealMasked ? '••••••••' : value;

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
              // User wants to edit — clear the mask and let them type a new value.
              onChange('');
              setRevealMasked(true);
            }
          }}
          onChange={(e) => onChange(e.target.value)}
          className="input flex-1"
        />
        {field.type === 'url' && value && !isMasked && (
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
      {field.help && <p className="text-xs text-ndp-text-dim">{field.help}</p>}
    </label>
  );
}
