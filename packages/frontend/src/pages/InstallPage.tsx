import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Film, Loader2, CheckCircle, RefreshCw, PartyPopper, Plus, Trash2, XCircle, Eye, EyeOff, Mail } from 'lucide-react';
import api from '@/lib/api';

interface ArrService {
  id: string;
  type: 'radarr' | 'sonarr';
  name: string;
  url: string;
  apiKey: string;
  testStatus: 'idle' | 'testing' | 'ok' | 'error';
  saved: boolean;
}

const TOTAL_STEPS = 6; // 0-5

export default function InstallPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [setupSecret, setSetupSecret] = useState('');
  const [secretValid, setSecretValid] = useState(false);
  const [secretShake, setSecretShake] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [countdown, setCountdown] = useState(5);

  // Step 1: Admin account
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Arr services
  const [arrServices, setArrServices] = useState<ArrService[]>([
    { id: '1', type: 'radarr', name: 'Radarr', url: '', apiKey: '', testStatus: 'idle', saved: false },
  ]);

  // Step 3: Plex optional
  const [wantPlex, setWantPlex] = useState(false);
  const [plexUrl, setPlexUrl] = useState('');
  const [plexToken, setPlexToken] = useState('');
  const [plexMachineId, setPlexMachineId] = useState('');
  const [plexName, setPlexName] = useState('Plex');
  const [plexPolling, setPlexPolling] = useState(false);
  const [plexTestOk, setPlexTestOk] = useState<boolean | null>(null);
  const [plexTesting, setPlexTesting] = useState(false);
  const [plexDetecting, setPlexDetecting] = useState(false);
  const [plexAuthed, setPlexAuthed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 4: Sync
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [syncResult, setSyncResult] = useState<{ radarr?: { added: number; updated: number }; sonarr?: { added: number; updated: number } } | null>(null);

  useEffect(() => {
    api.get('/setup/install-status')
      .then(({ data }) => {
        if (data.installed) navigate('/login', { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [navigate]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ─── Step 1: Admin account ──────────────────────────────────────────

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/auth/register', {
        email: adminEmail,
        password: adminPassword,
        displayName: adminDisplayName,
      });
      login(data.token, data.user);
      setStep(2);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('login.error'));
    } finally { setSaving(false); }
  };

  // ─── Step 2: Arr services ──────────────────────────────────────────

  const addArrService = () => {
    setArrServices(prev => [...prev, {
      id: String(Date.now()),
      type: prev.some(s => s.type === 'radarr') ? 'sonarr' : 'radarr',
      name: prev.some(s => s.type === 'radarr') ? 'Sonarr' : 'Radarr',
      url: '', apiKey: '', testStatus: 'idle', saved: false,
    }]);
  };

  const removeArrService = (id: string) => {
    setArrServices(prev => prev.filter(s => s.id !== id));
  };

  const updateArrService = (id: string, updates: Partial<ArrService>) => {
    setArrServices(prev => prev.map(s => s.id === id ? { ...s, ...updates, testStatus: updates.url !== undefined || updates.apiKey !== undefined ? 'idle' as const : s.testStatus } : s));
  };

  const testArrService = async (id: string) => {
    const svc = arrServices.find(s => s.id === id);
    if (!svc || !svc.url || !svc.apiKey) return;
    updateArrService(id, { testStatus: 'testing' });
    try {
      await api.post('/setup/test-arr', { url: svc.url, apiKey: svc.apiKey });
      setArrServices(prev => prev.map(s => s.id === id ? { ...s, testStatus: 'ok' } : s));
    } catch {
      setArrServices(prev => prev.map(s => s.id === id ? { ...s, testStatus: 'error' } : s));
    }
  };

  const saveArrServices = async () => {
    setSaving(true);
    setError('');
    try {
      for (const svc of arrServices) {
        if (svc.saved || !svc.url || !svc.apiKey) continue;
        await api.post('/setup/service', { name: svc.name, type: svc.type, url: svc.url, apiKey: svc.apiKey });
        setArrServices(prev => prev.map(s => s.id === svc.id ? { ...s, saved: true } : s));
      }
      setStep(3);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('common.error');
      setError(msg);
    } finally { setSaving(false); }
  };

  const canSaveArr = arrServices.some(s => s.url && s.apiKey && s.testStatus === 'ok');

  // ─── Step 3: Plex optional ────────────────────────────────────────

  const testPlexConnection = async () => {
    if (!plexUrl) return;
    setPlexTesting(true);
    setPlexTestOk(null);
    try {
      const { data } = await api.post('/setup/test-url', { url: plexUrl });
      setPlexTestOk(true);
      if (data.machineIdentifier && !plexMachineId) setPlexMachineId(data.machineIdentifier);
    } catch { setPlexTestOk(false); }
    finally { setPlexTesting(false); }
  };

  const startPlexAuth = async () => {
    setPlexPolling(true);
    setError('');
    try {
      const { data } = await api.post('/setup/plex-pin');
      const { pin, authUrl } = data;
      window.open(authUrl, 'PlexAuth', 'width=600,height=700');

      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts >= 120) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPlexPolling(false);
          setError(t('login.expired'));
          return;
        }
        try {
          const { data: checkData } = await api.post('/setup/plex-check', { pinId: pin.id });
          if (checkData.token) {
            if (pollRef.current) clearInterval(pollRef.current);
            setPlexToken(checkData.token);
            setPlexPolling(false);
            setPlexAuthed(true);
            try {
              const res = await fetch(`${plexUrl}/identity`, {
                headers: { 'X-Plex-Token': checkData.token, Accept: 'application/json' },
              });
              const json = await res.json();
              const mid = json.MediaContainer?.machineIdentifier;
              if (mid) setPlexMachineId(mid);
            } catch { /* empty */ }
          }
        } catch { /* still polling */ }
      }, 1000);
    } catch {
      setPlexPolling(false);
      setError(t('login.error'));
    }
  };

  const detectPlexMachineId = async () => {
    if (!plexUrl || !plexToken) return;
    setPlexDetecting(true);
    try {
      const res = await fetch(`${plexUrl}/identity`, {
        headers: { 'X-Plex-Token': plexToken, Accept: 'application/json' },
      });
      const json = await res.json();
      const mid = json.MediaContainer?.machineIdentifier;
      if (mid) setPlexMachineId(mid);
    } catch { /* empty */ }
    finally { setPlexDetecting(false); }
  };

  const savePlexAndContinue = async () => {
    setSaving(true);
    setError('');
    try {
      if (wantPlex && plexToken && plexUrl) {
        await api.post('/setup/plex-service', { url: plexUrl, token: plexToken, machineId: plexMachineId, name: plexName });
      }
      setStep(4);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('common.error');
      setError(msg);
    } finally { setSaving(false); }
  };

  // ─── Step 4: Sync ──────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const { data } = await api.post('/setup/sync');
      setSyncResult(data.result);
      setSyncDone(true);
      setTimeout(() => setStep(5), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('common.error');
      setError(msg);
    } finally { setSyncing(false); }
  };

  useEffect(() => {
    if (step === 4 && !syncing && !syncDone) handleSync();
  }, [step]);

  // ─── Step 5: Countdown ────────────────────────────────────────────

  useEffect(() => {
    if (step !== 5) return;
    if (countdown <= 0) { navigate('/', { replace: true }); return; }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, countdown, navigate]);

  if (checking) {
    return (
      <div className="min-h-screen bg-ndp-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-ndp-accent/30 border-t-ndp-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ndp-bg flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ndp-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-4">
        <div className="card p-8 shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-ndp-accent to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-ndp-accent/30 mb-4">
              <Film className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-ndp-text">{t('install.title')}</h1>
            <p className="text-ndp-text-muted text-sm mt-1 text-center">{t('install.subtitle')}</p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {Array.from({ length: TOTAL_STEPS }, (_, s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s <= step ? (step === TOTAL_STEPS - 1 ? 'bg-ndp-success w-8' : 'bg-ndp-accent w-8') : 'bg-white/10 w-4'
                }`}
              />
            ))}
          </div>

          {error && secretValid && (
            <div className="mb-6 p-3 bg-ndp-danger/10 border border-ndp-danger/20 rounded-xl text-ndp-danger text-sm text-center">
              {error}
            </div>
          )}

          {/* Setup Secret Gate */}
          {step === 0 && !secretValid && (
            <form className="space-y-4 animate-fade-in" onSubmit={async (e) => {
              e.preventDefault();
              if (!setupSecret) return;
              sessionStorage.setItem('setup-secret', setupSecret);
              setError('');
              try {
                await api.post('/setup/verify-secret');
                setSecretValid(true);
              } catch {
                setError(t('install.setup_secret_invalid', 'Invalid setup secret.'));
                sessionStorage.removeItem('setup-secret');
                setSecretShake(true);
              }
            }}>
              <div>
                <label className="text-sm text-ndp-text mb-1.5 block font-medium">{t('install.setup_secret', 'Setup Secret')}</label>
                <input
                  type="password"
                  value={setupSecret}
                  onChange={(e) => { setSetupSecret(e.target.value); setError(''); }}
                  placeholder="SETUP_SECRET"
                  className={`input w-full ${secretShake ? 'animate-shake border-ndp-danger' : ''}`}
                  onAnimationEnd={() => setSecretShake(false)}
                  autoFocus
                />
                <p className="text-xs text-ndp-text-dim mt-1.5">
                  {t('install.setup_secret_help', 'Enter the SETUP_SECRET from your .env file to begin installation.')}
                </p>
              </div>
              {error && (
                <div className="text-xs px-3 py-2 rounded-lg bg-ndp-danger/10 text-ndp-danger">{error}</div>
              )}
              <button type="submit" disabled={!setupSecret} className="btn-primary flex items-center gap-2 text-sm w-full justify-center">
                {t('common.next')}
              </button>
            </form>
          )}

          {/* Step 0 (after secret): Skip to step 1 */}
          {step === 0 && secretValid && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-sm text-ndp-text-muted text-center">{t('install.admin_desc')}</p>
              <button onClick={() => setStep(1)} className="btn-primary text-sm w-full">
                {t('common.next')}
              </button>
            </div>
          )}

          {/* Step 1: Create admin account */}
          {step === 1 && (
            <form onSubmit={handleCreateAdmin} className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-sm font-semibold text-ndp-text mb-1">{t('install.admin_title')}</h2>
                <p className="text-xs text-ndp-text-dim">{t('install.admin_desc')}</p>
              </div>

              <input
                type="text"
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
                placeholder={t('register.displayname')}
                required
                className="input w-full"
                autoFocus
              />
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder={t('login.email_placeholder')}
                required
                className="input w-full"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder={t('login.password_placeholder')}
                  required
                  minLength={8}
                  className="input w-full pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ndp-text-dim hover:text-ndp-text">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button type="submit" disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {t('install.create_admin')}
              </button>
            </form>
          )}

          {/* Step 2: Radarr/Sonarr config */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-sm font-semibold text-ndp-text mb-1">{t('install.arr_title')}</h2>
                <p className="text-xs text-ndp-text-dim">{t('install.arr_desc')}</p>
              </div>

              <div className="space-y-4">
                {arrServices.map((svc) => (
                  <div key={svc.id} className="p-4 bg-white/5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <select
                        value={svc.type}
                        onChange={(e) => {
                          const type = e.target.value as 'radarr' | 'sonarr';
                          updateArrService(svc.id, { type, name: type === 'radarr' ? 'Radarr' : 'Sonarr' });
                        }}
                        className="input text-sm w-auto"
                      >
                        <option value="radarr">Radarr</option>
                        <option value="sonarr">Sonarr</option>
                      </select>
                      {arrServices.length > 1 && (
                        <button onClick={() => removeArrService(svc.id)} className="text-ndp-text-dim hover:text-ndp-danger transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={svc.url}
                      onChange={(e) => updateArrService(svc.id, { url: e.target.value })}
                      placeholder="http://localhost:7878"
                      className="input w-full text-sm"
                    />
                    <input
                      type="text"
                      value={svc.apiKey}
                      onChange={(e) => updateArrService(svc.id, { apiKey: e.target.value })}
                      placeholder={t('common.api_key')}
                      className="input w-full text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => testArrService(svc.id)}
                        disabled={!svc.url || !svc.apiKey || svc.testStatus === 'testing'}
                        className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5"
                      >
                        {svc.testStatus === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {t('common.test')}
                      </button>
                      {svc.testStatus === 'ok' && (
                        <span className="flex items-center gap-1 text-xs text-ndp-success"><CheckCircle className="w-3.5 h-3.5" /> {t('status.connected')}</span>
                      )}
                      {svc.testStatus === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-ndp-danger"><XCircle className="w-3.5 h-3.5" /> {t('status.connection_failed')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addArrService} className="btn-secondary text-xs flex items-center gap-1.5 w-full justify-center">
                <Plus className="w-3.5 h-3.5" />
                {t('install.arr_add')}
              </button>

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="btn-secondary text-sm flex-1">{t('common.back')}</button>
                <button onClick={saveArrServices} disabled={!canSaveArr || saving} className="btn-primary flex items-center justify-center gap-2 text-sm flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Plex optional */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-sm font-semibold text-ndp-text mb-1">{t('install.plex_optional_title')}</h2>
                <p className="text-xs text-ndp-text-dim">{t('install.plex_optional_desc')}</p>
              </div>

              {/* Toggle */}
              <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer">
                <span className="text-sm text-ndp-text">{t('install.plex_toggle')}</span>
                <div className="relative">
                  <input type="checkbox" checked={wantPlex} onChange={(e) => setWantPlex(e.target.checked)} className="sr-only" />
                  <div className={`w-10 h-5 rounded-full transition-colors ${wantPlex ? 'bg-ndp-accent' : 'bg-white/10'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${wantPlex ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              </label>

              {wantPlex && !plexAuthed && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-ndp-text mb-1.5 block font-medium">{t('install.plex_url')}</label>
                    <input
                      type="text"
                      value={plexUrl}
                      onChange={(e) => { setPlexUrl(e.target.value); setPlexTestOk(null); }}
                      placeholder="http://localhost:32400"
                      className="input w-full"
                    />
                  </div>

                  {plexTestOk !== null && (
                    <div className={`text-xs px-3 py-2 rounded-lg ${plexTestOk ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger'}`}>
                      {plexTestOk ? t('install.server_ok') : t('install.server_error')}
                    </div>
                  )}

                  <button onClick={testPlexConnection} disabled={!plexUrl || plexTesting} className="btn-secondary text-xs flex items-center gap-1.5 w-full justify-center">
                    {plexTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {t('common.test')}
                  </button>

                  <p className="text-sm text-ndp-text-muted text-center">{t('install.plex_auth')}</p>

                  <button
                    onClick={startPlexAuth}
                    disabled={plexPolling || !plexUrl}
                    className="w-full flex items-center justify-center gap-3 bg-[#e5a00d] hover:bg-[#cc8c00] text-black font-semibold py-3 px-6 rounded-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {plexPolling ? (
                      <><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />{t('login.waiting')}</>
                    ) : (
                      t('login.oauth_button', { provider: 'Plex' })
                    )}
                  </button>
                </div>
              )}

              {wantPlex && plexAuthed && (
                <div className="space-y-3">
                  <div className="p-3 bg-ndp-success/10 border border-ndp-success/20 rounded-xl text-ndp-success text-sm text-center flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {t('install.plex_success')}
                  </div>
                  <div>
                    <label className="text-sm text-ndp-text mb-1.5 block font-medium">{t('install.machine_id')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={plexMachineId}
                        onChange={(e) => setPlexMachineId(e.target.value)}
                        placeholder={t('admin.services.auto_detect')}
                        className="input flex-1"
                      />
                      <button onClick={detectPlexMachineId} disabled={plexDetecting} className="btn-secondary text-sm flex items-center gap-1.5 px-3">
                        {plexDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="btn-secondary text-sm flex-1">{t('common.back')}</button>
                <button
                  onClick={savePlexAndContinue}
                  disabled={saving || (wantPlex && !plexAuthed)}
                  className="btn-primary flex items-center justify-center gap-2 text-sm flex-1"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {wantPlex ? t('common.next') : t('install.skip_plex')}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Sync */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-in text-center">
              <div>
                <h2 className="text-lg font-bold text-ndp-text mb-1">{t('install.sync_title')}</h2>
                <p className="text-xs text-ndp-text-dim">{t('install.sync_desc')}</p>
              </div>
              {syncing && (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-ndp-accent/30 border-t-ndp-accent rounded-full animate-spin" />
                  <p className="text-sm text-ndp-text-muted">{t('install.sync_running')}</p>
                </div>
              )}
              {syncDone && syncResult && (
                <div className="space-y-2">
                  <div className="p-3 bg-ndp-success/10 border border-ndp-success/20 rounded-xl text-ndp-success text-sm flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {t('install.sync_done')}
                  </div>
                  {syncResult.radarr && <p className="text-xs text-ndp-text-dim">Radarr: +{syncResult.radarr.added} {t('install.sync_added')}</p>}
                  {syncResult.sonarr && <p className="text-xs text-ndp-text-dim">Sonarr: +{syncResult.sonarr.added} {t('install.sync_added')}</p>}
                </div>
              )}
              {!syncing && !syncDone && (
                <button onClick={handleSync} className="btn-primary text-sm">{t('install.sync_retry')}</button>
              )}
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="space-y-6 animate-fade-in text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-ndp-success/10 rounded-full flex items-center justify-center">
                  <PartyPopper className="w-8 h-8 text-ndp-success" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-ndp-text">{t('install.done_title')}</h2>
                <p className="text-sm text-ndp-text-muted mt-2">{t('install.done_desc')}</p>
              </div>
              <p className="text-sm text-ndp-text-dim">{t('install.redirect', { seconds: countdown })}</p>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-ndp-success rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                />
              </div>
              <button onClick={() => navigate('/', { replace: true })} className="btn-primary text-sm">
                {t('install.go_now')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
