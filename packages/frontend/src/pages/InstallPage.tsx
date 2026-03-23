import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Film, Loader2, CheckCircle, RefreshCw, PartyPopper } from 'lucide-react';
import api from '@/lib/api';

export default function InstallPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [machineId, setMachineId] = useState('');
  const [name, setName] = useState('Plex');
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [plexPolling, setPlexPolling] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0); // 0=url, 1=plex auth, 2=confirm, 3=done
  const [countdown, setCountdown] = useState(5);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get('/support/install-status')
      .then(({ data }) => {
        if (data.installed) navigate('/login', { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [navigate]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const testConnection = async () => {
    if (!url) return;
    setTesting(true);
    setTestOk(null);
    try {
      const { data } = await api.post('/support/setup/test-url', { url });
      setTestOk(true);
      if (data.machineIdentifier && !machineId) setMachineId(data.machineIdentifier);
    } catch { setTestOk(false); }
    finally { setTesting(false); }
  };

  const startPlexAuth = async () => {
    setPlexPolling(true);
    setError('');
    try {
      const { data } = await api.post('/support/setup/plex-pin');
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
          const { data: checkData } = await api.post('/support/setup/plex-check', { pinId: pin.id });
          if (checkData.token) {
            if (pollRef.current) clearInterval(pollRef.current);
            setToken(checkData.token);
            setPlexPolling(false);
            // Auto-detect machineId with the token
            try {
              const res = await fetch(`${url}/identity`, {
                headers: { 'X-Plex-Token': checkData.token, Accept: 'application/json' },
              });
              const json = await res.json();
              const mid = json.MediaContainer?.machineIdentifier;
              if (mid) setMachineId(mid);
            } catch { /* empty */ }
            setStep(2);
          }
        } catch { /* still polling */ }
      }, 1000);
    } catch {
      setPlexPolling(false);
      setError(t('login.error'));
    }
  };

  const detectMachineId = async () => {
    if (!url || !token) return;
    setDetecting(true);
    try {
      const res = await fetch(`${url}/identity`, {
        headers: { 'X-Plex-Token': token, Accept: 'application/json' },
      });
      const json = await res.json();
      const mid = json.MediaContainer?.machineIdentifier;
      if (mid) setMachineId(mid);
    } catch { /* empty */ }
    finally { setDetecting(false); }
  };

  const handleSubmit = async () => {
    if (!url || !token) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/support/setup', { url, token, machineId, name });
      setStep(3);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('common.error');
      setError(msg);
    } finally { setSaving(false); }
  };

  // Countdown redirect after install
  useEffect(() => {
    if (step !== 3) return;
    if (countdown <= 0) { navigate('/login', { replace: true }); return; }
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
            <p className="text-ndp-text-muted text-sm mt-1 text-center">
              {t('install.subtitle')}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[0, 1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s <= step ? (step === 3 ? 'bg-ndp-success w-8' : 'bg-ndp-accent w-8') : 'bg-white/10 w-4'
                }`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-6 p-3 bg-ndp-danger/10 border border-ndp-danger/20 rounded-xl text-ndp-danger text-sm text-center">
              {error}
            </div>
          )}

          {/* Step 0: URL */}
          {step === 0 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="text-sm text-ndp-text mb-1.5 block font-medium">{t('install.plex_url')}</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setTestOk(null); }}
                  placeholder="http://192.168.1.50:32400"
                  className="input w-full"
                  autoFocus
                />
                <p className="text-xs text-ndp-text-dim mt-1.5">
                  {t('install.plex_url_help')}
                </p>
              </div>

              {testOk !== null && (
                <div className={`text-xs px-3 py-2 rounded-lg ${testOk ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger'}`}>
                  {testOk ? t('install.server_ok') : t('install.server_error')}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={testConnection}
                  disabled={!url || testing}
                  className="btn-secondary flex items-center gap-2 text-sm flex-1"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {t('common.test')}
                </button>
                <button
                  onClick={() => setStep(1)}
                  disabled={!url}
                  className="btn-primary flex items-center gap-2 text-sm flex-1"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Plex OAuth */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-sm text-ndp-text-muted text-center">
                {t('install.plex_auth')}
              </p>

              <button
                onClick={startPlexAuth}
                disabled={plexPolling}
                className="w-full flex items-center justify-center gap-3 bg-[#e5a00d] hover:bg-[#cc8c00] text-black font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-[#e5a00d]/25 disabled:opacity-50"
              >
                {plexPolling ? (
                  <>
                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    {t('login.waiting')}
                  </>
                ) : (
                  <>
                    {t('login.button')}
                  </>
                )}
              </button>

              <button onClick={() => setStep(0)} className="btn-secondary text-sm w-full">
                {t('common.back')}
              </button>
            </div>
          )}

          {/* Step 2: Confirm */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3 bg-ndp-success/10 border border-ndp-success/20 rounded-xl text-ndp-success text-sm text-center flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {t('install.plex_success')}
              </div>

              <div>
                <label className="text-sm text-ndp-text mb-1.5 block font-medium">{t('install.service_name')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Plex"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="text-sm text-ndp-text mb-1.5 block font-medium">{t('install.machine_id')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    placeholder={t('admin.services.auto_detect')}
                    className="input flex-1"
                  />
                  <button
                    onClick={detectMachineId}
                    disabled={detecting}
                    className="btn-secondary text-sm flex items-center gap-1.5 px-3"
                  >
                    {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-ndp-text-dim mt-1.5">
                  {t('install.machine_id_help')}
                </p>
              </div>

              {/* Recap */}
              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-2">{t('install.summary')}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-ndp-text-dim">{t('common.url')}</span>
                  <span className="text-ndp-text font-mono text-xs">{url}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ndp-text-dim">{t('common.token')}</span>
                  <span className="text-ndp-text font-mono text-xs">{token.slice(0, 8)}...</span>
                </div>
                {machineId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ndp-text-dim">{t('install.machine_id')}</span>
                    <span className="text-ndp-text font-mono text-xs truncate ml-4">{machineId}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setToken(''); setMachineId(''); setStep(1); }} className="btn-secondary text-sm flex-1">
                  {t('common.back')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="btn-primary flex items-center justify-center gap-2 text-sm flex-1"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {t('install.install')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
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
              <p className="text-sm text-ndp-text-dim">
                {t('install.redirect', { seconds: countdown })}
              </p>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-ndp-success rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                />
              </div>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="btn-primary text-sm"
              >
                {t('install.go_now')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
