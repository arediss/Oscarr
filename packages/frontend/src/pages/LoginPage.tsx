import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useFeatures } from '@/context/FeaturesContext';
import { Film } from 'lucide-react';
import api from '@/lib/api';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const handlePlexLogin = async () => {
    setLoading(true);
    setError('');
    try {
      // Create a Plex PIN
      const { data } = await api.post('/auth/plex/pin');
      const { pin, authUrl } = data;

      // Open Plex auth in new window
      const authWindow = window.open(authUrl, 'PlexAuth', 'width=600,height=700');

      // Poll for PIN completion
      setPolling(true);
      const maxAttempts = 120; // 2 minutes
      let attempts = 0;

      const pollInterval = setInterval(async () => {
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setPolling(false);
          setLoading(false);
          setError(t('login.expired'));
          return;
        }

        try {
          const { data: callbackData } = await api.post('/auth/plex/callback', { pinId: pin.id });
          if (callbackData.token) {
            clearInterval(pollInterval);
            authWindow?.close();
            login(callbackData.token, callbackData.user);
            navigate('/', { replace: true });
          }
        } catch {
          // PIN not yet validated, keep polling
        }
      }, 1000);
    } catch (err) {
      setError(t('login.error'));
      setLoading(false);
      setPolling(false);
    }
  };

  return (
    <div className="min-h-screen bg-ndp-bg flex items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
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
            <p className="text-ndp-text-muted text-sm mt-1">{t('login.title')}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-3 bg-ndp-danger/10 border border-ndp-danger/20 rounded-xl text-ndp-danger text-sm text-center">
              {error}
            </div>
          )}

          {/* Login button */}
          <button
            onClick={handlePlexLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-[#e5a00d] hover:bg-[#cc8c00] text-black font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-[#e5a00d]/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {polling ? (
              <>
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                {t('login.waiting')}
              </>
            ) : loading ? (
              <>
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                {t('login.connecting')}
              </>
            ) : (
              <>
                {t('login.button')}
              </>
            )}
          </button>

          <p className="text-ndp-text-dim text-xs text-center mt-6">
            {t('login.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
