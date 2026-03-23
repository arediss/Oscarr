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
  Clock,
  FolderTree,
  Bell,
  MessageSquare,
  ScrollText,
  Plus,
  Trash2,
  Send,
  Server,
  Pencil,
  Power,
  Star,
  Plug,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser, QualityProfile, RootFolder } from '@/types';

type Tab = 'users' | 'services' | 'support' | 'notifications' | 'paths' | 'jobs' | 'logs' | 'general';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'users', label: 'Utilisateurs', icon: Users },
  { id: 'services', label: 'Services', icon: Server },
  { id: 'support', label: 'Support', icon: MessageSquare },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'paths', label: 'Chemins & Règles', icon: FolderTree },
  { id: 'jobs', label: 'Jobs & Sync', icon: RefreshCw },
  { id: 'logs', label: 'Logs', icon: ScrollText },
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
      {activeTab === 'services' && <ServicesTab />}
      {activeTab === 'support' && <SupportAdminTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'paths' && <PathsTab />}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'logs' && <LogsTab />}
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

// ============ SUPPORT ADMIN TAB ============
function SupportAdminTab() {
  const [bannerText, setBannerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/support/banner').then(({ data }) => setBannerText(data.banner || '')).catch(console.error).finally(() => setLoading(false));
  }, []);

  const saveBanner = async () => {
    try {
      await api.put('/admin/banner', { banner: bannerText.trim() || null });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err) { console.error(err); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="card p-6 max-w-xl">
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
interface CronJobData {
  id: number;
  key: string;
  label: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDuration: number | null;
  lastResult: string | null;
}

function JobsTab() {
  const [jobs, setJobs] = useState<CronJobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [editingCron, setEditingCron] = useState<{ key: string; value: string } | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/jobs');
      setJobs(data);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const runJob = async (key: string) => {
    setRunning(key);
    try {
      await api.post(`/admin/jobs/${key}/run`);
      await fetchJobs();
    } catch (err) { console.error(err); } finally { setRunning(null); }
  };

  const toggleJob = async (job: CronJobData) => {
    await api.put(`/admin/jobs/${job.key}`, { enabled: !job.enabled });
    fetchJobs();
  };

  const saveCron = async (key: string, cronExpression: string) => {
    await api.put(`/admin/jobs/${key}`, { cronExpression });
    setEditingCron(null);
    fetchJobs();
  };

  if (loading) return <Spinner />;
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('fr-FR') : 'Jamais';
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-ndp-text-muted">Jobs automatiques planifiés avec des expressions CRON</p>

      <div className="space-y-4">
        {jobs.map((job) => {
          const isEditing = editingCron?.key === job.key;
          let parsedResult: Record<string, unknown> | null = null;
          try { if (job.lastResult) parsedResult = JSON.parse(job.lastResult); } catch { /* empty */ }

          return (
            <div key={job.key} className={clsx('card p-5 border transition-all', job.enabled ? 'border-white/10' : 'border-white/5 opacity-60')}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-ndp-text">{job.label}</h3>
                    {job.lastStatus && (
                      <span className={clsx('px-2 py-0.5 text-[10px] font-semibold rounded-full',
                        job.lastStatus === 'success' ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger'
                      )}>
                        {job.lastStatus === 'success' ? 'OK' : 'ERREUR'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ndp-text-dim mt-1">
                    Dernier lancement : {formatDate(job.lastRunAt)} {job.lastDuration !== null && `(${formatDuration(job.lastDuration)})`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => runJob(job.key)} disabled={running !== null} className="p-2 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors" title="Lancer maintenant">
                    {running === job.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button onClick={() => toggleJob(job)} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={job.enabled ? 'Désactiver' : 'Activer'}>
                    <Power className={clsx('w-4 h-4', job.enabled && 'text-ndp-success')} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editingCron.value}
                      onChange={(e) => setEditingCron({ key: job.key, value: e.target.value })}
                      className="input text-sm flex-1 font-mono"
                      placeholder="*/5 * * * *"
                      onKeyDown={(e) => { if (e.key === 'Enter') saveCron(job.key, editingCron.value); if (e.key === 'Escape') setEditingCron(null); }}
                    />
                    <button onClick={() => saveCron(job.key, editingCron.value)} className="p-1.5 text-ndp-success hover:bg-ndp-success/10 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                    <button onClick={() => setEditingCron(null)} className="p-1.5 text-ndp-text-dim hover:bg-white/5 rounded-lg"><XCircle className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => setEditingCron({ key: job.key, value: job.cronExpression })} className="flex items-center gap-2 text-sm font-mono text-ndp-text-muted hover:text-ndp-text transition-colors">
                    <code className="bg-white/5 px-2 py-1 rounded">{job.cronExpression}</code>
                    <Pencil className="w-3 h-3 opacity-50" />
                  </button>
                )}
              </div>

              {parsedResult && job.lastStatus === 'success' && (
                <div className="mt-3 p-3 bg-white/[0.02] rounded-lg">
                  <pre className="text-[11px] text-ndp-text-dim whitespace-pre-wrap">{JSON.stringify(parsedResult, null, 2)}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">Aide CRON</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            { expr: '*/5 * * * *', desc: 'Toutes les 5 min' },
            { expr: '0 */2 * * *', desc: 'Toutes les 2h' },
            { expr: '0 6 * * *', desc: 'Tous les jours à 6h' },
            { expr: '0 0 * * 1', desc: 'Chaque lundi minuit' },
          ].map(({ expr, desc }) => (
            <div key={expr} className="bg-white/[0.03] px-3 py-2 rounded-lg">
              <code className="text-ndp-accent">{expr}</code>
              <p className="text-ndp-text-dim mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ LOGS TAB ============
interface LogEntry { id: number; level: string; label: string; message: string; createdAt: string; }

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (levelFilter) params.set('level', levelFilter);
      const { data } = await api.get(`/admin/logs?${params}`);
      setLogs(data.results);
      setTotalPages(data.totalPages);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, levelFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const clearLogs = async () => {
    try { await api.delete('/admin/logs'); setLogs([]); }
    catch (err) { console.error(err); }
  };

  const levelColors: Record<string, string> = {
    info: 'bg-ndp-accent/10 text-ndp-accent',
    warn: 'bg-ndp-warning/10 text-ndp-warning',
    error: 'bg-ndp-danger/10 text-ndp-danger',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {['', 'info', 'warn', 'error'].map((lvl) => (
            <button key={lvl} onClick={() => { setLevelFilter(lvl); setPage(1); }}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                levelFilter === lvl ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
              )}>
              {lvl || 'Tous'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs} className="btn-secondary text-xs flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Rafraîchir</button>
          <button onClick={clearLogs} className="btn-danger text-xs flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Vider</button>
        </div>
      </div>

      {loading ? <Spinner /> : logs.length === 0 ? (
        <div className="text-center py-16"><ScrollText className="w-10 h-10 text-ndp-text-dim mx-auto mb-2" /><p className="text-sm text-ndp-text-dim">Aucun log</p></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-ndp-text-dim text-xs">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Niveau</th>
                <th className="text-left px-4 py-3">Label</th>
                <th className="text-left px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2.5 text-xs text-ndp-text-dim whitespace-nowrap">{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-2.5"><span className={clsx('text-[10px] px-2 py-0.5 rounded font-semibold', levelColors[log.level] || '')}>{log.level}</span></td>
                  <td className="px-4 py-2.5 text-xs text-ndp-text-muted">{log.label}</td>
                  <td className="px-4 py-2.5 text-xs text-ndp-text">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-xs">← Précédent</button>
          <span className="text-xs text-ndp-text-dim self-center">{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary text-xs">Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ============ NOTIFICATIONS TAB ============
const EVENT_TYPES = [
  { key: 'request_new', label: 'Nouvelle demande' },
  { key: 'request_approved', label: 'Demande approuvée' },
  { key: 'request_declined', label: 'Demande refusée' },
  { key: 'media_available', label: 'Média disponible' },
  { key: 'subscription_expiring', label: "Expiration d'abonnement" },
  { key: 'incident_banner', label: "Bandeau d'incident" },
] as const;

const DEFAULT_MATRIX: Record<string, { discord: boolean; telegram: boolean; email: boolean }> = {
  request_new: { discord: true, telegram: true, email: false },
  request_approved: { discord: true, telegram: true, email: false },
  request_declined: { discord: true, telegram: true, email: false },
  media_available: { discord: true, telegram: true, email: false },
  subscription_expiring: { discord: false, telegram: false, email: true },
  incident_banner: { discord: true, telegram: true, email: false },
};

function NotificationsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Channel credentials
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [resendToEmail, setResendToEmail] = useState('');

  // Matrix
  const [matrix, setMatrix] = useState<Record<string, { discord: boolean; telegram: boolean; email: boolean }>>(DEFAULT_MATRIX);

  // Test states
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ channel: string; ok: boolean; message?: string } | null>(null);

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      setDiscordWebhookUrl(data.discordWebhookUrl || '');
      setTelegramBotToken(data.telegramBotToken || '');
      setTelegramChatId(data.telegramChatId || '');
      setResendApiKey(data.resendApiKey || '');
      setResendFromEmail(data.resendFromEmail || '');
      setResendToEmail(data.resendToEmail || '');
      if (data.notificationMatrix) {
        try { setMatrix({ ...DEFAULT_MATRIX, ...JSON.parse(data.notificationMatrix) }); } catch {}
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggleMatrix = (event: string, channel: 'discord' | 'telegram' | 'email') => {
    setMatrix(prev => ({
      ...prev,
      [event]: { ...prev[event], [channel]: !prev[event][channel] },
    }));
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/admin/settings', {
        discordWebhookUrl: discordWebhookUrl || null,
        telegramBotToken: telegramBotToken || null,
        telegramChatId: telegramChatId || null,
        resendApiKey: resendApiKey || null,
        resendFromEmail: resendFromEmail || null,
        resendToEmail: resendToEmail || null,
        notificationMatrix: JSON.stringify(matrix),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const testChannel = async (channel: 'discord' | 'telegram' | 'email') => {
    setTestResult(null);
    try {
      if (channel === 'discord') {
        setTestingDiscord(true);
        await api.post('/admin/notifications/test/discord', { webhookUrl: discordWebhookUrl });
      } else if (channel === 'telegram') {
        setTestingTelegram(true);
        await api.post('/admin/notifications/test/telegram', { botToken: telegramBotToken, chatId: telegramChatId });
      } else {
        setTestingEmail(true);
        await api.post('/admin/notifications/test/email', { apiKey: resendApiKey, from: resendFromEmail, to: resendToEmail });
      }
      setTestResult({ channel, ok: true });
    } catch {
      setTestResult({ channel, ok: false, message: 'Échec de l\'envoi' });
    } finally {
      setTestingDiscord(false); setTestingTelegram(false); setTestingEmail(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  if (loading) return <Spinner />;

  const hasDiscord = !!discordWebhookUrl;
  const hasTelegram = !!telegramBotToken && !!telegramChatId;
  const hasEmail = !!resendApiKey && !!resendFromEmail && !!resendToEmail;

  return (
    <div className="space-y-6">
      {/* Channel Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Discord */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Discord</h3>
          <label className="text-xs text-ndp-text-dim block mb-1">Webhook URL</label>
          <input type="text" value={discordWebhookUrl} onChange={(e) => setDiscordWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." className="input w-full text-sm mb-3" />
          <button onClick={() => testChannel('discord')} disabled={!hasDiscord || testingDiscord} className="btn-secondary text-xs flex items-center gap-1.5">
            {testingDiscord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Tester
          </button>
          {testResult?.channel === 'discord' && (
            <p className={clsx('text-xs mt-2', testResult.ok ? 'text-ndp-success' : 'text-ndp-danger')}>
              {testResult.ok ? 'Envoyé !' : testResult.message}
            </p>
          )}
        </div>

        {/* Telegram */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Telegram</h3>
          <label className="text-xs text-ndp-text-dim block mb-1">Bot Token</label>
          <input type="text" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} placeholder="123456:ABC-DEF..." className="input w-full text-sm mb-2" />
          <label className="text-xs text-ndp-text-dim block mb-1">Chat ID</label>
          <input type="text" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="-1001234567890" className="input w-full text-sm mb-3" />
          <button onClick={() => testChannel('telegram')} disabled={!hasTelegram || testingTelegram} className="btn-secondary text-xs flex items-center gap-1.5">
            {testingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Tester
          </button>
          {testResult?.channel === 'telegram' && (
            <p className={clsx('text-xs mt-2', testResult.ok ? 'text-ndp-success' : 'text-ndp-danger')}>
              {testResult.ok ? 'Envoyé !' : testResult.message}
            </p>
          )}
        </div>

        {/* Email (Resend) */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Email (Resend)</h3>
          <label className="text-xs text-ndp-text-dim block mb-1">API Key</label>
          <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_..." className="input w-full text-sm mb-2" />
          <label className="text-xs text-ndp-text-dim block mb-1">Email expéditeur</label>
          <input type="text" value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} placeholder="Netflix du Pauvre <notifs@domain.com>" className="input w-full text-sm mb-2" />
          <label className="text-xs text-ndp-text-dim block mb-1">Email destinataire</label>
          <input type="text" value={resendToEmail} onChange={(e) => setResendToEmail(e.target.value)} placeholder="admin@domain.com" className="input w-full text-sm mb-3" />
          <button onClick={() => testChannel('email')} disabled={!hasEmail || testingEmail} className="btn-secondary text-xs flex items-center gap-1.5">
            {testingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Tester
          </button>
          {testResult?.channel === 'email' && (
            <p className={clsx('text-xs mt-2', testResult.ok ? 'text-ndp-success' : 'text-ndp-danger')}>
              {testResult.ok ? 'Envoyé !' : testResult.message}
            </p>
          )}
        </div>
      </div>

      {/* Event Matrix */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Matrice d'événements</h3>
        <p className="text-xs text-ndp-text-dim mb-4">Choisissez quels canaux reçoivent chaque type de notification.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-ndp-text-dim text-xs">
                <th className="text-left px-4 py-3">Événement</th>
                <th className="text-center px-4 py-3">
                  <span className={clsx(!hasDiscord && 'opacity-40')}>Discord</span>
                </th>
                <th className="text-center px-4 py-3">
                  <span className={clsx(!hasTelegram && 'opacity-40')}>Telegram</span>
                </th>
                <th className="text-center px-4 py-3">
                  <span className={clsx(!hasEmail && 'opacity-40')}>Email</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {EVENT_TYPES.map(({ key, label }) => (
                <tr key={key} className="border-b border-white/5">
                  <td className="px-4 py-3 text-ndp-text">{label}</td>
                  {(['discord', 'telegram', 'email'] as const).map((ch) => {
                    const disabled = (ch === 'discord' && !hasDiscord) || (ch === 'telegram' && !hasTelegram) || (ch === 'email' && !hasEmail);
                    return (
                      <td key={ch} className="text-center px-4 py-3">
                        <input
                          type="checkbox"
                          checked={matrix[key]?.[ch] ?? false}
                          onChange={() => toggleMatrix(key, ch)}
                          disabled={disabled}
                          className="w-4 h-4 rounded accent-ndp-accent disabled:opacity-30"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Sauvegardé' : 'Sauvegarder'}
      </button>
    </div>
  );
}

// ============ SERVICES TAB ============

interface ServiceField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
}

interface ServiceSchema {
  label: string;
  icon: string;
  fields: ServiceField[];
}

const SERVICE_SCHEMAS: Record<string, ServiceSchema> = {
  radarr: {
    label: 'Radarr',
    icon: '🎬',
    fields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'http://192.168.1.50:7878' },
      { key: 'apiKey', label: 'Clé API', type: 'password' },
    ],
  },
  sonarr: {
    label: 'Sonarr',
    icon: '📺',
    fields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'http://192.168.1.50:8989' },
      { key: 'apiKey', label: 'Clé API', type: 'password' },
    ],
  },
  qbittorrent: {
    label: 'qBittorrent',
    icon: '⬇️',
    fields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'http://192.168.1.64:8080' },
      { key: 'username', label: 'Utilisateur', type: 'text' },
      { key: 'password', label: 'Mot de passe', type: 'password' },
    ],
  },
};

interface ServiceData {
  id: number;
  name: string;
  type: string;
  config: Record<string, string>;
  isDefault: boolean;
  enabled: boolean;
}

function ServicesTab() {
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<ServiceData | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; version?: string } | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/services');
      setServices(data);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce service ?')) return;
    await api.delete(`/admin/services/${id}`);
    fetchServices();
  };

  const handleToggle = async (service: ServiceData) => {
    await api.put(`/admin/services/${service.id}`, { enabled: !service.enabled });
    fetchServices();
  };

  const handleSetDefault = async (service: ServiceData) => {
    await api.put(`/admin/services/${service.id}`, { isDefault: true });
    fetchServices();
  };

  const handleTest = async (service: ServiceData) => {
    setTesting(service.id);
    setTestResult(null);
    try {
      const { data } = await api.post(`/admin/services/${service.id}/test`);
      setTestResult({ id: service.id, ok: true, version: data.version });
    } catch {
      setTestResult({ id: service.id, ok: false });
    } finally { setTesting(null); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ndp-text-muted">Gérez vos services connectés (Radarr, Sonarr, qBittorrent...)</p>
        <button onClick={() => { setEditingService(null); setShowModal(true); }} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {services.length === 0 ? (
        <div className="card p-12 text-center">
          <Server className="w-12 h-12 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted">Aucun service configuré</p>
          <p className="text-sm text-ndp-text-dim mt-1">Ajoutez votre premier service pour commencer</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {services.map((service) => {
            const schema = SERVICE_SCHEMAS[service.type];
            const result = testResult?.id === service.id ? testResult : null;
            return (
              <div key={service.id} className={clsx('card p-5 border transition-all', service.enabled ? 'border-white/10' : 'border-white/5 opacity-60')}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{schema?.icon || '🔌'}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-ndp-text">{service.name}</h3>
                      <p className="text-xs text-ndp-text-dim">{schema?.label || service.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {service.isDefault && (
                      <span className="px-2 py-0.5 bg-ndp-accent/10 text-ndp-accent text-[10px] font-semibold rounded-full">PAR DÉFAUT</span>
                    )}
                    {service.enabled ? (
                      <span className="w-2 h-2 bg-ndp-success rounded-full" />
                    ) : (
                      <span className="w-2 h-2 bg-ndp-text-dim rounded-full" />
                    )}
                  </div>
                </div>

                <div className="space-y-1 mb-4">
                  {schema?.fields.filter(f => f.type !== 'password').map((field) => (
                    <p key={field.key} className="text-xs text-ndp-text-dim">
                      <span className="text-ndp-text-muted">{field.label}:</span> {service.config[field.key] || '—'}
                    </p>
                  ))}
                </div>

                {result && (
                  <div className={clsx('text-xs px-3 py-2 rounded-lg mb-3', result.ok ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger')}>
                    {result.ok ? `Connecté${result.version ? ` (v${result.version})` : ''}` : 'Connexion échouée'}
                  </div>
                )}

                <div className="flex items-center gap-1 pt-3 border-t border-white/5">
                  <button onClick={() => handleTest(service)} disabled={testing === service.id} className="p-2 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors" title="Tester">
                    {testing === service.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setEditingService(service); setShowModal(true); }} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title="Modifier">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleToggle(service)} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={service.enabled ? 'Désactiver' : 'Activer'}>
                    <Power className={clsx('w-4 h-4', service.enabled && 'text-ndp-success')} />
                  </button>
                  {!service.isDefault && (
                    <button onClick={() => handleSetDefault(service)} className="p-2 text-ndp-text-dim hover:text-ndp-warning hover:bg-white/5 rounded-lg transition-colors" title="Définir par défaut">
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => handleDelete(service.id)} className="p-2 text-ndp-text-dim hover:text-ndp-danger hover:bg-white/5 rounded-lg transition-colors" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ServiceModal
          service={editingService}
          onClose={() => { setShowModal(false); setEditingService(null); }}
          onSaved={() => { setShowModal(false); setEditingService(null); fetchServices(); }}
        />
      )}
    </div>
  );
}

function ServiceModal({ service, onClose, onSaved }: { service: ServiceData | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!service;
  const [type, setType] = useState(service?.type || 'radarr');
  const [name, setName] = useState(service?.name || '');
  const [config, setConfig] = useState<Record<string, string>>(service?.config || {});
  const [isDefault, setIsDefault] = useState(service?.isDefault || false);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const schema = SERVICE_SCHEMAS[type];

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/admin/services/${service!.id}`, { name, config, isDefault });
      } else {
        await api.post('/admin/services', { name, type, config, isDefault });
      }
      onSaved();
    } catch { /* empty */ } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ndp-text mb-5">{isEdit ? 'Modifier le service' : 'Ajouter un service'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label className="text-sm text-ndp-text mb-1.5 block">Type de service</label>
              <select value={type} onChange={(e) => { setType(e.target.value); setConfig({}); }} className="input w-full">
                {Object.entries(SERVICE_SCHEMAS).map(([key, s]) => (
                  <option key={key} value={key}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm text-ndp-text mb-1.5 block">Nom</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${schema?.label || type} Principal`} className="input w-full" required />
          </div>

          {schema?.fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm text-ndp-text mb-1.5 block">{field.label}</label>
              <div className="relative">
                <input
                  type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                  value={config[field.key] || ''}
                  onChange={(e) => handleConfigChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="input w-full pr-10"
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ndp-text-dim hover:text-ndp-text"
                  >
                    {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm text-ndp-text-muted cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
            Définir comme service par défaut
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Sauvegarder' : 'Ajouter'}
            </button>
          </div>
        </form>
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
  const [requestsEnabled, setRequestsEnabled] = useState(true);
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      setSubPrice(data.subscriptionPrice?.toString() || '0');
      setSubDuration(data.subscriptionDuration?.toString() || '30');
      setPlexMachineId(data.plexMachineId || '');
      setRequestsEnabled(data.requestsEnabled ?? true);
      setSupportEnabled(data.supportEnabled ?? true);
      setCalendarEnabled(data.calendarEnabled ?? true);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/admin/settings', {
        subscriptionPrice: parseFloat(subPrice) || 0,
        subscriptionDuration: parseInt(subDuration) || 30,
        plexMachineId: plexMachineId || null,
        requestsEnabled,
        supportEnabled,
        calendarEnabled,
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  const features = [
    { label: 'Demandes', desc: 'Permet aux utilisateurs de demander des médias', value: requestsEnabled, set: setRequestsEnabled },
    { label: 'Support', desc: 'Système de tickets de support', value: supportEnabled, set: setSupportEnabled },
    { label: 'Calendrier', desc: 'Calendrier des sorties à venir', value: calendarEnabled, set: setCalendarEnabled },
  ];

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

      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Fonctionnalités</h3>
        <p className="text-xs text-ndp-text-dim mb-4">Activez ou désactivez les sections du site pour les utilisateurs</p>
        <div className="space-y-3">
          {features.map(({ label, desc, value, set }) => (
            <label key={label} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer">
              <div>
                <p className="text-sm font-medium text-ndp-text">{label}</p>
                <p className="text-xs text-ndp-text-dim">{desc}</p>
              </div>
              <button
                type="button"
                onClick={() => set(!value)}
                className={clsx('relative w-11 h-6 rounded-full transition-colors', value ? 'bg-ndp-accent' : 'bg-white/10')}
              >
                <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm', value && 'translate-x-5')} />
              </button>
            </label>
          ))}
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

