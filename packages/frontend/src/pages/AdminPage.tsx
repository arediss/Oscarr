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
  FolderTree,
  Bell,
  ScrollText,
  MessageSquare,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser, AppSettings, QualityProfile, RootFolder } from '@/types';

type Tab = 'users' | 'messages' | 'paths' | 'jobs' | 'general';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'users', label: 'Utilisateurs', icon: Users },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'paths', label: 'Chemins & Règles', icon: FolderTree },
  { id: 'jobs', label: 'Jobs & Sync', icon: RefreshCw },
  { id: 'general', label: 'Général', icon: Settings },
];

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('users');

  if (!isAdmin) { navigate('/'); return null; }

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-ndp-accent" />
        <h1 className="text-2xl font-bold text-ndp-text">Administration</h1>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              activeTab === id ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'messages' && <MessagesAdminTab />}
      {activeTab === 'paths' && <PathsTab />}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'general' && <GeneralTab />}
    </div>
  );
}

// ============ USERS TAB ============
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);

  const fetchUsers = useCallback(async () => {
    try { const { data } = await api.get('/admin/users'); setUsers(data); }
    catch (err) { console.error('Failed to fetch users:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSubscription = async (userId: number) => {
    if (!paymentDate) return;
    setSaving(true);
    try {
      await api.put(`/admin/users/${userId}/subscription`, { paymentDate, amount: paymentAmount ? parseFloat(paymentAmount) : undefined });
      setSelectedUser(null); setPaymentDate(''); setPaymentAmount(''); fetchUsers();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleRevokeSubscription = async (userId: number) => {
    setSaving(true);
    try { await api.delete(`/admin/users/${userId}/subscription`); fetchUsers(); }
    catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleImportPlex = async () => {
    setImporting(true); setImportResult(null);
    try {
      const { data } = await api.post('/admin/users/import-plex');
      setImportResult(data);
      fetchUsers();
    } catch (err) { console.error('Import failed:', err); }
    finally { setImporting(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ndp-text">{users.length} utilisateur{users.length > 1 ? 's' : ''}</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleImportPlex} disabled={importing} className="btn-primary flex items-center gap-2 text-sm">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            Importer depuis Plex
          </button>
          <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> Rafraîchir</button>
        </div>
      </div>

      {importResult && (
        <div className="p-3 bg-ndp-success/5 border border-ndp-success/20 rounded-xl mb-4 animate-fade-in flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-ndp-success flex-shrink-0" />
          <p className="text-sm text-ndp-text-muted">
            {importResult.total} utilisateurs Plex trouvés : <strong className="text-ndp-success">{importResult.imported} importés</strong>, {importResult.skipped} déjà existants
          </p>
        </div>
      )}
      <div className="space-y-3">
        {users.map((u) => {
          const isActive = u.subscriptionActive;
          const isExpanded = selectedUser?.id === u.id;
          return (
            <div key={u.id} className="card">
              <div className="flex items-center gap-4 p-4">
                {u.avatar ? <img src={u.avatar} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent font-bold">{(u.plexUsername || u.email)[0].toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text">{u.plexUsername || u.email}</span>
                    {u.role === 'admin' && <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded-full font-semibold">Admin</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-ndp-text-dim">
                    <span>{u.email}</span><span>{u.requestCount} demande{(u.requestCount ?? 0) > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5" title={u.hasPlexServerAccess ? 'Accès serveur Plex' : 'Pas d\'accès serveur'}>
                  {u.hasPlexServerAccess ? <CheckCircle className="w-4 h-4 text-ndp-success" /> : <XCircle className="w-4 h-4 text-ndp-danger" />}
                  <span className="text-xs text-ndp-text-dim hidden sm:inline">Plex</span>
                </div>
                <div className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold', isActive ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger')}>
                  <CreditCard className="w-3.5 h-3.5" /><span className="hidden sm:inline">{isActive ? 'Actif' : 'Inactif'}</span>
                </div>
                {u.role !== 'admin' && <button onClick={() => setSelectedUser(isExpanded ? null : u)} className="btn-secondary text-xs py-1.5 px-3">{isExpanded ? 'Fermer' : 'Gérer'}</button>}
              </div>
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-white/5 animate-slide-up">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><p className="text-xs text-ndp-text-dim mb-1">Dernier paiement</p><p className="text-sm text-ndp-text">{u.lastPaymentDate ? `${new Date(u.lastPaymentDate).toLocaleDateString('fr-FR')}${u.lastPaymentAmount ? ` - ${u.lastPaymentAmount}€` : ''}` : 'Aucun'}</p></div>
                    <div><p className="text-xs text-ndp-text-dim mb-1">Fin d'abonnement</p><p className={clsx('text-sm', isActive ? 'text-ndp-success' : 'text-ndp-danger')}>{u.subscriptionEndDate ? new Date(u.subscriptionEndDate).toLocaleDateString('fr-FR') : 'Non défini'}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div><label className="text-xs text-ndp-text-muted block mb-1">Date de paiement</label><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="input text-sm py-2" /></div>
                    <div><label className="text-xs text-ndp-text-muted block mb-1">Montant (€)</label><input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0" className="input text-sm py-2 w-24" /></div>
                    <button onClick={() => handleSubscription(u.id)} disabled={saving || !paymentDate} className="btn-success flex items-center gap-1.5 text-sm py-2">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />} Valider paiement</button>
                    {isActive && <button onClick={() => handleRevokeSubscription(u.id)} disabled={saving} className="btn-danger flex items-center gap-1.5 text-sm py-2"><XCircle className="w-3.5 h-3.5" /> Révoquer</button>}
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

// ============ MESSAGES ADMIN TAB ============
function MessagesAdminTab() {
  const [bannerText, setBannerText] = useState('');
  const [chatEnabled, setChatEnabled] = useState(true);
  const [channels, setChannels] = useState<{ id: number; name: string; type: string; messageCount: number }[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [bannerRes, settingsRes, channelsRes] = await Promise.all([
          api.get('/chat/banner'),
          api.get('/admin/settings'),
          api.get('/chat/channels'),
        ]);
        setBannerText(bannerRes.data.banner || '');
        setChatEnabled(settingsRes.data.chatEnabled ?? true);
        setChannels(channelsRes.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const saveBanner = async () => {
    try {
      await api.put('/admin/banner', { banner: bannerText.trim() || null });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err) { console.error(err); }
  };

  const toggleChat = async () => {
    const next = !chatEnabled;
    try {
      await api.put('/admin/chat-toggle', { enabled: next });
      setChatEnabled(next);
    } catch (err) { console.error(err); }
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      const { data } = await api.post('/admin/channels', { name: newChannelName.trim(), type: newChannelType });
      setChannels(prev => [...prev, { ...data, messageCount: 0 }]);
      setNewChannelName('');
    } catch (err) { console.error(err); }
  };

  const deleteChannel = async (id: number) => {
    try {
      await api.delete(`/admin/channels/${id}`);
      setChannels(prev => prev.filter(c => c.id !== id));
    } catch (err) { console.error(err); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incident banner */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Bandeau d'incident</h3>
          <p className="text-xs text-ndp-text-dim mb-3">Affiché en haut de toutes les pages. Laissez vide pour masquer.</p>
          <input
            value={bannerText}
            onChange={(e) => setBannerText(e.target.value)}
            placeholder="Ex: Maintenance prévue ce soir à 22h"
            className="input w-full text-sm mb-3"
          />
          <button onClick={saveBanner} className={clsx('text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-2', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Sauvegardé' : 'Mettre à jour'}
          </button>
        </div>

        {/* Chat toggle */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Module Chat</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ndp-text">Chat en temps réel</p>
              <p className="text-xs text-ndp-text-dim">Active/désactive le module de messagerie</p>
            </div>
            <button onClick={toggleChat} className={clsx('w-12 h-7 rounded-full transition-colors relative', chatEnabled ? 'bg-ndp-success' : 'bg-ndp-surface-hover')}>
              <div className={clsx('w-5 h-5 rounded-full bg-white absolute top-1 transition-all', chatEnabled ? 'left-6' : 'left-1')} />
            </button>
          </div>
        </div>
      </div>

      {/* Channels */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Canaux de discussion</h3>

        {channels.length > 0 && (
          <div className="space-y-2 mb-4">
            {channels.map((ch) => (
              <div key={ch.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-4 py-3">
                <span className={clsx('text-xs px-2 py-0.5 rounded font-semibold',
                  ch.type === 'support' ? 'bg-ndp-warning/10 text-ndp-warning' :
                  ch.type === 'announcements' ? 'bg-ndp-accent/10 text-ndp-accent' :
                  'bg-white/10 text-ndp-text-muted'
                )}>{ch.type}</span>
                <span className="text-sm text-ndp-text font-medium flex-1">{ch.name}</span>
                <span className="text-xs text-ndp-text-dim">{ch.messageCount} msg</span>
                {ch.type !== 'support' && (
                  <button onClick={() => deleteChannel(ch.id)} className="text-ndp-text-dim hover:text-ndp-danger transition-colors">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-ndp-text-dim block mb-1">Nom du canal</label>
            <input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="Ex: Général, Annonces..." className="input text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-ndp-text-dim block mb-1">Type</label>
            <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)} className="input text-sm">
              <option value="general">Général</option>
              <option value="announcements">Annonces</option>
            </select>
          </div>
          <button onClick={createChannel} disabled={!newChannelName.trim()} className="btn-primary text-sm py-2.5">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ PATHS & RULES TAB ============
interface FolderRule {
  id: number; name: string; priority: number; mediaType: string;
  conditions: string; folderPath: string; seriesType: string | null;
}
interface RuleCondition { field: string; operator: string; value: string; }

const GENRE_LIST = [
  'Action','Aventure','Animation','Comédie','Crime','Documentaire','Drame',
  'Familial','Fantastique','Histoire','Horreur','Musique','Mystère',
  'Romance','Science-Fiction','Thriller','Guerre','Western',
];

function PathsTab() {
  const [radarrFolders, setRadarrFolders] = useState<RootFolder[]>([]);
  const [sonarrFolders, setSonarrFolders] = useState<RootFolder[]>([]);
  const [radarrProfiles, setRadarrProfiles] = useState<QualityProfile[]>([]);
  const [rules, setRules] = useState<FolderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [qualityProfile, setQualityProfile] = useState('');
  const [movieFolder, setMovieFolder] = useState('');
  const [tvFolder, setTvFolder] = useState('');
  const [animeFolder, setAnimeFolder] = useState('');

  // New rule form
  const [showNewRule, setShowNewRule] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMediaType, setNewMediaType] = useState('tv');
  const [newFolder, setNewFolder] = useState('');
  const [newSeriesType, setNewSeriesType] = useState('');
  const [newConditions, setNewConditions] = useState<RuleCondition[]>([{ field: 'genre', operator: 'contains', value: '' }]);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, rFolders, sFolders, rProfiles, rulesRes] = await Promise.all([
          api.get('/admin/settings'),
          api.get('/admin/radarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/sonarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/radarr/profiles').catch(() => ({ data: [] })),
          api.get('/admin/folder-rules').catch(() => ({ data: [] })),
        ]);
        const s = settingsRes.data;
        setQualityProfile(s.defaultQualityProfile?.toString() || '');
        setMovieFolder(s.defaultMovieFolder || '');
        setTvFolder(s.defaultTvFolder || '');
        setAnimeFolder(s.defaultAnimeFolder || '');
        setRadarrFolders(rFolders.data);
        setSonarrFolders(sFolders.data);
        setRadarrProfiles(rProfiles.data);
        setRules(rulesRes.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const saveDefaults = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/admin/settings', {
        defaultQualityProfile: qualityProfile ? parseInt(qualityProfile) : null,
        defaultMovieFolder: movieFolder || null,
        defaultTvFolder: tvFolder || null,
        defaultAnimeFolder: animeFolder || null,
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const addRule = async () => {
    if (!newName || !newFolder || newConditions.some(c => !c.value)) return;
    try {
      const { data } = await api.post('/admin/folder-rules', {
        name: newName, mediaType: newMediaType, folderPath: newFolder,
        seriesType: newSeriesType || null, priority: rules.length,
        conditions: newConditions,
      });
      setRules(prev => [...prev, data]);
      setShowNewRule(false); setNewName(''); setNewFolder(''); setNewSeriesType('');
      setNewConditions([{ field: 'genre', operator: 'contains', value: '' }]);
    } catch (err) { console.error(err); }
  };

  const deleteRule = async (id: number) => {
    try { await api.delete(`/admin/folder-rules/${id}`); setRules(prev => prev.filter(r => r.id !== id)); }
    catch (err) { console.error(err); }
  };

  const allFolders = [...new Map([...radarrFolders, ...sonarrFolders].map(f => [f.path, f])).values()];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Default paths */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">Profil qualité</h3>
          <select value={qualityProfile} onChange={(e) => setQualityProfile(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {radarrProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">Films</h3>
          <select value={movieFolder} onChange={(e) => setMovieFolder(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {radarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">Séries</h3>
          <select value={tvFolder} onChange={(e) => setTvFolder(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">Animes</h3>
          <select value={animeFolder} onChange={(e) => setAnimeFolder(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        </div>
      </div>
      <button onClick={saveDefaults} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Sauvegardé' : 'Sauvegarder les chemins'}
      </button>

      {/* Folder rules */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ndp-text uppercase tracking-wider">Règles de routage</h3>
          <button onClick={() => setShowNewRule(!showNewRule)} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nouvelle règle
          </button>
        </div>
        <p className="text-xs text-ndp-text-dim mb-5">
          Les règles sont évaluées par priorité. La première qui match détermine le dossier. Si aucune ne match, le dossier par défaut est utilisé.
        </p>

        {/* System rule: anime detection (non-deletable) */}
        <div className="space-y-3 mb-5">
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-ndp-text">Animes</span>
                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">Série</span>
                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">anime</span>
                <span className="text-[10px] bg-white/5 text-ndp-text-dim px-2 py-0.5 rounded">système</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                <span className="text-xs bg-white/5 text-ndp-text-muted px-2 py-0.5 rounded">genre contient <strong>Animation</strong></span>
                <span className="text-xs bg-white/5 text-ndp-text-muted px-2 py-0.5 rounded">pays dans <strong>JP, KR, CN, TW</strong></span>
              </div>
              <p className="text-xs text-ndp-text-dim">→ {animeFolder || <span className="italic">Configurer le dossier Animes ci-dessus</span>}</p>
            </div>
          </div>

        {/* Custom rules */}
        {rules.map((rule) => {
          const conds: RuleCondition[] = JSON.parse(rule.conditions);
          return (
            <div key={rule.id} className="bg-white/5 rounded-xl p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-ndp-text">{rule.name}</span>
                  <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded">{rule.mediaType === 'movie' ? 'Film' : rule.mediaType === 'tv' ? 'Série' : 'Tous'}</span>
                  {rule.seriesType && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">{rule.seriesType}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {conds.map((c, i) => (
                    <span key={i} className="text-xs bg-white/5 text-ndp-text-muted px-2 py-0.5 rounded">
                      {c.field} {c.operator} <strong>{c.value}</strong>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-ndp-text-dim">→ {rule.folderPath}</p>
              </div>
              <button onClick={() => deleteRule(rule.id)} className="text-ndp-text-dim hover:text-ndp-danger transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
            </div>
          );
        })}
        </div>

        {/* New rule form */}
        {showNewRule && (
          <div className="bg-ndp-accent/5 border border-ndp-accent/20 rounded-xl p-5 space-y-4 animate-slide-up">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">Nom</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Animes japonais" className="input text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">Type</label>
                <select value={newMediaType} onChange={(e) => setNewMediaType(e.target.value)} className="input text-sm w-full">
                  <option value="tv">Série</option><option value="movie">Film</option><option value="all">Tous</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">Type Sonarr</label>
                <select value={newSeriesType} onChange={(e) => setNewSeriesType(e.target.value)} className="input text-sm w-full">
                  <option value="">Standard</option><option value="anime">Anime</option><option value="daily">Daily</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-ndp-text-dim block mb-1">Dossier cible</label>
              <select value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="input text-sm w-full">
                <option value="">Choisir...</option>
                {allFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
              </select>
            </div>

            {/* Conditions */}
            <div>
              <label className="text-xs text-ndp-text-dim block mb-2">Conditions (toutes doivent matcher)</label>
              <div className="space-y-2">
                {newConditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={cond.field} onChange={(e) => { const c = [...newConditions]; c[i].field = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 w-32">
                      <option value="genre">Genre</option>
                      <option value="language">Langue</option>
                      <option value="country">Pays</option>
                    </select>
                    <select value={cond.operator} onChange={(e) => { const c = [...newConditions]; c[i].operator = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 w-32">
                      <option value="contains">contient</option>
                      <option value="is">est</option>
                      <option value="in">dans</option>
                    </select>
                    {cond.field === 'genre' ? (
                      <select value={cond.value} onChange={(e) => { const c = [...newConditions]; c[i].value = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 flex-1">
                        <option value="">Choisir...</option>
                        {GENRE_LIST.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    ) : (
                      <input value={cond.value} onChange={(e) => { const c = [...newConditions]; c[i].value = e.target.value; setNewConditions(c); }}
                        placeholder={cond.field === 'language' ? 'ja, ko, zh' : 'JP, KR, CN'}
                        className="input text-sm py-1.5 flex-1" />
                    )}
                    {newConditions.length > 1 && (
                      <button onClick={() => setNewConditions(prev => prev.filter((_, j) => j !== i))} className="text-ndp-text-dim hover:text-ndp-danger"><XCircle className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setNewConditions(prev => [...prev, { field: 'genre', operator: 'contains', value: '' }])} className="text-xs text-ndp-accent hover:text-ndp-accent-hover mt-2 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Ajouter une condition
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={addRule} disabled={!newName || !newFolder || newConditions.some(c => !c.value)} className="btn-primary text-sm">Créer la règle</button>
              <button onClick={() => setShowNewRule(false)} className="btn-secondary text-sm">Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ JOBS TAB ============
function JobsTab() {
  const [syncStatus, setSyncStatus] = useState<{ lastRadarrSync: string | null; lastSonarrSync: string | null; syncIntervalHours: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [intervalHours, setIntervalHours] = useState('6');

  useEffect(() => {
    api.get('/admin/sync/status').then(({ data }) => { setSyncStatus(data); setIntervalHours(data.syncIntervalHours?.toString() || '6'); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const runSync = async (type: string) => {
    setRunning(type); setLastResult(null);
    try {
      const endpoints: Record<string, string> = { full: '/admin/sync/run', force: '/admin/sync/force', radarr: '/admin/sync/radarr', sonarr: '/admin/sync/sonarr', requests: '/admin/sync/requests' };
      const { data } = await api.post(endpoints[type]);
      setLastResult(data);
      const { data: status } = await api.get('/admin/sync/status');
      setSyncStatus(status);
    } catch (err) { console.error(err); } finally { setRunning(null); }
  };

  if (loading) return <Spinner />;
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('fr-FR') : 'Jamais';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold text-ndp-text">Radarr Sync</span><Clock className="w-4 h-4 text-ndp-text-dim" /></div>
          <p className="text-xs text-ndp-text-dim">Dernier scan : {formatDate(syncStatus?.lastRadarrSync ?? null)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold text-ndp-text">Sonarr Sync</span><Clock className="w-4 h-4 text-ndp-text-dim" /></div>
          <p className="text-xs text-ndp-text-dim">Dernier scan : {formatDate(syncStatus?.lastSonarrSync ?? null)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {['full', 'radarr', 'sonarr', 'force', 'requests'].map((type) => {
          const labels: Record<string, string> = { full: 'Sync complet', radarr: 'Sync Radarr', sonarr: 'Sync Sonarr', force: 'Force sync', requests: 'Importer demandes' };
          const isDanger = type === 'force';
          return (
            <button key={type} onClick={() => runSync(type)} disabled={running !== null}
              className={clsx('flex items-center gap-2 text-sm', isDanger ? 'btn-danger' : type === 'full' ? 'btn-primary' : 'btn-secondary')}>
              {running === type ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {labels[type]}
            </button>
          );
        })}
      </div>

      {lastResult && (
        <div className="p-4 bg-ndp-success/5 border border-ndp-success/20 rounded-xl animate-fade-in">
          <p className="text-sm font-semibold text-ndp-success mb-1">Terminé</p>
          <pre className="text-xs text-ndp-text-muted whitespace-pre-wrap">{JSON.stringify(lastResult, null, 2)}</pre>
        </div>
      )}

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-ndp-text mb-3">Planification</h3>
        <div className="flex items-end gap-3">
          <div><label className="text-xs text-ndp-text-dim block mb-1">Intervalle (heures)</label><input type="number" value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)} min="1" max="168" className="input text-sm w-24" /></div>
          <button onClick={() => api.put('/admin/sync/interval', { hours: parseInt(intervalHours) || 6 })} className="btn-primary text-sm py-2.5"><Save className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

// ============ GENERAL TAB ============
function GeneralTab() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [subPrice, setSubPrice] = useState('');
  const [subDuration, setSubDuration] = useState('');
  const [plexMachineId, setPlexMachineId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      setSubPrice(data.subscriptionPrice?.toString() || '0');
      setSubDuration(data.subscriptionDuration?.toString() || '30');
      setPlexMachineId(data.plexMachineId || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/admin/settings', { subscriptionPrice: parseFloat(subPrice) || 0, subscriptionDuration: parseInt(subDuration) || 30, plexMachineId: plexMachineId || null });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Abonnement</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm text-ndp-text mb-1 block">Prix (€)</label><input type="number" value={subPrice} onChange={(e) => setSubPrice(e.target.value)} className="input w-full" min="0" step="0.01" /></div>
            <div><label className="text-sm text-ndp-text mb-1 block">Durée (jours)</label><input type="number" value={subDuration} onChange={(e) => setSubDuration(e.target.value)} className="input w-full" min="1" /></div>
          </div>
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Plex</h3>
          <label className="text-sm text-ndp-text mb-1 block">Machine ID du serveur</label>
          <input type="text" value={plexMachineId} onChange={(e) => setPlexMachineId(e.target.value)} placeholder="Laissez vide pour désactiver" className="input w-full" />
          <p className="text-xs text-ndp-text-dim mt-1"><code className="bg-white/5 px-1.5 py-0.5 rounded text-ndp-text-muted">http://IP:32400/identity</code> → machineIdentifier</p>
        </div>
      </div>
      <button onClick={handleSave} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Sauvegardé' : 'Sauvegarder'}
      </button>
    </div>
  );
}

// ============ SHARED ============
function Spinner() { return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>; }
function formatBytes(bytes: number): string { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B','KB','MB','GB','TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]; }
