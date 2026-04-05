import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Save, CheckCircle, AlertTriangle, ArrowUpCircle, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { useFeatures } from '@/context/FeaturesContext';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

const AVAILABLE_LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'no', label: 'Norsk' },
  { code: 'fi', label: 'Suomi' },
];

export function GeneralTab() {
  const { t } = useTranslation();
  const { refreshFeatures } = useFeatures();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoApproveRequests, setAutoApproveRequests] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [requestsEnabled, setRequestsEnabled] = useState(true);
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [missingSearchCooldownMin, setMissingSearchCooldownMin] = useState(60);
  const [siteName, setSiteName] = useState('Oscarr');
  const [instanceLanguage, setInstanceLanguage] = useState('en');
  const [bannerText, setBannerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [versionInfo, setVersionInfo] = useState<{ current: string; latest?: string; updateAvailable?: boolean; releaseUrl?: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/admin/settings').then(({ data }) => {
        setAutoApproveRequests(data.autoApproveRequests ?? false);
        setRegistrationEnabled(data.registrationEnabled ?? true);
        setRequestsEnabled(data.requestsEnabled ?? true);
        setSupportEnabled(data.supportEnabled ?? true);
        setCalendarEnabled(data.calendarEnabled ?? true);
        setMissingSearchCooldownMin(data.missingSearchCooldownMin ?? 60);
        setSiteName(data.siteName ?? 'Oscarr');
        setInstanceLanguage(data.instanceLanguages?.[0] ?? 'en');
      }),
      api.get('/app/banner').then(({ data }) => setBannerText(data.banner || '')),
      api.get('/app/version').then(({ data }) => setVersionInfo(data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await Promise.all([
        api.put('/admin/settings', {
          autoApproveRequests,
          registrationEnabled,
          requestsEnabled,
          supportEnabled,
          calendarEnabled,
          missingSearchCooldownMin,
          siteName: siteName.trim() || 'Oscarr',
          instanceLanguages: [instanceLanguage],
        }),
        api.put('/admin/banner', { banner: bannerText.trim() || null }),
      ]);
      await refreshFeatures();
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  const features = [
    { label: t('admin.general.feature.registration'), desc: t('admin.general.feature.registration_desc'), value: registrationEnabled, set: setRegistrationEnabled },
    { label: t('admin.general.feature.requests'), desc: t('admin.general.feature.requests_desc'), value: requestsEnabled, set: setRequestsEnabled },
    { label: t('admin.general.feature.auto_approve'), desc: t('admin.general.feature.auto_approve_desc'), value: autoApproveRequests, set: setAutoApproveRequests },
    { label: t('admin.general.feature.support'), desc: t('admin.general.feature.support_desc'), value: supportEnabled, set: setSupportEnabled },
    { label: t('admin.general.feature.calendar'), desc: t('admin.general.feature.calendar_desc'), value: calendarEnabled, set: setCalendarEnabled },
  ];

  return (
    <AdminTabLayout
      title={t('admin.tab.general')}
      actions={
        <button onClick={handleSave} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t('common.saved') : t('common.save')}
        </button>
      }
    >

      {/* Version */}
      {versionInfo && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-ndp-text">{t('admin.general.oscarr')}</span>
              <span className="text-xs text-ndp-text-dim font-mono ml-2">{versionInfo.current}</span>
            </div>
            {versionInfo.updateAvailable && versionInfo.latest ? (
              <a href={versionInfo.releaseUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-ndp-accent/10 text-ndp-accent rounded-lg text-xs font-medium hover:bg-ndp-accent/20 transition-colors">
                <ArrowUpCircle className="w-3.5 h-3.5" />
                {t('admin.general.update_available', { version: versionInfo.latest })}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : versionInfo.latest ? (
              <span className="flex items-center gap-1.5 text-xs text-ndp-success">
                <CheckCircle className="w-3.5 h-3.5" />
                {t('admin.general.up_to_date')}
              </span>
            ) : (
              <span className="text-xs text-ndp-text-dim">{t('admin.general.update_check_failed')}</span>
            )}
          </div>
        </div>
      )}

      {/* Site config */}
      <div className="space-y-3 mt-6">
        <div className="card p-4">
          <div className="mb-2">
            <span className="text-sm font-medium text-ndp-text">{t('admin.general.site_name')}</span>
            <span className="text-xs text-ndp-text-dim ml-2">{t('admin.general.site_name_desc')}</span>
          </div>
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Oscarr"
            className="input w-full text-sm"
          />
        </div>
        <div className="card p-4">
          <div className="mb-2">
            <span className="text-sm font-medium text-ndp-text">{t('admin.general.instance_languages')}</span>
            <span className="text-xs text-ndp-text-dim ml-2">{t('admin.general.instance_languages_desc')}</span>
          </div>
          <select
            value={instanceLanguage}
            onChange={(e) => setInstanceLanguage(e.target.value)}
            className="input text-sm w-full"
          >
            {AVAILABLE_LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="card p-4">
          <div className="mb-2">
            <span className="text-sm font-medium text-ndp-text">{t('admin.general.maintenance_banner')}</span>
            <span className="text-xs text-ndp-text-dim ml-2">{t('admin.general.maintenance_desc')}</span>
          </div>
          <input
            value={bannerText}
            onChange={(e) => setBannerText(e.target.value)}
            placeholder={t('admin.general.maintenance_placeholder')}
            className="input w-full text-sm"
          />
        </div>
        <div className="card p-4">
          <div className="mb-2">
            <span className="text-sm font-medium text-ndp-text">{t('admin.general.search_cooldown')}</span>
            <span className="text-xs text-ndp-text-dim ml-2">{t('admin.general.search_cooldown_desc')}</span>
          </div>
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

      {/* Feature Flags */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ndp-text mb-2">{t('admin.general.features')}</h2>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.general.features_desc')}</p>
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

    </AdminTabLayout>
  );
}

// ============ DANGER ZONE ============
// Note: DangerZone uses dangerouslySetInnerHTML with i18n translation strings only (safe, no user input)
export function DangerZone() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; label: string; desc: string; keyword: string; onConfirm: () => Promise<void> } | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const actions = [
    {
      id: 'requests',
      label: t('admin.danger.purge_requests'),
      desc: t('admin.danger.purge_requests_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/requests');
        setResult(t('admin.danger.deleted_requests', { count: data.deleted }));
      },
    },
    {
      id: 'media',
      label: t('admin.danger.purge_media'),
      desc: t('admin.danger.purge_media_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/media');
        setResult(t('admin.danger.deleted_media', { media: data.deleted.media, seasons: data.deleted.seasons, requests: data.deleted.requests }));
      },
    },
    {
      id: 'users',
      label: t('admin.danger.purge_users'),
      desc: t('admin.danger.purge_users_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/users');
        setResult(t('admin.danger.deleted_users', { count: data.deleted }));
      },
    },
  ];

  const handleExecute = async () => {
    if (!confirmAction || confirmInput !== confirmAction.keyword) return;
    setExecuting(true);
    try {
      await confirmAction.onConfirm();
      setConfirmAction(null);
      setConfirmInput('');
    } catch (err) { console.error(err); }
    finally { setExecuting(false); }
  };

  return (
    <div className="mt-8">
      <div className="border border-ndp-danger/20 rounded-2xl overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-6 py-4 bg-ndp-danger/5 flex items-center justify-between hover:bg-ndp-danger/10 transition-colors"
        >
          <div className="text-left">
            <h3 className="text-sm font-semibold text-ndp-danger flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t('admin.danger.title')}
            </h3>
            <p className="text-xs text-ndp-text-dim mt-1">{t('admin.danger.description')}</p>
          </div>
          <svg className={clsx('w-4 h-4 text-ndp-danger transition-transform duration-200', expanded && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div className={clsx('overflow-hidden transition-all duration-200', expanded ? 'max-h-[1000px]' : 'max-h-0')}>
          {result && (
            <div className="px-6 py-3 bg-ndp-success/5 border-t border-ndp-danger/20 animate-fade-in">
              <p className="text-sm text-ndp-success flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {result}
              </p>
            </div>
          )}

          <div className="divide-y divide-ndp-danger/10 border-t border-ndp-danger/20">
            {actions.map((action) => (
              <div key={action.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ndp-text">{action.label}</p>
                  <p className="text-xs text-ndp-text-dim mt-0.5">{action.desc}</p>
                </div>
                <button
                  onClick={() => { setConfirmAction(action); setConfirmInput(''); setResult(null); }}
                  className="flex-shrink-0 px-4 py-2 text-sm font-medium text-ndp-danger border border-ndp-danger/30 rounded-xl hover:bg-ndp-danger/10 transition-colors"
                >
                  {action.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmation modal - uses dangerouslySetInnerHTML with i18n strings only (safe) */}
      {confirmAction && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !executing && setConfirmAction(null)}>
          <div className="bg-ndp-surface border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ndp-text flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-ndp-danger" />
              {t('admin.danger.confirm_title')}
            </h3>
            <p className="text-sm text-ndp-text-muted mt-3">{confirmAction.desc}</p>
            <p className="text-sm text-ndp-text-muted mt-4" dangerouslySetInnerHTML={{ __html: t('admin.danger.confirm_text', { keyword: confirmAction.keyword }) }} />
            <input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={confirmAction.keyword}
              className="input w-full mt-3 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            />
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setConfirmAction(null)} disabled={executing} className="btn-secondary text-sm">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleExecute}
                disabled={confirmInput !== confirmAction.keyword || executing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ndp-danger rounded-xl hover:bg-ndp-danger/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {executing && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirmAction.label}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
