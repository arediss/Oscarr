import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Loader2, CheckCircle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

export default function InstallPage() {
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
  const [step, setStep] = useState(0); // 0=url, 1=plex auth, 2=confirm
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
      const res = await fetch(`${url}/identity`, { headers: { Accept: 'application/json' } });
      setTestOk(res.ok);
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
          setError('Connexion expirée. Réessayez.');
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
      setError('Erreur lors de la connexion Plex.');
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
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erreur lors de la configuration';
      setError(msg);
    } finally { setSaving(false); }
  };

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
            <h1 className="text-2xl font-bold text-ndp-text">Installation</h1>
            <p className="text-ndp-text-muted text-sm mt-1 text-center">
              Configurez votre serveur Plex pour commencer
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[0, 1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s <= step ? 'bg-ndp-accent w-8' : 'bg-white/10 w-4'
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
                <label className="text-sm text-ndp-text mb-1.5 block font-medium">URL du serveur Plex</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setTestOk(null); }}
                  placeholder="http://192.168.1.50:32400"
                  className="input w-full"
                  autoFocus
                />
                <p className="text-xs text-ndp-text-dim mt-1.5">
                  L'adresse de votre serveur Plex avec le port (par défaut 32400)
                </p>
              </div>

              {testOk !== null && (
                <div className={`text-xs px-3 py-2 rounded-lg ${testOk ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger'}`}>
                  {testOk ? 'Serveur Plex accessible' : 'Impossible de joindre le serveur. Vérifiez l\'URL.'}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={testConnection}
                  disabled={!url || testing}
                  className="btn-secondary flex items-center gap-2 text-sm flex-1"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Tester
                </button>
                <button
                  onClick={() => setStep(1)}
                  disabled={!url}
                  className="btn-primary flex items-center gap-2 text-sm flex-1"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Plex OAuth */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-sm text-ndp-text-muted text-center">
                Connectez-vous avec votre compte Plex admin pour autoriser l'application.
              </p>

              <button
                onClick={startPlexAuth}
                disabled={plexPolling}
                className="w-full flex items-center justify-center gap-3 bg-[#e5a00d] hover:bg-[#cc8c00] text-black font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-[#e5a00d]/25 disabled:opacity-50"
              >
                {plexPolling ? (
                  <>
                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    En attente de Plex...
                  </>
                ) : (
                  <>
                    Se connecter avec Plex
                  </>
                )}
              </button>

              <button onClick={() => setStep(0)} className="btn-secondary text-sm w-full">
                Retour
              </button>
            </div>
          )}

          {/* Step 2: Confirm */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3 bg-ndp-success/10 border border-ndp-success/20 rounded-xl text-ndp-success text-sm text-center flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Connexion Plex réussie
              </div>

              <div>
                <label className="text-sm text-ndp-text mb-1.5 block font-medium">Nom du service</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Plex"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="text-sm text-ndp-text mb-1.5 block font-medium">Machine ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    placeholder="Détection automatique..."
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
                  Utilisé pour vérifier que les utilisateurs ont accès à votre serveur
                </p>
              </div>

              {/* Recap */}
              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-2">Récapitulatif</p>
                <div className="flex justify-between text-sm">
                  <span className="text-ndp-text-dim">URL</span>
                  <span className="text-ndp-text font-mono text-xs">{url}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ndp-text-dim">Token</span>
                  <span className="text-ndp-text font-mono text-xs">{token.slice(0, 8)}...</span>
                </div>
                {machineId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ndp-text-dim">Machine ID</span>
                    <span className="text-ndp-text font-mono text-xs truncate ml-4">{machineId}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setToken(''); setMachineId(''); setStep(1); }} className="btn-secondary text-sm flex-1">
                  Retour
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="btn-primary flex items-center justify-center gap-2 text-sm flex-1"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Installer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
