import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { useFeatures } from '@/context/FeaturesContext';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { FloatingSaveBar } from '@/components/FloatingSaveBar';

/**
 * "How Oscarr behaves" — feature flags + request policy + disabled-login behavior.
 * Split out of the old General tab. Everything here tunes what's on/off and how the site
 * responds to edge cases, without touching the instance's identity.
 */
export function FeaturesTab() {
  const { t } = useTranslation();
  const { refreshFeatures } = useFeatures();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [autoApproveRequests, setAutoApproveRequests] = useState(false);
  const [requestsEnabled, setRequestsEnabled] = useState(true);
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [nsfwBlurEnabled, setNsfwBlurEnabled] = useState(true);
  const [missingSearchCooldownMin, setMissingSearchCooldownMin] = useState(60);
  const [disabledLoginMode, setDisabledLoginMode] = useState<'block' | 'friendly'>('friendly');

  const initialValues = useRef<Record<string, unknown>>({});

  // Refuse to render the form on load failure — otherwise the admin toggles against stale
  // hardcoded defaults and a save would overwrite real config silently.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await api.get('/admin/settings');
      const vals = {
        autoApproveRequests: data.autoApproveRequests ?? false,
        requestsEnabled: data.requestsEnabled ?? true,
        supportEnabled: data.supportEnabled ?? true,
        calendarEnabled: data.calendarEnabled ?? true,
        nsfwBlurEnabled: data.nsfwBlurEnabled ?? true,
        missingSearchCooldownMin: data.missingSearchCooldownMin ?? 60,
        disabledLoginMode: (data.disabledLoginMode === 'block' ? 'block' : 'friendly') as 'block' | 'friendly',
      };
      setAutoApproveRequests(vals.autoApproveRequests);
      setRequestsEnabled(vals.requestsEnabled);
      setSupportEnabled(vals.supportEnabled);
      setCalendarEnabled(vals.calendarEnabled);
      setNsfwBlurEnabled(vals.nsfwBlurEnabled);
      setMissingSearchCooldownMin(vals.missingSearchCooldownMin);
      setDisabledLoginMode(vals.disabledLoginMode);
      initialValues.current = vals;
    } catch (err) {
      console.error('FeaturesTab load failed', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const currentValues = useMemo(
    () => ({ autoApproveRequests, requestsEnabled, supportEnabled, calendarEnabled, nsfwBlurEnabled, missingSearchCooldownMin, disabledLoginMode }),
    [autoApproveRequests, requestsEnabled, supportEnabled, calendarEnabled, nsfwBlurEnabled, missingSearchCooldownMin, disabledLoginMode]
  );

  const hasChanges = !loading && Object.keys(initialValues.current).length > 0 &&
    Object.entries(currentValues).some(([k, v]) => initialValues.current[k] !== v);

  const handleReset = () => {
    const iv = initialValues.current;
    setAutoApproveRequests(iv.autoApproveRequests as boolean);
    setRequestsEnabled(iv.requestsEnabled as boolean);
    setSupportEnabled(iv.supportEnabled as boolean);
    setCalendarEnabled(iv.calendarEnabled as boolean);
    setNsfwBlurEnabled(iv.nsfwBlurEnabled as boolean);
    setMissingSearchCooldownMin(iv.missingSearchCooldownMin as number);
    setDisabledLoginMode(iv.disabledLoginMode as 'block' | 'friendly');
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      await api.put('/admin/settings', {
        autoApproveRequests,
        requestsEnabled,
        supportEnabled,
        calendarEnabled,
        nsfwBlurEnabled,
        missingSearchCooldownMin,
        disabledLoginMode,
      });
      await refreshFeatures();
      initialValues.current = { ...currentValues };
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('FeaturesTab save failed', err);
      setSaveError(t('admin.save_bar.save_failed'));
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  if (loadError) {
    return (
      <AdminTabLayout>
        <div className="mt-6 card p-5 flex items-start gap-3 border-ndp-danger/20 bg-ndp-danger/5">
          <AlertTriangle className="w-5 h-5 text-ndp-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-ndp-text">{t('admin.load.failed')}</p>
            <button onClick={loadAll} className="btn-secondary text-sm mt-3 inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              {t('admin.load.retry')}
            </button>
          </div>
        </div>
      </AdminTabLayout>
    );
  }

  const features = [
    { label: t('admin.features.requests'), desc: t('admin.features.requests_desc'), value: requestsEnabled, set: setRequestsEnabled },
    { label: t('admin.features.auto_approve'), desc: t('admin.features.auto_approve_desc'), value: autoApproveRequests, set: setAutoApproveRequests },
    { label: t('admin.features.support'), desc: t('admin.features.support_desc'), value: supportEnabled, set: setSupportEnabled },
    { label: t('admin.features.calendar'), desc: t('admin.features.calendar_desc'), value: calendarEnabled, set: setCalendarEnabled },
    { label: t('admin.features.nsfw_blur'), desc: t('admin.features.nsfw_blur_desc'), value: nsfwBlurEnabled, set: setNsfwBlurEnabled },
  ];

  return (
    <AdminTabLayout>
      <div>
        <h2 className="text-lg font-semibold text-ndp-text mb-2">{t('admin.features.section_title')}</h2>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.features.section_desc')}</p>
        <div className="space-y-3">
          {features.map(({ label, desc, value, set }) => (
            <div key={label} className="card">
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ndp-text">{label}</p>
                  <p className="text-xs text-ndp-text-dim mt-0.5">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => set(!value)}
                  className={clsx('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', value ? 'bg-ndp-accent' : 'bg-white/10')}
                >
                  <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm', value && 'translate-x-5')} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ndp-text mb-2">{t('admin.features.search_cooldown')}</h2>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.features.search_cooldown_desc')}</p>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1440}
              value={missingSearchCooldownMin}
              onChange={(e) => setMissingSearchCooldownMin(Math.max(1, parseInt(e.target.value) || 60))}
              className="input w-24 text-sm text-center"
            />
            <span className="text-sm text-ndp-text-dim">min</span>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ndp-text mb-2">{t('admin.features.disabled_login_title', 'Disabled accounts')}</h2>
        <p className="text-xs text-ndp-text-dim mb-4">
          {t('admin.features.disabled_login_desc', 'Choose how the login screen responds when a user marked as disabled tries to sign in.')}
        </p>
        <div className="card p-4 space-y-2">
          <label className="flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
            <input type="radio" name="disabledLoginMode" checked={disabledLoginMode === 'friendly'} onChange={() => setDisabledLoginMode('friendly')} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ndp-text">{t('admin.features.disabled_login_friendly', 'Friendly message')}</p>
              <p className="text-xs text-ndp-text-dim mt-0.5">
                {t('admin.features.disabled_login_friendly_desc', 'Login rejected with an explicit message telling the user their account is disabled.')}
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
            <input type="radio" name="disabledLoginMode" checked={disabledLoginMode === 'block'} onChange={() => setDisabledLoginMode('block')} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ndp-text">{t('admin.features.disabled_login_silent', 'Silent block')}</p>
              <p className="text-xs text-ndp-text-dim mt-0.5">
                {t('admin.features.disabled_login_silent_desc', 'Login rejected with a generic "Invalid credentials" error. The user has no indication their account was disabled.')}
              </p>
            </div>
          </label>
        </div>
      </div>

      <FloatingSaveBar show={hasChanges} saving={saving} saved={saved} error={saveError} onSave={handleSave} onReset={handleReset} />
    </AdminTabLayout>
  );
}
