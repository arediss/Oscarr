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
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser, AppSettings, QualityProfile, RootFolder } from '@/types';

type Tab = 'settings' | 'users';

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

function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [radarrProfiles, setRadarrProfiles] = useState<QualityProfile[]>([]);
  const [radarrFolders, setRadarrFolders] = useState<RootFolder[]>([]);
  const [sonarrProfiles, setSonarrProfiles] = useState<QualityProfile[]>([]);
  const [sonarrFolders, setSonarrFolders] = useState<RootFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [qualityProfile, setQualityProfile] = useState<string>('');
  const [rootFolder, setRootFolder] = useState('');
  const [subPrice, setSubPrice] = useState('');
  const [subDuration, setSubDuration] = useState('');
  const [plexMachineId, setPlexMachineId] = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        const [settingsRes, rProfiles, rFolders, sProfiles, sFolders] = await Promise.all([
          api.get('/admin/settings'),
          api.get('/admin/radarr/profiles').catch(() => ({ data: [] })),
          api.get('/admin/radarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/sonarr/profiles').catch(() => ({ data: [] })),
          api.get('/admin/sonarr/rootfolders').catch(() => ({ data: [] })),
        ]);

        const s = settingsRes.data;
        setSettings(s);
        setQualityProfile(s.defaultQualityProfile?.toString() || '');
        setRootFolder(s.defaultRootFolder || '');
        setSubPrice(s.subscriptionPrice?.toString() || '0');
        setSubDuration(s.subscriptionDuration?.toString() || '30');
        setPlexMachineId(s.plexMachineId || '');

        setRadarrProfiles(rProfiles.data);
        setRadarrFolders(rFolders.data);
        setSonarrProfiles(sProfiles.data);
        setSonarrFolders(sFolders.data);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/admin/settings', {
        defaultQualityProfile: qualityProfile ? parseInt(qualityProfile) : null,
        defaultRootFolder: rootFolder || null,
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

  // Merge profiles (Radarr + Sonarr can have different profiles, we'll show Radarr by default)
  const allProfiles = radarrProfiles.length > 0 ? radarrProfiles : sonarrProfiles;
  const allFolders = [...new Map([...radarrFolders, ...sonarrFolders].map(f => [f.path, f])).values()];

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="space-y-6">
        {/* Quality Profile */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Radarr / Sonarr</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-ndp-text mb-1 block">Profil de qualité par défaut</label>
              <select value={qualityProfile} onChange={(e) => setQualityProfile(e.target.value)} className="input w-full">
                <option value="">Automatique (premier disponible)</option>
                {allProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-ndp-text mb-1 block">Dossier racine par défaut</label>
              <select value={rootFolder} onChange={(e) => setRootFolder(e.target.value)} className="input w-full">
                <option value="">Automatique (premier disponible)</option>
                {allFolders.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path} ({formatBytes(f.freeSpace)} libre)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Abonnement</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-ndp-text mb-1 block">Prix (€)</label>
              <input
                type="number"
                value={subPrice}
                onChange={(e) => setSubPrice(e.target.value)}
                className="input w-full"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-sm text-ndp-text mb-1 block">Durée (jours)</label>
              <input
                type="number"
                value={subDuration}
                onChange={(e) => setSubDuration(e.target.value)}
                className="input w-full"
                min="1"
              />
            </div>
          </div>
        </div>

        {/* Plex */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Plex</h3>

          <div>
            <label className="text-sm text-ndp-text mb-1 block">Machine ID du serveur Plex</label>
            <input
              type="text"
              value={plexMachineId}
              onChange={(e) => setPlexMachineId(e.target.value)}
              placeholder="Laissez vide pour désactiver la vérification"
              className="input w-full"
            />
            <p className="text-xs text-ndp-text-dim mt-1">
              Trouvable dans Plex Settings → General → Machine Identifier. Si vide, la vérification d'accès serveur est désactivée.
            </p>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            'flex items-center gap-2 font-medium px-6 py-3 rounded-xl transition-all',
            saved
              ? 'bg-ndp-success/10 text-ndp-success'
              : 'btn-primary'
          )}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
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
