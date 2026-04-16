import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, AlertTriangle, ArrowUpCircle, ExternalLink, Key, Copy, RefreshCw, Trash2, Eye, EyeOff, FileText, Download, Upload, Archive, X } from 'lucide-react';
import ChangelogModal from '@/components/ChangelogModal';
import api from '@/lib/api';
import { useFeatures } from '@/context/FeaturesContext';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { FloatingSaveBar } from '@/components/FloatingSaveBar';

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
  const [nsfwBlurEnabled, setNsfwBlurEnabled] = useState(true);
  const [missingSearchCooldownMin, setMissingSearchCooldownMin] = useState(60);
  const [siteName, setSiteName] = useState('Oscarr');
  const [siteUrl, setSiteUrl] = useState('');
  const [instanceLanguage, setInstanceLanguage] = useState('en');
  const [disabledLoginMode, setDisabledLoginMode] = useState<'block' | 'friendly'>('friendly');
  const [bannerText, setBannerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [versionInfo, setVersionInfo] = useState<{ current: string; latest?: string; updateAvailable?: boolean; releaseUrl?: string } | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [apiKeyFull, setApiKeyFull] = useState<string | null>(null); // Only set after generate
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiKeyHasKey, setApiKeyHasKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  const initialValues = useRef<Record<string, unknown>>({});

  useEffect(() => {
    Promise.all([
      api.get('/admin/api-key').then(({ data }) => { setApiKeyHasKey(data.hasKey); setApiKeyMasked(data.maskedKey); }),
      api.get('/admin/settings').then(({ data }) => {
        const vals = {
          autoApproveRequests: data.autoApproveRequests ?? false,
          registrationEnabled: data.registrationEnabled ?? true,
          requestsEnabled: data.requestsEnabled ?? true,
          supportEnabled: data.supportEnabled ?? true,
          calendarEnabled: data.calendarEnabled ?? true,
          nsfwBlurEnabled: data.nsfwBlurEnabled ?? true,
          missingSearchCooldownMin: data.missingSearchCooldownMin ?? 60,
          siteName: data.siteName ?? 'Oscarr',
          siteUrl: data.siteUrl ?? '',
          instanceLanguage: data.instanceLanguages?.[0] ?? 'en',
          disabledLoginMode: (data.disabledLoginMode === 'block' ? 'block' : 'friendly') as 'block' | 'friendly',
        };
        setAutoApproveRequests(vals.autoApproveRequests);
        setRegistrationEnabled(vals.registrationEnabled);
        setRequestsEnabled(vals.requestsEnabled);
        setSupportEnabled(vals.supportEnabled);
        setCalendarEnabled(vals.calendarEnabled);
        setNsfwBlurEnabled(vals.nsfwBlurEnabled);
        setMissingSearchCooldownMin(vals.missingSearchCooldownMin);
        setSiteName(vals.siteName);
        setSiteUrl(vals.siteUrl);
        setInstanceLanguage(vals.instanceLanguage);
        setDisabledLoginMode(vals.disabledLoginMode);
        initialValues.current = { ...vals, bannerText: initialValues.current.bannerText ?? '' };
        return data;
      }),
      api.get('/app/banner').then(({ data }) => {
        const banner = data.banner || '';
        setBannerText(banner);
        initialValues.current = { ...initialValues.current, bannerText: banner };
      }),
      api.get('/app/version').then(({ data }) => setVersionInfo(data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const currentValues = useMemo(() => ({
    autoApproveRequests, registrationEnabled, requestsEnabled, nsfwBlurEnabled, supportEnabled,
    calendarEnabled, missingSearchCooldownMin, siteName, siteUrl, instanceLanguage, disabledLoginMode, bannerText,
  }), [autoApproveRequests, registrationEnabled, requestsEnabled, nsfwBlurEnabled, supportEnabled,
    calendarEnabled, missingSearchCooldownMin, siteName, siteUrl, instanceLanguage, disabledLoginMode, bannerText]);

  const hasChanges = !loading && Object.keys(initialValues.current).length > 0 &&
    Object.entries(currentValues).some(([k, v]) => initialValues.current[k] !== v);

  const handleReset = () => {
    const iv = initialValues.current;
    setAutoApproveRequests(iv.autoApproveRequests as boolean);
    setRegistrationEnabled(iv.registrationEnabled as boolean);
    setRequestsEnabled(iv.requestsEnabled as boolean);
    setSupportEnabled(iv.supportEnabled as boolean);
    setCalendarEnabled(iv.calendarEnabled as boolean);
    setNsfwBlurEnabled(iv.nsfwBlurEnabled as boolean);
    setMissingSearchCooldownMin(iv.missingSearchCooldownMin as number);
    setSiteName(iv.siteName as string);
    setSiteUrl(iv.siteUrl as string);
    setInstanceLanguage(iv.instanceLanguage as string);
    setDisabledLoginMode(iv.disabledLoginMode as 'block' | 'friendly');
    setBannerText(iv.bannerText as string);
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await Promise.all([
        api.put('/admin/settings', {
          autoApproveRequests,
          registrationEnabled,
          requestsEnabled,
          nsfwBlurEnabled,
          supportEnabled,
          calendarEnabled,
          missingSearchCooldownMin,
          siteName: siteName.trim() || 'Oscarr',
          siteUrl: siteUrl.trim() || '',
          instanceLanguages: [instanceLanguage],
          disabledLoginMode,
        }),
        api.put('/admin/banner', { banner: bannerText.trim() || null }),
      ]);
      await refreshFeatures();
      initialValues.current = { ...currentValues };
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
    { label: t('admin.general.feature.nsfw_blur'), desc: t('admin.general.feature.nsfw_blur_desc'), value: nsfwBlurEnabled, set: setNsfwBlurEnabled },
  ];

  return (
    <AdminTabLayout title={t('admin.tab.general')}>

      {/* Version */}
      {versionInfo && (
        <div className="flex gap-3">
          <div className="card p-4 flex-[7] flex items-center justify-between">
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
          <button
            onClick={() => setChangelogOpen(true)}
            className="card px-4 py-3 flex items-center justify-center gap-1.5 text-xs font-medium text-ndp-text-dim hover:text-ndp-accent transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            {t('changelog.view')}
          </button>
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
            <span className="text-sm font-medium text-ndp-text">{t('admin.general.site_url')}</span>
            <span className="text-xs text-ndp-text-dim ml-2">{t('admin.general.site_url_desc')}</span>
          </div>
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://oscarr.example.com"
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

      {/* API Key */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ndp-text mb-2 flex items-center gap-2">
          <Key className="w-5 h-5" />
          {t('admin.general.api_key')}
        </h2>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.general.api_key_desc')}</p>
        <div className="card p-4">
          {apiKeyHasKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <code className="flex-1 text-xs font-mono bg-black/20 px-3 py-2 rounded-lg text-ndp-text truncate select-all">
                  {apiKeyFull && apiKeyVisible ? apiKeyFull : apiKeyMasked}
                </code>
                {apiKeyFull && (
                  <>
                    <button
                      onClick={() => setApiKeyVisible(!apiKeyVisible)}
                      className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
                    >
                      {apiKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(apiKeyFull); setApiKeyCopied(true); setTimeout(() => setApiKeyCopied(false), 2000); }}
                      className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
                    >
                      {apiKeyCopied ? <CheckCircle className="w-3.5 h-3.5 text-ndp-success" /> : <Copy className="w-3.5 h-3.5" />}
                      {apiKeyCopied ? t('common.copied') : t('common.copy')}
                    </button>
                  </>
                )}
                <button
                  onClick={async () => {
                    setApiKeyLoading(true);
                    try {
                      const { data } = await api.post('/admin/api-key/generate');
                      setApiKeyFull(data.apiKey);
                      setApiKeyMasked(`${data.apiKey.slice(0, 8)}${'•'.repeat(24)}${data.apiKey.slice(-8)}`);
                      setApiKeyHasKey(true);
                      setApiKeyVisible(true);
                    } finally { setApiKeyLoading(false); }
                  }}
                  disabled={apiKeyLoading}
                  className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
                >
                  <RefreshCw className={clsx('w-3.5 h-3.5', apiKeyLoading && 'animate-spin')} />
                  {t('admin.general.regenerate')}
                </button>
                <button
                  onClick={async () => { await api.delete('/admin/api-key'); setApiKeyFull(null); setApiKeyMasked(null); setApiKeyHasKey(false); setApiKeyVisible(false); }}
                  className="text-xs text-ndp-danger hover:text-ndp-danger/80 flex items-center gap-1.5 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {apiKeyFull && (
                <p className="text-xs text-ndp-warning">{t('admin.general.api_key_copy_warning')}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-ndp-text-dim">{t('admin.general.no_api_key')}</span>
              <button
                onClick={async () => {
                  setApiKeyLoading(true);
                  try {
                    const { data } = await api.post('/admin/api-key/generate');
                    setApiKeyFull(data.apiKey);
                    setApiKeyMasked(`${data.apiKey.slice(0, 8)}${'•'.repeat(24)}${data.apiKey.slice(-8)}`);
                    setApiKeyHasKey(true);
                    setApiKeyVisible(true);
                  } finally { setApiKeyLoading(false); }
                }}
                disabled={apiKeyLoading}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {apiKeyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                {t('admin.general.generate_api_key')}
              </button>
            </div>
          )}
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

      {/* Disabled accounts login behavior */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ndp-text mb-2">Disabled accounts</h2>
        <p className="text-xs text-ndp-text-dim mb-4">
          Choose how the login screen responds when a user marked as disabled tries to sign in.
        </p>
        <div className="card p-4 space-y-2">
          <label className="flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
            <input
              type="radio"
              name="disabledLoginMode"
              checked={disabledLoginMode === 'friendly'}
              onChange={() => setDisabledLoginMode('friendly')}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-ndp-text">Friendly message</p>
              <p className="text-xs text-ndp-text-dim mt-0.5">
                Login rejected with an explicit message telling the user their account is disabled.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
            <input
              type="radio"
              name="disabledLoginMode"
              checked={disabledLoginMode === 'block'}
              onChange={() => setDisabledLoginMode('block')}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-ndp-text">Silent block</p>
              <p className="text-xs text-ndp-text-dim mt-0.5">
                Login rejected with a generic "Invalid credentials" error. The user has no indication their account was disabled.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Backup & Restore */}
      <BackupRestore />

      <FloatingSaveBar show={hasChanges} saving={saving} saved={saved} onSave={handleSave} onReset={handleReset} />
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />

    </AdminTabLayout>
  );
}

// ============ BACKUP & RESTORE ============

function BackupRestore() {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreManifest, setRestoreManifest] = useState<{ version: string; createdAt: string; stats: Record<string, number> } | null>(null);
  const [restoreValidation, setRestoreValidation] = useState<{ compatible: boolean; needsMigration: boolean; error?: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [includeCache, setIncludeCache] = useState(false);
  const [savedBackups, setSavedBackups] = useState<{ filename: string; size: number; createdAt: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/admin/backup/list').then(({ data }) => setSavedBackups(data)).catch(() => {});
  }, []);

  const handleBackup = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get(`/admin/backup/create?includeCache=${includeCache}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oscarr-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    finally { setDownloading(false); }
  };

  const handleFileSelect = async (file: File) => {
    setRestoreFile(file);
    setRestoreManifest(null);
    setRestoreValidation(null);
    setRestoreError(null);
    setRestoreResult(null);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) { setRestoreError(t('admin.backup.invalid_archive')); return; }

      const manifest = JSON.parse(await manifestFile.async('text'));
      setRestoreManifest(manifest);

      const { data } = await api.post('/admin/backup/validate', { manifest });
      setRestoreValidation(data);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg === 'BACKUP_TOO_NEW') setRestoreError(t('admin.backup.too_new'));
      else setRestoreError(msg || t('admin.backup.validation_failed'));
    }
  };

  const handleRestore = async () => {
    if (!restoreFile || !restoreManifest) return;
    setRestoring(true);
    setRestoreError(null);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(restoreFile);
      const dbFile = zip.file('oscarr.db');
      if (!dbFile) { setRestoreError(t('admin.backup.no_db')); setRestoring(false); return; }

      const dbBase64 = await dbFile.async('base64');
      const { data } = await api.post('/admin/backup/restore', {
        db: dbBase64,
        manifest: restoreManifest,
      });

      setRestoreResult(data.message);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRestoreError(msg || t('admin.backup.restore_failed'));
    } finally { setRestoring(false); }
  };

  return (
    <div className="mt-6">
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-ndp-text">{t('admin.backup.title')}</h3>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleBackup}
            disabled={downloading}
            className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          >
            {downloading ? <Loader2 className="w-5 h-5 text-ndp-accent animate-spin" /> : <Download className="w-5 h-5 text-ndp-accent" />}
            <div className="text-left">
              <p className="text-sm font-medium text-ndp-text">{t('admin.backup.create')}</p>
              <p className="text-xs text-ndp-text-dim">{t('admin.backup.create_desc')}</p>
            </div>
          </button>

          <button
            onClick={() => { setRestoreModal(true); setRestoreFile(null); setRestoreManifest(null); setRestoreValidation(null); setRestoreError(null); setRestoreResult(null); }}
            className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          >
            <Upload className="w-5 h-5 text-ndp-text-dim" />
            <div className="text-left">
              <p className="text-sm font-medium text-ndp-text">{t('admin.backup.restore')}</p>
              <p className="text-xs text-ndp-text-dim">{t('admin.backup.restore_desc')}</p>
            </div>
          </button>
        </div>

        {/* Include cache toggle */}
        <button
          onClick={() => setIncludeCache(!includeCache)}
          className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left text-sm', includeCache ? 'bg-ndp-accent/10 text-ndp-text' : 'text-ndp-text-muted hover:bg-white/5')}
        >
          <div className={clsx('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', includeCache ? 'bg-ndp-accent border-ndp-accent' : 'border-white/20')}>
            {includeCache && <CheckCircle className="w-3 h-3 text-white" />}
          </div>
          {t('admin.backup.include_cache')}
        </button>

      {/* Saved backups list */}
      {savedBackups.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs text-ndp-text-dim uppercase tracking-wider font-semibold">{t('admin.backup.saved_backups')}</h4>
          {savedBackups.map(b => (
            <div key={b.filename} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02]">
              <Archive className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ndp-text truncate">{b.filename}</p>
                <p className="text-[10px] text-ndp-text-dim">{new Date(b.createdAt).toLocaleString()} · {(b.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                onClick={async () => {
                  const { data } = await api.get(`/admin/backup/download/${b.filename}`, { responseType: 'blob' });
                  const url = URL.createObjectURL(data);
                  const a = document.createElement('a');
                  a.href = url; a.download = b.filename; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-1.5 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => {
                  await api.delete(`/admin/backup/${b.filename}`);
                  setSavedBackups(prev => prev.filter(x => x.filename !== b.filename));
                }}
                className="p-1.5 text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      </div>

      {/* Restore modal */}
      {restoreModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setRestoreModal(false)}>
          <div className="card p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-ndp-accent" />
                <h3 className="text-lg font-bold text-ndp-text">{t('admin.backup.restore')}</h3>
              </div>
              <button onClick={() => setRestoreModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-ndp-text-dim">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: File picker */}
            {!restoreResult && !restoreFile && !restoreError && (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-ndp-accent/30 transition-colors cursor-pointer"
              >
                <Upload className="w-8 h-8 text-ndp-text-dim mx-auto mb-2" />
                <p className="text-sm text-ndp-text-muted">{t('admin.backup.drop_file')}</p>
                <p className="text-xs text-ndp-text-dim mt-1">.zip</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
              </div>
            )}

            {/* Step 2: Validation + confirm */}
            {!restoreResult && restoreManifest && restoreValidation && !restoreError && (
              <div className="space-y-3">
                <div className="rounded-xl bg-white/[0.03] p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-ndp-text-dim">{t('admin.backup.version')}</span>
                    <span className="text-ndp-text font-medium">{restoreManifest.version}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ndp-text-dim">{t('admin.backup.date')}</span>
                    <span className="text-ndp-text font-medium">{new Date(restoreManifest.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ndp-text-dim">{t('admin.backup.stats')}</span>
                    <span className="text-ndp-text font-medium">
                      {t('admin.backup.stats_detail', { users: restoreManifest.stats.users, media: restoreManifest.stats.media, requests: restoreManifest.stats.requests })}
                    </span>
                  </div>
                  {restoreValidation.needsMigration && (
                    <div className="flex items-center gap-2 text-xs text-ndp-warning mt-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {t('admin.backup.needs_migration')}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-ndp-warning/10 border border-ndp-warning/20 text-ndp-warning text-xs">
                  <AlertTriangle className="w-4 h-4 inline mr-1.5" />
                  {t('admin.backup.restore_warning')}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setRestoreFile(null); setRestoreManifest(null); setRestoreValidation(null); }} className="btn-secondary text-sm flex-1">
                    {t('common.cancel')}
                  </button>
                  <button onClick={handleRestore} disabled={restoring} className="btn-danger text-sm flex-1 flex items-center justify-center gap-2">
                    {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {t('admin.backup.confirm_restore')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Success */}
            {restoreResult && (
              <div className="space-y-4">
                <div className="p-6 rounded-xl bg-ndp-success/10 border border-ndp-success/20 text-center">
                  <CheckCircle className="w-8 h-8 text-ndp-success mx-auto mb-3" />
                  <p className="text-base text-ndp-success font-semibold">{t('admin.backup.restore_success')}</p>
                  <p className="text-sm text-ndp-text-dim mt-2">{t('admin.backup.restart_required')}</p>
                </div>
                <button onClick={() => setRestoreModal(false)} className="btn-primary w-full text-sm">
                  {t('common.close')}
                </button>
              </div>
            )}

            {/* Error state */}
            {restoreError && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-ndp-danger/10 border border-ndp-danger/20 text-center">
                  <AlertTriangle className="w-6 h-6 text-ndp-danger mx-auto mb-2" />
                  <p className="text-sm text-ndp-danger font-medium">{restoreError}</p>
                </div>
                <button onClick={() => { setRestoreError(null); setRestoreFile(null); setRestoreManifest(null); setRestoreValidation(null); }} className="btn-secondary w-full text-sm">
                  {t('admin.backup.try_again')}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
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
