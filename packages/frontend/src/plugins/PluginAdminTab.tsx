import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { PluginSettings } from './types';

interface PluginAdminTabProps {
  pluginId: string;
}

export function PluginAdminTab({ pluginId }: PluginAdminTabProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PluginSettings | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PluginSettings>(`/plugins/${pluginId}/settings`)
      .then(({ data }) => {
        setSettings(data);
        setValues(data.values);
      })
      .catch((err) => setError(err.response?.data?.error || t('plugin.load_error')));
  }, [pluginId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.put(`/plugins/${pluginId}/settings`, values);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || t('plugin.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (error && !settings) {
    return (
      <div className="card p-6 text-center text-ndp-text-muted">
        {error}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-ndp-accent" />
      </div>
    );
  }

  if (!settings.schema || settings.schema.length === 0) {
    return (
      <div className="card p-6 text-center text-ndp-text-muted">
        {t('plugin.no_settings')}
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-6">
      {settings.schema.map((field) => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-ndp-text mb-1.5">
            {field.label}
            {field.required && <span className="text-ndp-danger ml-1">*</span>}
          </label>
          {field.type === 'boolean' ? (
            <button
              onClick={() => setValues({ ...values, [field.key]: !values[field.key] })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                values[field.key] ? 'bg-ndp-accent' : 'bg-white/10'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                values[field.key] ? 'translate-x-6' : ''
              }`} />
            </button>
          ) : (
            <input
              type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
              value={(values[field.key] as string | number) ?? field.default ?? ''}
              onChange={(e) => setValues({
                ...values,
                [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
              })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-ndp-text focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-ndp-danger">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-ndp-accent text-white rounded-xl text-sm font-medium hover:bg-ndp-accent/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saved ? t('plugin.saved') : t('common.save')}
      </button>
    </div>
  );
}
