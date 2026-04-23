import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useFeatures } from '@/context/FeaturesContext';
import { Film, Mail, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import type { AuthProviderConfig } from '@/types';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [providers, setProviders] = useState<AuthProviderConfig[]>([]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get('/auth/providers').then(({ data }) => setProviders(data)).catch(() => {});
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // OAuth providers redirect back to `/login?error=<TOKEN>` on failure (see Discord callback).
  // Pick that up, translate, display — and strip the query param so a reload doesn't re-trigger.
  useEffect(() => {
    const raw = searchParams.get('error');
    if (!raw) return;
    const key = `login.errors.${raw}`;
    const translated = t(key);
    setError(translated === key ? raw : translated);
    const next = new URLSearchParams(searchParams);
    next.delete('error');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, t]);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const hasEmailProvider = providers.some((p) => p.id === 'email');
  const oauthProviders = providers.filter((p) => p.type === 'oauth');
  const credentialProviders = providers.filter((p) => p.type === 'credentials' && p.id !== 'email');
  const [activeCredProvider, setActiveCredProvider] = useState<string | null>(null);
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');

  // The backend returns specific tokens (INVALID_CREDENTIALS, EXTERNAL_ACCOUNT, …) that need
  // to be translated before display. Plain English strings from other errors pass through.
  const translateAuthError = (rawError: string | undefined): string => {
    if (!rawError) return t('login.error');
    const key = `login.errors.${rawError}`;
    const translated = t(key);
    return translated === key ? rawError : translated;
  };

  const handleCredentialLogin = async (providerId: string) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/auth/${providerId}/login`, { username: credUsername, password: credPassword });
      await login('', data.user);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(translateAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      await login('', data.user);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(translateAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError(t('register.password_mismatch'));
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { email, password, displayName });
      await login('', data.user);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(translateAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (providerId: string) => {
    // Discord uses a full-page OAuth redirect (no popup + polling): the authorize endpoint
    // sends the browser to discord.com, which redirects back to /api/auth/discord/callback
    // where the backend sets the cookie and redirects home.
    if (providerId === 'discord') {
      window.location.href = '/api/auth/discord/authorize';
      return;
    }
    if (providerId === 'plex') {
      setLoading(true);
      setError('');
      // Open popup BEFORE the async call — Safari blocks window.open() after await
      const authWindow = window.open('about:blank', 'PlexAuth', 'width=600,height=700');
      try {
        const { data } = await api.post('/auth/plex/pin');
        const { pin, authUrl } = data;
        if (authWindow) authWindow.location.href = authUrl;

        setPolling(true);
        let attempts = 0;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(async () => {
          attempts++;
          if (attempts >= 120) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setPolling(false);
            setLoading(false);
            setError(t('login.expired'));
            return;
          }
          try {
            const { data: callbackData } = await api.post('/auth/plex/callback', { pinId: pin.id });
            if (callbackData.user) {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              authWindow?.close();
              login('', callbackData.user);
              navigate('/', { replace: true });
            }
          } catch { /* keep polling */ }
        }, 1000);
      } catch {
        setError(t('login.error'));
        setLoading(false);
        setPolling(false);
      }
    }
  };

  const PROVIDER_STYLES: Record<string, { bg: string; hover: string; text: string }> = {
    plex: { bg: 'bg-[#e5a00d]', hover: 'hover:bg-[#cc8c00]', text: 'text-black' },
    discord: { bg: 'bg-[#5865F2]', hover: 'hover:bg-[#4752C4]', text: 'text-white' },
    jellyfin: { bg: 'bg-[#00a4dc]', hover: 'hover:bg-[#0090c4]', text: 'text-white' },
    emby: { bg: 'bg-[#52b54b]', hover: 'hover:bg-[#429a3d]', text: 'text-white' },
  };

  return (
    <div className="min-h-dvh bg-ndp-bg flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ndp-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="card p-8 shadow-2xl shadow-black/50">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-ndp-accent to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-ndp-accent/30 mb-4">
              <Film className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-ndp-text">{features.siteName}</h1>
            <p className="text-ndp-text-muted text-sm mt-1">
              {mode === 'register' ? t('register.title') : t('login.title')}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-3 bg-ndp-danger/10 border border-ndp-danger/20 rounded-xl text-ndp-danger text-sm text-center">
              {error}
            </div>
          )}

          {/* Register form */}
          {mode === 'register' && hasEmailProvider && (
            <form onSubmit={handleRegister} className="space-y-4">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('register.displayname')}
                required
                className="input w-full"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.email_placeholder')}
                required
                className="input w-full"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.password_placeholder')}
                  required
                  minLength={8}
                  className="input w-full pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('common.hide') : t('common.show')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ndp-text-dim hover:text-ndp-text">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('register.password_confirm')}
                required
                minLength={8}
                className="input w-full"
              />
              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Mail className="w-4 h-4" />}
                {t('register.submit')}
              </button>
              <p className="text-center text-sm text-ndp-text-dim">
                <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-ndp-accent hover:underline">
                  {t('login.login_link')}
                </button>
              </p>
            </form>
          )}

          {/* Login */}
          {mode === 'login' && (
            <>
              {/* Active credential form (Jellyfin/Emby) */}
              {activeCredProvider ? (() => {
                const provider = credentialProviders.find(p => p.id === activeCredProvider);
                if (!provider) return null;
                const style = PROVIDER_STYLES[provider.id] || { bg: 'bg-white/10', hover: 'hover:bg-white/20', text: 'text-white' };
                return (
                  <div className="space-y-4">
                    <form onSubmit={e => { e.preventDefault(); handleCredentialLogin(provider.id); }} className="space-y-4">
                      <input
                        type="text"
                        placeholder={t('login.username')}
                        value={credUsername}
                        onChange={e => setCredUsername(e.target.value)}
                        className="input w-full"
                        autoFocus
                      />
                      <input
                        type="password"
                        placeholder={t('login.password_placeholder')}
                        value={credPassword}
                        onChange={e => setCredPassword(e.target.value)}
                        className="input w-full"
                      />
                      <button
                        type="submit"
                        disabled={loading || !credUsername || !credPassword}
                        className={`w-full ${style.bg} ${style.hover} ${style.text} font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                      >
                        {loading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          t('login.credentials_button', { provider: provider.label })
                        )}
                      </button>
                    </form>
                    <button
                      onClick={() => { setActiveCredProvider(null); setError(''); }}
                      className="w-full text-sm text-ndp-text-dim hover:text-ndp-text-muted transition-colors"
                    >
                      {t('login.back_to_providers')}
                    </button>
                  </div>
                );
              })()

              /* Provider selection */
              : (
                <div className="space-y-3">
                  {/* Email login */}
                  {hasEmailProvider && (
                    <form onSubmit={handleEmailLogin} className="space-y-3 mb-3">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('login.email_placeholder')}
                        required
                        className="input w-full"
                      />
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={t('login.password_placeholder')}
                          required
                          className="input w-full pr-10"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('common.hide') : t('common.show')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ndp-text-dim hover:text-ndp-text">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button type="submit" disabled={loading && !polling} className="btn-primary w-full flex items-center justify-center gap-2">
                        {loading && !polling ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Mail className="w-4 h-4" />}
                        {t('login.signin')}
                      </button>
                    </form>
                  )}

                  {/* Divider */}
                  {hasEmailProvider && (oauthProviders.length > 0 || credentialProviders.length > 0) && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-ndp-text-dim text-xs uppercase">{t('login.or')}</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>
                  )}

                  {/* All external providers as buttons */}
                  {[...oauthProviders, ...credentialProviders].map((provider) => {
                    const style = PROVIDER_STYLES[provider.id] || { bg: 'bg-white/10', hover: 'hover:bg-white/20', text: 'text-white' };
                    const isOAuth = provider.type === 'oauth';
                    return (
                      <button
                        key={provider.id}
                        onClick={() => {
                          if (isOAuth) handleOAuthLogin(provider.id);
                          else { setActiveCredProvider(provider.id); setCredUsername(''); setCredPassword(''); setError(''); }
                        }}
                        disabled={loading}
                        className={`w-full flex items-center justify-center gap-3 ${style.bg} ${style.hover} ${style.text} font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {polling && provider.id === 'plex' ? (
                          <>
                            <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            {t('login.waiting')}
                          </>
                        ) : (
                          t('login.oauth_button', { provider: provider.label })
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Register link */}
              {hasEmailProvider && providers.find(p => p.id === 'email')?.allowSignup && (
                <p className="text-center text-sm text-ndp-text-dim mt-6">
                  <button onClick={() => { setMode('register'); setError(''); }} className="text-ndp-accent hover:underline">
                    {t('login.register_link')}
                  </button>
                </p>
              )}
            </>
          )}

          <p className="text-ndp-text-dim text-xs text-center mt-6">
            {t('login.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
