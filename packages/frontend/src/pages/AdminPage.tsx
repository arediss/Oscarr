import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Users,
  CreditCard,
  Shield,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  Calendar,
  RefreshCw,
  Play,
  Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser, AppSettings, QualityProfile, RootFolder } from '@/types';

type Tab = 'users' | 'jobs' | 'settings';

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('users');

  if (!isAdmin) {
    navigate('/');
    return null;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-6 h-6 text-ndp-accent" />
        <h1 className="text-2xl font-bold text-ndp-text">Administration</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setActiveTab('users')}
          className={clsx(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
            activeTab === 'users' ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
          )}
        >
          <Users className="w-4 h-4" />
          Utilisateurs
        </button>
        <button
          onClick={() => setActiveTab('jobs')}
          className={clsx(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
            activeTab === 'jobs' ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
          )}
        >
          <RefreshCw className="w-4 h-4" />
          Jobs & Sync
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={clsx(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
            activeTab === 'settings' ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
          )}
        >
          <Settings className="w-4 h-4" />
          Paramètres
        </button>
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSubscription = async (userId: number) => {
    if (!paymentDate) return;
    setSaving(true);
    try {
      await api.put(`/admin/users/${userId}/subscription`, {
        paymentDate,
        amount: paymentAmount ? parseFloat(paymentAmount) : undefined,
      });
      setSelectedUser(null);
      setPaymentDate('');
      setPaymentAmount('');
      fetchUsers();
    } catch (err) {
      console.error('Failed to update subscription:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSubscription = async (userId: number) => {
    setSaving(true);
    try {
      await api.delete(`/admin/users/${userId}/subscription`);
      fetchUsers();
    } catch (err) {
      console.error('Failed to revoke:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ndp-text">{users.length} utilisateur{users.length > 1 ? 's' : ''}</h2>
        <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Rafraîchir
        </button>
      </div>

      <div className="space-y-3">
        {users.map((u) => {
          const isActive = u.subscriptionActive;
          const isExpanded = selectedUser?.id === u.id;

          return (
            <div key={u.id} className="card">
              <div className="flex items-center gap-4 p-4">
                {u.avatar ? (
                  <img src={u.avatar} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent font-bold">
                    {(u.plexUsername || u.email)[0].toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text">{u.plexUsername || u.email}</span>
                    {u.role === 'admin' && (
                      <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded-full font-semibold">Admin</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-ndp-text-dim">
                    <span>{u.email}</span>
                    <span>{u.requestCount} demande{(u.requestCount ?? 0) > 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Plex server access */}
                <div className="flex items-center gap-1.5" title={u.hasPlexServerAccess ? 'Accès serveur Plex' : 'Pas d\'accès serveur'}>
                  {u.hasPlexServerAccess ? (
                    <CheckCircle className="w-4 h-4 text-ndp-success" />
                  ) : (
                    <XCircle className="w-4 h-4 text-ndp-danger" />
                  )}
                  <span className="text-xs text-ndp-text-dim hidden sm:inline">Plex</span>
                </div>

                {/* Subscription status */}
                <div className={clsx(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
                  isActive ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger'
                )}>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isActive ? 'Actif' : 'Inactif'}</span>
                </div>

                {/* Expand for subscription management */}
                {u.role !== 'admin' && (
                  <button
                    onClick={() => setSelectedUser(isExpanded ? null : u)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {isExpanded ? 'Fermer' : 'Gérer'}
                  </button>
                )}
              </div>

              {/* Expanded subscription management */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-white/5 animate-slide-up">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-ndp-text-dim mb-1">Dernier paiement</p>
                      <p className="text-sm text-ndp-text">
                        {u.lastPaymentDate
                          ? `${new Date(u.lastPaymentDate).toLocaleDateString('fr-FR')}${u.lastPaymentAmount ? ` - ${u.lastPaymentAmount}€` : ''}`
                          : 'Aucun'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-ndp-text-dim mb-1">Fin d'abonnement</p>
                      <p className={clsx('text-sm', isActive ? 'text-ndp-success' : 'text-ndp-danger')}>
                        {u.subscriptionEndDate
                          ? new Date(u.subscriptionEndDate).toLocaleDateString('fr-FR')
                          : 'Non défini'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="text-xs text-ndp-text-muted block mb-1">Date de paiement</label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="input text-sm py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-ndp-text-muted block mb-1">Montant (€)</label>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0"
                        className="input text-sm py-2 w-24"
                      />
                    </div>
                    <button
                      onClick={() => handleSubscription(u.id)}
                      disabled={saving || !paymentDate}
                      className="btn-success flex items-center gap-1.5 text-sm py-2"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                      Valider paiement
                    </button>
                    {isActive && (
                      <button
                        onClick={() => handleRevokeSubscription(u.id)}
                        disabled={saving}
                        className="btn-danger flex items-center gap-1.5 text-sm py-2"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Révoquer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface GenreMapping {
  id: number;
  genreId: number;
  genreName: string;
  mediaType: string;
  folderPath: string;
}

const GENRE_LIST = [
  { id: 28, name: 'Action' }, { id: 12, name: 'Aventure' }, { id: 16, name: 'Animation' },
  { id: 35, name: 'Comédie' }, { id: 80, name: 'Crime' }, { id: 99, name: 'Documentaire' },
  { id: 18, name: 'Drame' }, { id: 10751, name: 'Familial' }, { id: 14, name: 'Fantastique' },
  { id: 36, name: 'Histoire' }, { id: 27, name: 'Horreur' }, { id: 10402, name: 'Musique' },
  { id: 9648, name: 'Mystère' }, { id: 10749, name: 'Romance' }, { id: 878, name: 'Science-Fiction' },
  { id: 53, name: 'Thriller' }, { id: 10752, name: 'Guerre' }, { id: 37, name: 'Western' },
];

function SettingsTab() {
  const [radarrProfiles, setRadarrProfiles] = useState<QualityProfile[]>([]);
  const [radarrFolders, setRadarrFolders] = useState<RootFolder[]>([]);
  const [sonarrFolders, setSonarrFolders] = useState<RootFolder[]>([]);
  const [genreMappings, setGenreMappings] = useState<GenreMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [qualityProfile, setQualityProfile] = useState('');
  const [movieFolder, setMovieFolder] = useState('');
  const [tvFolder, setTvFolder] = useState('');
  const [subPrice, setSubPrice] = useState('');
  const [subDuration, setSubDuration] = useState('');
  const [plexMachineId, setPlexMachineId] = useState('');

  // Genre mapping form
  const [newGenreId, setNewGenreId] = useState('');
  const [newMediaType, setNewMediaType] = useState('movie');
  const [newFolderPath, setNewFolderPath] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, rProfiles, rFolders, sFolders, mappingsRes] = await Promise.all([
          api.get('/admin/settings'),
          api.get('/admin/radarr/profiles').catch(() => ({ data: [] })),
          api.get('/admin/radarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/sonarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/genre-mappings').catch(() => ({ data: [] })),
        ]);
        const s = settingsRes.data;
        setQualityProfile(s.defaultQualityProfile?.toString() || '');
        setMovieFolder(s.defaultMovieFolder || '');
        setTvFolder(s.defaultTvFolder || '');
        setSubPrice(s.subscriptionPrice?.toString() || '0');
        setSubDuration(s.subscriptionDuration?.toString() || '30');
        setPlexMachineId(s.plexMachineId || '');
        setRadarrProfiles(rProfiles.data);
        setRadarrFolders(rFolders.data);
        setSonarrFolders(sFolders.data);
        setGenreMappings(mappingsRes.data);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/admin/settings', {
        defaultQualityProfile: qualityProfile ? parseInt(qualityProfile) : null,
        defaultMovieFolder: movieFolder || null,
        defaultTvFolder: tvFolder || null,
        subscriptionPrice: parseFloat(subPrice) || 0,
        subscriptionDuration: parseInt(subDuration) || 30,
        plexMachineId: plexMachineId || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const addMapping = async () => {
    if (!newGenreId || !newFolderPath) return;
    const genre = GENRE_LIST.find(g => g.id === parseInt(newGenreId));
    if (!genre) return;
    try {
      const { data } = await api.post('/admin/genre-mappings', {
        genreId: genre.id,
        genreName: genre.name,
        mediaType: newMediaType,
        folderPath: newFolderPath,
      });
      setGenreMappings(prev => [...prev.filter(m => !(m.genreId === genre.id && m.mediaType === newMediaType)), data]);
      setNewGenreId('');
      setNewFolderPath('');
    } catch (err) {
      console.error('Failed to add mapping:', err);
    }
  };

  const deleteMapping = async (id: number) => {
    try {
      await api.delete(`/admin/genre-mappings/${id}`);
      setGenreMappings(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Failed to delete mapping:', err);
    }
  };

  const allFolders = [...new Map([...radarrFolders, ...sonarrFolders].map(f => [f.path, f])).values()];

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Quality Profile */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Profil de qualité</h3>
        <select value={qualityProfile} onChange={(e) => setQualityProfile(e.target.value)} className="input w-full">
          <option value="">Automatique (premier disponible)</option>
          {radarrProfiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Default folders */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Dossiers par défaut</h3>
        <p className="text-xs text-ndp-text-dim mb-4">Dossier utilisé quand aucun mapping de genre ne correspond.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-ndp-text mb-1 block">Films</label>
            <select value={movieFolder} onChange={(e) => setMovieFolder(e.target.value)} className="input w-full">
              <option value="">Auto (premier disponible)</option>
              {radarrFolders.map((f) => (
                <option key={f.path} value={f.path}>{f.path} ({formatBytes(f.freeSpace)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-ndp-text mb-1 block">Séries</label>
            <select value={tvFolder} onChange={(e) => setTvFolder(e.target.value)} className="input w-full">
              <option value="">Auto (premier disponible)</option>
              {sonarrFolders.map((f) => (
                <option key={f.path} value={f.path}>{f.path} ({formatBytes(f.freeSpace)})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Genre-Folder Mappings */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-2">Mapping genres → dossiers</h3>
        <p className="text-xs text-ndp-text-dim mb-4">
          Associez un genre à un dossier spécifique. Ex : Animation → /animes, Documentaire → /docs. Si un média a un genre mappé, il ira dans ce dossier au lieu du dossier par défaut.
        </p>

        {/* Existing mappings */}
        {genreMappings.length > 0 && (
          <div className="space-y-2 mb-4">
            {genreMappings.map((m) => (
              <div key={m.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                <span className="text-xs bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded">{m.mediaType === 'movie' ? 'Film' : 'Série'}</span>
                <span className="text-sm text-ndp-text font-medium">{m.genreName}</span>
                <span className="text-ndp-text-dim">→</span>
                <span className="text-sm text-ndp-text-muted flex-1 truncate">{m.folderPath}</span>
                <button onClick={() => deleteMapping(m.id)} className="text-ndp-text-dim hover:text-ndp-danger transition-colors">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new mapping */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-ndp-text-dim block mb-1">Type</label>
            <select value={newMediaType} onChange={(e) => setNewMediaType(e.target.value)} className="input text-sm py-2">
              <option value="movie">Film</option>
              <option value="tv">Série</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-ndp-text-dim block mb-1">Genre</label>
            <select value={newGenreId} onChange={(e) => setNewGenreId(e.target.value)} className="input text-sm py-2 w-full">
              <option value="">Choisir...</option>
              {GENRE_LIST.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-ndp-text-dim block mb-1">Dossier</label>
            <select value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)} className="input text-sm py-2 w-full">
              <option value="">Choisir...</option>
              {allFolders.map((f) => (
                <option key={f.path} value={f.path}>{f.path}</option>
              ))}
            </select>
          </div>
          <button onClick={addMapping} disabled={!newGenreId || !newFolderPath} className="btn-primary text-sm py-2">
            Ajouter
          </button>
        </div>
      </div>

      {/* Subscription */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Abonnement</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-ndp-text mb-1 block">Prix (€)</label>
            <input type="number" value={subPrice} onChange={(e) => setSubPrice(e.target.value)} className="input w-full" min="0" step="0.01" />
          </div>
          <div>
            <label className="text-sm text-ndp-text mb-1 block">Durée (jours)</label>
            <input type="number" value={subDuration} onChange={(e) => setSubDuration(e.target.value)} className="input w-full" min="1" />
          </div>
        </div>
      </div>

      {/* Plex */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Plex</h3>
        <label className="text-sm text-ndp-text mb-1 block">Machine ID du serveur Plex</label>
        <input type="text" value={plexMachineId} onChange={(e) => setPlexMachineId(e.target.value)} placeholder="Laissez vide pour désactiver" className="input w-full" />
        <p className="text-xs text-ndp-text-dim mt-1">
          Accédez à <code className="bg-white/5 px-1.5 py-0.5 rounded text-ndp-text-muted">http://IP_PLEX:32400/identity</code> et copiez <code className="bg-white/5 px-1.5 py-0.5 rounded text-ndp-text-muted">machineIdentifier</code>.
        </p>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={clsx('flex items-center gap-2 font-medium px-6 py-3 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Sauvegardé !' : 'Sauvegarder'}
      </button>
    </div>
  );
}

function JobsTab() {
  const [syncStatus, setSyncStatus] = useState<{
    lastRadarrSync: string | null;
    lastSonarrSync: string | null;
    syncIntervalHours: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ radarr?: { added: number; updated: number; duration: number }; sonarr?: { added: number; updated: number; duration: number } } | null>(null);
  const [intervalHours, setIntervalHours] = useState('6');

  useEffect(() => {
    api.get('/admin/sync/status').then(({ data }) => {
      setSyncStatus(data);
      setIntervalHours(data.syncIntervalHours?.toString() || '6');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const runSync = async (type: 'full' | 'force' | 'radarr' | 'sonarr' | 'requests') => {
    setRunning(type);
    setLastResult(null);
    try {
      const endpoints: Record<string, string> = {
        full: '/admin/sync/run',
        force: '/admin/sync/force',
        radarr: '/admin/sync/radarr',
        sonarr: '/admin/sync/sonarr',
        requests: '/admin/sync/requests',
      };
      const { data } = await api.post(endpoints[type]);
      if (type === 'full' || type === 'force' || type === 'requests') {
        setLastResult(data);
      } else {
        setLastResult({ [type]: data });
      }
      // Refresh status
      const { data: status } = await api.get('/admin/sync/status');
      setSyncStatus(status);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setRunning(null);
    }
  };

  const saveInterval = async () => {
    try {
      await api.put('/admin/sync/interval', { hours: parseInt(intervalHours) || 6 });
    } catch (err) {
      console.error('Failed to save interval:', err);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>;
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('fr-FR') : 'Jamais';

  return (
    <div className="max-w-3xl space-y-6">
      {/* Sync status */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Synchronisation des médias</h3>
        <p className="text-xs text-ndp-text-dim mb-6">
          Importe les films et séries depuis Radarr/Sonarr. Le premier scan récupère tout, les suivants ne récupèrent que les nouveaux ajouts.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-ndp-text">Radarr Sync</span>
              <Clock className="w-4 h-4 text-ndp-text-dim" />
            </div>
            <p className="text-xs text-ndp-text-dim">Dernier scan : {formatDate(syncStatus?.lastRadarrSync ?? null)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-ndp-text">Sonarr Sync</span>
              <Clock className="w-4 h-4 text-ndp-text-dim" />
            </div>
            <p className="text-xs text-ndp-text-dim">Dernier scan : {formatDate(syncStatus?.lastSonarrSync ?? null)}</p>
          </div>
        </div>

        {/* Sync buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => runSync('full')}
            disabled={running !== null}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {running === 'full' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Sync complet
          </button>
          <button
            onClick={() => runSync('radarr')}
            disabled={running !== null}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {running === 'radarr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Radarr
          </button>
          <button
            onClick={() => runSync('sonarr')}
            disabled={running !== null}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {running === 'sonarr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Sonarr
          </button>
          <button
            onClick={() => runSync('force')}
            disabled={running !== null}
            className="btn-danger flex items-center gap-2 text-sm"
          >
            {running === 'force' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Force sync (tout reimporter)
          </button>
          <button
            onClick={() => runSync('requests')}
            disabled={running !== null}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {running === 'requests' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Importer demandes (tags)
          </button>
        </div>

        {/* Last result */}
        {lastResult && (
          <div className="mt-4 p-4 bg-ndp-success/5 border border-ndp-success/20 rounded-xl animate-fade-in">
            <p className="text-sm font-semibold text-ndp-success mb-2">Sync terminé</p>
            {lastResult.radarr && 'added' in lastResult.radarr && (
              <p className="text-xs text-ndp-text-muted">
                Radarr : +{lastResult.radarr.added} ajoutés, ~{lastResult.radarr.updated ?? 0} mis à jour {lastResult.radarr.duration ? `(${lastResult.radarr.duration}ms)` : ''}
              </p>
            )}
            {lastResult.radarr && 'imported' in lastResult.radarr && (
              <p className="text-xs text-ndp-text-muted">
                Radarr : +{(lastResult.radarr as unknown as {imported:number}).imported} demandes importées, {(lastResult.radarr as unknown as {skipped:number}).skipped} ignorées
              </p>
            )}
            {lastResult.sonarr && 'added' in lastResult.sonarr && (
              <p className="text-xs text-ndp-text-muted">
                Sonarr : +{lastResult.sonarr.added} ajoutés, ~{lastResult.sonarr.updated ?? 0} mis à jour {lastResult.sonarr.duration ? `(${lastResult.sonarr.duration}ms)` : ''}
              </p>
            )}
            {lastResult.sonarr && 'imported' in lastResult.sonarr && (
              <p className="text-xs text-ndp-text-muted">
                Sonarr : +{(lastResult.sonarr as unknown as {imported:number}).imported} demandes importées, {(lastResult.sonarr as unknown as {skipped:number}).skipped} ignorées
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sync interval */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Planification</h3>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-sm text-ndp-text mb-1 block">Intervalle de sync auto (heures)</label>
            <input
              type="number"
              value={intervalHours}
              onChange={(e) => setIntervalHours(e.target.value)}
              min="1"
              max="168"
              className="input text-sm w-24"
            />
          </div>
          <button onClick={saveInterval} className="btn-primary text-sm py-2.5 flex items-center gap-2">
            <Save className="w-4 h-4" />
            Sauver
          </button>
        </div>
        <p className="text-xs text-ndp-text-dim mt-2">
          Le sync automatique tourne en arrière-plan. Un sync initial est lancé 10 secondes après le démarrage du serveur.
        </p>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
