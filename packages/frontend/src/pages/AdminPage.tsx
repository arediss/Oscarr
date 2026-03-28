import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import cronstrue from 'cronstrue/i18n';
import i18n from '@/i18n';
import { localizedDateTime } from '@/i18n/formatters';
import {
  Settings,
  Users,
  Shield,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Clock,
  FolderTree,
  Bell,
  AlertTriangle,
  ArrowUpCircle,
  ExternalLink,
  ScrollText,
  Plus,
  Trash2,
  Send,
  Server,
  Pencil,
  Power,
  Star,
  Plug,
  Link,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useFeatures } from '@/context/FeaturesContext';
import { usePluginUI } from '@/plugins/usePlugins';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { PluginAdminTab } from '@/plugins/PluginAdminTab';
import type { AdminUser, QualityProfile, RootFolder } from '@/types';

type Tab = 'users' | 'services' | 'quality' | 'support' | 'notifications' | 'paths' | 'jobs' | 'logs' | 'general' | (string & {});

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'admin.tab.general', icon: Settings },
  { id: 'users', label: 'admin.tab.users', icon: Users },
  { id: 'services', label: 'admin.tab.services', icon: Server },
  { id: 'quality', label: 'admin.tab.quality', icon: Star },
  { id: 'notifications', label: 'admin.tab.notifications', icon: Bell },
  { id: 'paths', label: 'admin.tab.paths', icon: FolderTree },
  { id: 'jobs', label: 'admin.tab.jobs', icon: RefreshCw },
  { id: 'logs', label: 'admin.tab.logs', icon: ScrollText },
  { id: 'plugins', label: 'admin.tab.plugins', icon: Plug },
];

export default function AdminPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contributions: pluginTabs } = usePluginUI('admin.tabs');
  const [warnings, setWarnings] = useState<Record<string, boolean>>({});

  const refreshWarnings = useCallback(() => {
    api.get('/admin/setup-status').then(({ data }) => {
      const w: Record<string, boolean> = {};
      if (!data.radarr && !data.sonarr) w.services = true;
      if (!data.qualityMappings) w.quality = true;
      if (!data.defaultFolders) w.paths = true;
      setWarnings(w);
    }).catch(() => {});
  }, []);

  const currentTab = searchParams.get('tab');
  useEffect(() => { refreshWarnings(); }, [currentTab, refreshWarnings]);

  const pluginTabItems = pluginTabs.map((c) => ({
    id: `plugin:${c.props.id}` as string,
    label: c.props.label as string,
    pluginIcon: c.props.icon as string,
  }));

  const tabFromUrl = searchParams.get('tab') as string | null;
  const allTabIds = [...TABS.map(t => t.id), ...pluginTabItems.map(t => t.id)];
  const activeTab = tabFromUrl && allTabIds.includes(tabFromUrl) ? tabFromUrl : 'general';

  const setActiveTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  if (!isAdmin) { navigate('/'); return null; }

  const activePluginTab = activeTab.startsWith('plugin:') ? activeTab.replace('plugin:', '') : null;

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-ndp-accent" />
        <h1 className="text-2xl font-bold text-ndp-text">{t('admin.title')}</h1>
      </div>

      <div className="flex gap-3 mb-8 overflow-x-auto pb-2 pt-1" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              activeTab === id ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light',
              warnings[id] && activeTab !== id && 'ring-1 ring-ndp-danger/50'
            )}
          >
            <Icon className="w-4 h-4" />
            {t(label)}
            {warnings[id] && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-ndp-danger rounded-full flex items-center justify-center text-[10px] font-bold text-white">!</span>
            )}
          </button>
        ))}
        {pluginTabItems.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              activeTab === tab.id ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
            )}
          >
            <DynamicIcon name={tab.pluginIcon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'services' && <ServicesTab />}
      {activeTab === 'quality' && <QualityTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'paths' && <PathsTab />}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'logs' && <LogsTab />}
      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'plugins' && <PluginsTab />}
      {activePluginTab && <PluginAdminTab pluginId={activePluginTab} />}
    </div>
  );
}

// ============ USERS TAB ============
type UserSort = 'username' | 'date' | 'role';

function UsersTab() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<UserSort>('username');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const [deletingUser, setDeletingUser] = useState<number | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<number | null>(null);
  const [linkingUser, setLinkingUser] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const { data: usersData } = await api.get('/admin/users');
      setUsers(usersData);
    } catch (err) { console.error('Failed to fetch users:', err); }
    finally { setLoading(false); }
  }, []);

  const handleDeleteUser = async (userId: number) => {
    setDeletingUser(userId);
    try {
      await api.delete(`/admin/danger/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) { console.error('Failed to delete user:', err); }
    finally { setDeletingUser(null); }
  };

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleLinkPlex = async (userId: number) => {
    setLinkingUser(userId);
    try {
      const { data } = await api.post('/auth/plex/pin');
      const { pin, authUrl } = data;
      window.open(authUrl, 'PlexAuth', 'width=600,height=700');

      let attempts = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts >= 120) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setLinkingUser(null);
          return;
        }
        try {
          const { data: linkData } = await api.post(`/admin/users/${userId}/link-provider`, { provider: 'plex', pinId: pin.id });
          if (linkData.success) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setLinkingUser(null);
            fetchUsers();
          }
        } catch { /* keep polling */ }
      }, 1000);
    } catch {
      setLinkingUser(null);
    }
  };

  const handleImportPlex = async () => {
    setImporting(true); setImportResult(null);
    try {
      const { data } = await api.post('/admin/users/import/plex');
      setImportResult(data);
      fetchUsers();
    } catch (err) { console.error('Import failed:', err); }
    finally { setImporting(false); }
  };

  if (loading) return <Spinner />;

  const sortedUsers = [...users].sort((a, b) => {
    if (sortBy === 'username') return (a.displayName || a.email).localeCompare(b.displayName || b.email);
    if (sortBy === 'role') return a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-ndp-text">{t('admin.users.count', { count: users.length })}</h2>
          <div className="flex items-center gap-1">
            {([['username', t('admin.users.sort.name')], ['date', t('admin.users.sort.date')], ['role', t('admin.users.sort.role')]] as [UserSort, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-all', sortBy === key ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleImportPlex} disabled={importing} className="btn-primary flex items-center gap-2 text-sm">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            {t('admin.users.import_plex')}
          </button>
          <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> {t('common.refresh')}</button>
        </div>
      </div>

      {importResult && (
        <div className="p-3 bg-ndp-success/5 border border-ndp-success/20 rounded-xl mb-4 animate-fade-in flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-ndp-success flex-shrink-0" />
          <p className="text-sm text-ndp-text-muted">
            {t('admin.users.imported', { imported: importResult.imported, existing: importResult.skipped })}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {sortedUsers.map((u) => (
            <div key={u.id} className="card">
              <div className="flex items-center gap-4 p-4">
                {u.avatar ? <img src={u.avatar} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent font-bold">{(u.displayName || u.email)[0].toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text">{u.displayName || u.email}</span>
                    {u.role === 'admin' && <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded-full font-semibold">Admin</span>}
                  </div>
                  <span className="text-xs text-ndp-text-dim mt-0.5 block">{u.email}</span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-xs text-ndp-text-dim tabular-nums">{u.requestCount} {t('requests.title').toLowerCase()}</span>
                  {(u.providers || []).map((p) => (
                    <span key={p.provider} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      p.provider === 'plex' ? 'bg-[#e5a00d]/10 text-[#e5a00d]' :
                      p.provider === 'email' ? 'bg-ndp-accent/10 text-ndp-accent' :
                      'bg-white/5 text-ndp-text-dim'
                    }`} title={p.email && p.email !== u.email ? p.email : p.username || undefined}>
                      {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}
                      {p.email && p.email !== u.email && <span className="ml-1 opacity-60">({p.email})</span>}
                    </span>
                  ))}
                  {!(u.providers || []).some((p) => p.provider === 'plex') && (
                    <button
                      onClick={() => handleLinkPlex(u.id)}
                      disabled={linkingUser === u.id}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#e5a00d]/5 text-[#e5a00d]/60 hover:bg-[#e5a00d]/15 hover:text-[#e5a00d] transition-colors flex items-center gap-1"
                      title={t('admin.users.link_plex')}
                    >
                      {linkingUser === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                      Plex
                    </button>
                  )}
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => setConfirmDeleteUser(u.id)}
                      disabled={deletingUser === u.id}
                      className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                      title={t('admin.danger.delete_user')}
                    >
                      {deletingUser === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteUser && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-ndp-text mb-2">{t('admin.danger.confirm_title')}</h3>
            <p className="text-sm text-ndp-text-muted mb-1">
              {t('admin.users.confirm_delete', { name: users.find(u => u.id === confirmDeleteUser)?.displayName || users.find(u => u.id === confirmDeleteUser)?.email })}
            </p>
            <p className="text-xs text-ndp-text-dim mb-6">
              {t('admin.users.confirm_delete_desc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteUser(null)}
                className="btn-secondary text-sm flex-1"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  const userId = confirmDeleteUser;
                  setConfirmDeleteUser(null);
                  await handleDeleteUser(userId);
                }}
                disabled={deletingUser !== null}
                className="btn-danger text-sm flex-1 flex items-center justify-center gap-2"
              >
                {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('admin.danger.delete_user')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ============ SUPPORT ADMIN TAB ============
// ============ PATHS & RULES TAB ============
interface FolderRule {
  id: number; name: string; priority: number; mediaType: string;
  conditions: string; folderPath: string; seriesType: string | null; serviceId: number | null;
}
interface RuleCondition { field: string; operator: string; value: string; }

const GENRE_KEYS = [
  'action','adventure','animation','comedy','crime','documentary','drama',
  'family','fantasy','history','horror','music','mystery',
  'romance','science_fiction','thriller','war','western',
];

function PathsTab() {
  const { t } = useTranslation();
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
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('admin.paths.quality_profile')}</h3>
          <select value={qualityProfile} onChange={(e) => setQualityProfile(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {radarrProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('admin.paths.movies')}</h3>
          <select value={movieFolder} onChange={(e) => setMovieFolder(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {radarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('admin.paths.series')}</h3>
          <select value={tvFolder} onChange={(e) => setTvFolder(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('admin.paths.anime')}</h3>
          <select value={animeFolder} onChange={(e) => setAnimeFolder(e.target.value)} className="input w-full text-sm">
            <option value="">Auto</option>
            {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        </div>
      </div>
      <button onClick={saveDefaults} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? t('common.saved') : t('admin.paths.save_paths')}
      </button>

      {/* Folder rules */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ndp-text uppercase tracking-wider">{t('admin.paths.routing_rules')}</h3>
          <button onClick={() => setShowNewRule(!showNewRule)} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {t('admin.paths.new_rule')}
          </button>
        </div>
        <p className="text-xs text-ndp-text-dim mb-5">
          {t('admin.paths.rules_help')}
        </p>

        {/* System rule: anime detection (non-deletable) */}
        <div className="space-y-3 mb-5">
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-ndp-text">{t('admin.paths.anime_rule')}</span>
                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">{t('common.series')}</span>
                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">{t('admin.paths.anime_tag')}</span>
                <span className="text-[10px] bg-white/5 text-ndp-text-dim px-2 py-0.5 rounded">{t('admin.paths.system_tag')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                <span className="text-xs bg-white/5 text-ndp-text-muted px-2 py-0.5 rounded">{t('admin.paths.genre_contains', { value: 'Animation' })}</span>
                <span className="text-xs bg-white/5 text-ndp-text-muted px-2 py-0.5 rounded">{t('admin.paths.country_in', { value: 'JP, KR, CN, TW' })}</span>
              </div>
              <p className="text-xs text-ndp-text-dim">→ {animeFolder || <span className="italic">{t('admin.paths.configure_anime')}</span>}</p>
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
                  <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded">{rule.mediaType === 'movie' ? t('common.movie') : rule.mediaType === 'tv' ? t('common.series') : t('common.all')}</span>
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
                <label className="text-xs text-ndp-text-dim block mb-1">{t('common.name')}</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Animes japonais" className="input text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">{t('common.type')}</label>
                <select value={newMediaType} onChange={(e) => setNewMediaType(e.target.value)} className="input text-sm w-full">
                  <option value="tv">{t('common.series')}</option><option value="movie">{t('common.movie')}</option><option value="all">{t('common.all')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.paths.sonarr_type')}</label>
                <select value={newSeriesType} onChange={(e) => setNewSeriesType(e.target.value)} className="input text-sm w-full">
                  <option value="">{t('admin.paths.standard')}</option><option value="anime">{t('admin.paths.anime_rule')}</option><option value="daily">{t('admin.paths.daily')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.paths.target_folder')}</label>
              <select value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="input text-sm w-full">
                <option value="">{t('common.choose')}</option>
                {allFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
              </select>
            </div>

            {/* Conditions */}
            <div>
              <label className="text-xs text-ndp-text-dim block mb-2">{t('admin.paths.conditions_help')}</label>
              <div className="space-y-2">
                {newConditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={cond.field} onChange={(e) => { const c = [...newConditions]; c[i].field = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 w-32">
                      <option value="genre">{t('admin.paths.genre')}</option>
                      <option value="language">{t('admin.paths.language')}</option>
                      <option value="country">{t('admin.paths.country')}</option>
                    </select>
                    <select value={cond.operator} onChange={(e) => { const c = [...newConditions]; c[i].operator = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 w-32">
                      <option value="contains">{t('admin.paths.contains')}</option>
                      <option value="is">{t('admin.paths.is')}</option>
                      <option value="in">{t('admin.paths.in')}</option>
                    </select>
                    {cond.field === 'genre' ? (
                      <select value={cond.value} onChange={(e) => { const c = [...newConditions]; c[i].value = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 flex-1">
                        <option value="">{t('common.choose')}</option>
                        {GENRE_KEYS.map(g => <option key={g} value={t(`genre.${g}`)}>{t(`genre.${g}`)}</option>)}
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
                <Plus className="w-3 h-3" /> {t('admin.paths.add_condition')}
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={addRule} disabled={!newName || !newFolder || newConditions.some(c => !c.value)} className="btn-primary text-sm">{t('admin.paths.create_rule')}</button>
              <button onClick={() => setShowNewRule(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
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

interface SyncToast {
  type: 'success' | 'error';
  message: string;
}

function JobsTab() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<CronJobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [forceRunning, setForceRunning] = useState(false);
  const [editingCron, setEditingCron] = useState<{ key: string; value: string } | null>(null);
  const [toast, setToast] = useState<SyncToast | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/jobs');
      setJobs(data);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const showToast = (t: SyncToast) => { setToast(t); setTimeout(() => setToast(null), 6000); };

  const formatSyncResult = (data: Record<string, any>) => {
    const parts: string[] = [];
    if (data.radarr) {
      const r = data.radarr;
      if ('added' in r) parts.push(t('admin.jobs.toast.radarr_sync', { added: r.added, updated: r.updated, duration: (r.duration / 1000).toFixed(1) }));
      else if ('imported' in r) parts.push(t('admin.jobs.toast.radarr_requests', { imported: r.imported, skipped: r.skipped }) + (r.errors ? t('admin.jobs.toast.errors', { errors: r.errors }) : ''));
    }
    if (data.sonarr) {
      const s = data.sonarr;
      if ('added' in s) parts.push(t('admin.jobs.toast.sonarr_sync', { added: s.added, updated: s.updated, duration: (s.duration / 1000).toFixed(1) }));
      else if ('imported' in s) parts.push(t('admin.jobs.toast.sonarr_requests', { imported: s.imported, skipped: s.skipped }) + (s.errors ? t('admin.jobs.toast.errors', { errors: s.errors }) : ''));
    }
    return parts.join(' — ') || JSON.stringify(data);
  };

  const runJob = async (key: string) => {
    setRunning(key);
    try {
      const { data } = await api.post(`/admin/jobs/${key}/run`);
      await fetchJobs();
      if (data?.result && (data.result.radarr || data.result.sonarr)) {
        showToast({ type: 'success', message: formatSyncResult(data.result) });
      } else {
        showToast({ type: 'success', message: t('admin.jobs.job_done', { key }) });
      }
    } catch (err: any) {
      showToast({ type: 'error', message: err.response?.data?.error || t('admin.jobs.job_failed', { key }) });
    } finally { setRunning(null); }
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

  const formatDate = (d: string | null) => d ? localizedDateTime(d) : '—';
  const cronToHuman = (expr: string) => {
    try { return cronstrue.toString(expr, { locale: i18n.language, use24HourTimeFormat: true }); }
    catch { return null; }
  };
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={clsx(
          'fixed bottom-6 right-6 z-50 max-w-lg px-5 py-3 rounded-xl shadow-2xl shadow-black/50 animate-fade-in flex items-start gap-3',
          toast.type === 'success' ? 'bg-ndp-success/10 border border-ndp-success/20 text-ndp-success' : 'bg-ndp-danger/10 border border-ndp-danger/20 text-ndp-danger'
        )}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <p className="text-sm">{toast.message}</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => runJob('new_media_sync')}
          disabled={running !== null || forceRunning}
          className="flex items-center gap-2 px-5 py-2.5 btn-primary text-sm font-medium rounded-xl"
        >
          {running === 'new_media_sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t('admin.jobs.sync_new')}
        </button>
        <button
          onClick={async () => {
            setForceRunning(true);
            try {
              const { data } = await api.post('/admin/sync/force');
              await fetchJobs();
              showToast({ type: 'success', message: formatSyncResult(data) });
            } catch (err: any) {
              showToast({ type: 'error', message: err.response?.data?.error || t('admin.jobs.sync_complete_failed') });
            }
            finally { setForceRunning(false); }
          }}
          disabled={running !== null || forceRunning}
          className="flex items-center gap-2 px-5 py-2.5 bg-ndp-warning/10 text-ndp-warning hover:bg-ndp-warning/20 text-sm font-medium rounded-xl transition-colors"
        >
          {forceRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t('admin.jobs.sync_all')}
        </button>
        <button
          onClick={() => runJob('request_sync')}
          disabled={running !== null || forceRunning}
          className="flex items-center gap-2 px-5 py-2.5 bg-ndp-surface hover:bg-ndp-surface-light text-ndp-text text-sm font-medium rounded-xl transition-colors"
        >
          {running === 'request_sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t('admin.jobs.sync_requests')}
        </button>
      </div>

      {/* Jobs table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-ndp-text-muted uppercase tracking-wider">{t('admin.jobs.header.job')}</th>
              <th className="px-5 py-3 text-xs font-semibold text-ndp-text-muted uppercase tracking-wider">{t('admin.jobs.header.schedule')}</th>
              <th className="px-5 py-3 text-xs font-semibold text-ndp-text-muted uppercase tracking-wider">{t('admin.jobs.header.last_run')}</th>
              <th className="px-5 py-3 text-xs font-semibold text-ndp-text-muted uppercase tracking-wider">{t('admin.jobs.header.duration')}</th>
              <th className="px-5 py-3 text-xs font-semibold text-ndp-text-muted uppercase tracking-wider">{t('admin.jobs.header.status')}</th>
              <th className="px-5 py-3 text-xs font-semibold text-ndp-text-muted uppercase tracking-wider text-right">{t('admin.jobs.header.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {jobs.map((job) => {
              const isEditing = editingCron?.key === job.key;
              return (
                <tr key={job.key} className={clsx('transition-colors hover:bg-white/[0.02]', !job.enabled && 'opacity-50')}>
                  <td className="px-5 py-4">
                    <span className="font-medium text-ndp-text">{job.label}</span>
                    <p className="text-xs text-ndp-text-dim font-mono mt-0.5">{job.key}</p>
                  </td>
                  <td className="px-5 py-4">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={editingCron.value}
                            onChange={(e) => setEditingCron({ key: job.key, value: e.target.value })}
                            className="input text-sm font-mono w-36 py-1 px-2"
                            onKeyDown={(e) => { if (e.key === 'Enter') saveCron(job.key, editingCron.value); if (e.key === 'Escape') setEditingCron(null); }}
                            autoFocus
                          />
                          {cronToHuman(editingCron.value) && (
                            <p className="text-[11px] text-ndp-accent mt-1">{cronToHuman(editingCron.value)}</p>
                          )}
                        </div>
                        <button onClick={() => saveCron(job.key, editingCron.value)} className="p-1 text-ndp-success hover:bg-ndp-success/10 rounded"><CheckCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingCron(null)} className="p-1 text-ndp-text-dim hover:bg-white/5 rounded"><XCircle className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingCron({ key: job.key, value: job.cronExpression })}
                        className="text-left hover:bg-white/5 px-2 py-1 rounded transition-colors group"
                      >
                        <span className="text-sm text-ndp-text">{cronToHuman(job.cronExpression) || job.cronExpression}</span>
                        <p className="text-[11px] font-mono text-ndp-text-dim group-hover:text-ndp-accent transition-colors">{job.cronExpression}</p>
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-4 text-ndp-text-muted text-xs">{formatDate(job.lastRunAt)}</td>
                  <td className="px-5 py-4 text-ndp-text-muted text-xs font-mono">{formatDuration(job.lastDuration)}</td>
                  <td className="px-5 py-4">
                    {job.lastStatus ? (
                      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full',
                        job.lastStatus === 'success' ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger'
                      )}>
                        {job.lastStatus === 'success' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {job.lastStatus === 'success' ? 'OK' : t('common.error')}
                      </span>
                    ) : (
                      <span className="text-xs text-ndp-text-dim">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => runJob(job.key)} disabled={running !== null} className="p-1.5 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors" title={t('admin.jobs.run')}>
                        {running === job.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </button>
                      <button onClick={() => toggleJob(job)} className="p-1.5 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={job.enabled ? t('common.disable') : t('common.enable')}>
                        <Power className={clsx('w-4 h-4', job.enabled && 'text-ndp-success')} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* CRON help */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('admin.jobs.cron_help')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            { expr: '*/5 * * * *', desc: t('admin.jobs.cron.every_5min') },
            { expr: '0 */2 * * *', desc: t('admin.jobs.cron.every_2h') },
            { expr: '0 6 * * *', desc: t('admin.jobs.cron.daily_6am') },
            { expr: '0 0 * * 1', desc: t('admin.jobs.cron.monday_midnight') },
          ].map(({ expr, desc }) => (
            <div key={expr} className="bg-white/[0.03] px-3 py-2 rounded-lg">
              <code className="text-ndp-accent">{expr}</code>
              <p className="text-ndp-text-dim mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <DangerZone />
    </div>
  );
}

// ============ LOGS TAB ============
interface LogEntry { id: number; level: string; label: string; message: string; createdAt: string; }

const LABEL_COLORS: Record<string, string> = {
  Auth: 'bg-blue-500/10 text-blue-400',
  Sync: 'bg-cyan-500/10 text-cyan-400',
  Job: 'bg-violet-500/10 text-violet-400',
  Settings: 'bg-slate-500/10 text-slate-400',
  Service: 'bg-orange-500/10 text-orange-400',
  User: 'bg-emerald-500/10 text-emerald-400',
  Notification: 'bg-pink-500/10 text-pink-400',
  Support: 'bg-amber-500/10 text-amber-400',
  Request: 'bg-indigo-500/10 text-indigo-400',
  Quality: 'bg-rose-500/10 text-rose-400',
  Media: 'bg-teal-500/10 text-teal-400',
  Test: 'bg-gray-500/10 text-gray-400',
  Setup: 'bg-lime-500/10 text-lime-400',
};

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t('admin.logs.just_now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('admin.logs.minutes_ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('admin.logs.hours_ago', { count: hours });
  const days = Math.floor(hours / 24);
  return t('admin.logs.days_ago', { count: days });
}

function LogsTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (levelFilter) params.set('level', levelFilter);
      if (labelFilter) params.set('label', labelFilter);
      const { data } = await api.get(`/admin/logs?${params}`);
      setLogs(data.results);
      setTotalPages(data.totalPages);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, levelFilter, labelFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(fetchLogs, 10_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const clearLogs = async () => {
    try { await api.delete('/admin/logs'); setLogs([]); }
    catch (err) { console.error(err); }
  };

  const levelColors: Record<string, string> = {
    info: 'bg-ndp-accent/10 text-ndp-accent',
    warn: 'bg-ndp-warning/10 text-ndp-warning',
    error: 'bg-ndp-danger/10 text-ndp-danger',
  };

  const uniqueLabels = [...new Set(logs.map((l) => l.label))].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {['', 'info', 'warn', 'error'].map((lvl) => (
            <button key={lvl} onClick={() => { setLevelFilter(lvl); setPage(1); }}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                levelFilter === lvl ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
              )}>
              {lvl || t('common.all')}
            </button>
          ))}
          <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />
          {uniqueLabels.map((lbl) => (
            <button key={lbl} onClick={() => { setLabelFilter(labelFilter === lbl ? '' : lbl); setPage(1); }}
              className={clsx('px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all',
                labelFilter === lbl ? (LABEL_COLORS[lbl] || 'bg-white/10 text-ndp-text') : 'bg-white/5 text-ndp-text-dim hover:bg-white/10'
              )}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={fetchLogs} className="btn-secondary text-xs flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> {t('common.refresh')}</button>
          <button onClick={clearLogs} className="btn-danger text-xs flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> {t('admin.logs.clear')}</button>
        </div>
      </div>

      {loading && logs.length === 0 ? <Spinner /> : logs.length === 0 ? (
        <div className="text-center py-16"><ScrollText className="w-10 h-10 text-ndp-text-dim mx-auto mb-2" /><p className="text-sm text-ndp-text-dim">{t('admin.logs.no_logs')}</p></div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="card">
              <div className="flex items-center gap-4 p-4">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase', levelColors[log.level] || '')}>{log.level}</span>
                  <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold', LABEL_COLORS[log.label] || 'bg-white/10 text-ndp-text-muted')}>{log.label}</span>
                </div>
                <p className="text-sm text-ndp-text flex-1 min-w-0 truncate">{log.message}</p>
                <span className="text-xs text-ndp-text-dim flex-shrink-0" title={localizedDateTime(log.createdAt)}>{timeAgo(log.createdAt, t)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-xs">← {t('common.previous')}</button>
          <span className="text-xs text-ndp-text-dim self-center">{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary text-xs">{t('common.next')} →</button>
        </div>
      )}
    </div>
  );
}

// ============ NOTIFICATIONS TAB ============
const EVENT_TYPES = [
  { key: 'request_new', label: 'admin.notifications.event.request_new' },
  { key: 'request_approved', label: 'admin.notifications.event.request_approved' },
  { key: 'request_declined', label: 'admin.notifications.event.request_declined' },
  { key: 'media_available', label: 'admin.notifications.event.media_available' },
  { key: 'incident_banner', label: 'admin.notifications.event.incident_banner' },
] as const;

const DEFAULT_MATRIX: Record<string, { discord: boolean; telegram: boolean; email: boolean }> = {
  request_new: { discord: true, telegram: true, email: false },
  request_approved: { discord: true, telegram: true, email: false },
  request_declined: { discord: true, telegram: true, email: false },
  media_available: { discord: true, telegram: true, email: false },
  incident_banner: { discord: true, telegram: true, email: false },
};

function NotificationsTab() {
  const { t } = useTranslation();
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
      setTestResult({ channel, ok: false, message: t('status.connection_failed') });
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
            {testingDiscord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {t('common.test')}
          </button>
          {testResult?.channel === 'discord' && (
            <p className={clsx('text-xs mt-2', testResult.ok ? 'text-ndp-success' : 'text-ndp-danger')}>
              {testResult.ok ? t('common.sent') : testResult.message}
            </p>
          )}
        </div>

        {/* Telegram */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">Telegram</h3>
          <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.notifications.bot_token')}</label>
          <input type="text" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} placeholder="123456:ABC-DEF..." className="input w-full text-sm mb-2" />
          <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.notifications.chat_id')}</label>
          <input type="text" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="-1001234567890" className="input w-full text-sm mb-3" />
          <button onClick={() => testChannel('telegram')} disabled={!hasTelegram || testingTelegram} className="btn-secondary text-xs flex items-center gap-1.5">
            {testingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {t('common.test')}
          </button>
          {testResult?.channel === 'telegram' && (
            <p className={clsx('text-xs mt-2', testResult.ok ? 'text-ndp-success' : 'text-ndp-danger')}>
              {testResult.ok ? t('common.sent') : testResult.message}
            </p>
          )}
        </div>

        {/* Email (Resend) */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">{t('admin.notifications.email_resend')}</h3>
          <label className="text-xs text-ndp-text-dim block mb-1">{t('common.api_key')}</label>
          <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_..." className="input w-full text-sm mb-2" />
          <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.services.sender_email')}</label>
          <input type="text" value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} placeholder="Oscarr <notifs@domain.com>" className="input w-full text-sm mb-2" />
          <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.services.recipient_email')}</label>
          <input type="text" value={resendToEmail} onChange={(e) => setResendToEmail(e.target.value)} placeholder="admin@domain.com" className="input w-full text-sm mb-3" />
          <button onClick={() => testChannel('email')} disabled={!hasEmail || testingEmail} className="btn-secondary text-xs flex items-center gap-1.5">
            {testingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {t('common.test')}
          </button>
          {testResult?.channel === 'email' && (
            <p className={clsx('text-xs mt-2', testResult.ok ? 'text-ndp-success' : 'text-ndp-danger')}>
              {testResult.ok ? t('common.sent') : testResult.message}
            </p>
          )}
        </div>
      </div>

      {/* Event Matrix */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">{t('admin.notifications.matrix_title')}</h3>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.notifications.matrix_desc')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-ndp-text-dim text-xs">
                <th className="text-left px-4 py-3">{t('admin.notifications.event_header')}</th>
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
                  <td className="px-4 py-3 text-ndp-text">{t(label)}</td>
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
        {saved ? t('common.saved') : t('common.save')}
      </button>
    </div>
  );
}

// ============ SERVICES TAB ============

import { useServiceSchemas, type ServiceData } from '@/hooks/useServiceSchemas';

function ServicesTab() {
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas();
  const { t } = useTranslation();
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
    if (!confirm(`${t('common.delete')}?`)) return;
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
        <p className="text-sm text-ndp-text-muted">{t('admin.services.description')}</p>
        <button onClick={() => { setEditingService(null); setShowModal(true); }} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> {t('common.add')}
        </button>
      </div>

      {services.length === 0 ? (
        <div className="card p-12 text-center">
          <Server className="w-12 h-12 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted">{t('admin.services.no_services')}</p>
          <p className="text-sm text-ndp-text-dim mt-1">{t('admin.services.no_services_help')}</p>
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
                    <img src={schema?.icon || '/favicon.svg'} alt={schema?.label || service.type} className="w-8 h-8 rounded-lg object-contain" />
                    <div>
                      <h3 className="text-sm font-semibold text-ndp-text">{service.name}</h3>
                      <p className="text-xs text-ndp-text-dim">{schema?.label || service.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {service.isDefault && (
                      <span className="px-2 py-0.5 bg-ndp-accent/10 text-ndp-accent text-[10px] font-semibold rounded-full">{t('common.default_badge')}</span>
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
                      <span className="text-ndp-text-muted">{t(field.labelKey)}:</span> {service.config[field.key] || '—'}
                    </p>
                  ))}
                </div>

                {result && (
                  <div className={clsx('text-xs px-3 py-2 rounded-lg mb-3', result.ok ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger')}>
                    {result.ok ? `${t('status.connected')}${result.version ? ` (v${result.version})` : ''}` : t('status.connection_failed')}
                  </div>
                )}

                <div className="flex items-center gap-1 pt-3 border-t border-white/5">
                  <button onClick={() => handleTest(service)} disabled={testing === service.id} className="p-2 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors" title={t('common.test')}>
                    {testing === service.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setEditingService(service); setShowModal(true); }} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={t('common.edit')}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleToggle(service)} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={service.enabled ? t('common.disable') : t('common.enable')}>
                    <Power className={clsx('w-4 h-4', service.enabled && 'text-ndp-success')} />
                  </button>
                  {!service.isDefault && (
                    <button onClick={() => handleSetDefault(service)} className="p-2 text-ndp-text-dim hover:text-ndp-warning hover:bg-white/5 rounded-lg transition-colors" title={t('admin.services.set_default')}>
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => handleDelete(service.id)} className="p-2 text-ndp-text-dim hover:text-ndp-danger hover:bg-white/5 rounded-lg transition-colors" title={t('common.delete')}>
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
  const { t } = useTranslation();
  const { schemas: SERVICE_SCHEMAS } = useServiceSchemas();
  const isEdit = !!service;
  const [type, setType] = useState(service?.type || 'radarr');
  const [name, setName] = useState(service?.name || '');
  const [config, setConfig] = useState<Record<string, string>>(service?.config || {});
  const [isDefault, setIsDefault] = useState(service?.isDefault || false);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [fetchingPlexToken, setFetchingPlexToken] = useState(false);
  const [detectingMachineId, setDetectingMachineId] = useState(false);

  const schema = SERVICE_SCHEMAS[type];

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const fetchPlexToken = async () => {
    setFetchingPlexToken(true);
    try {
      const { data } = await api.get('/admin/plex-token');
      if (data.token) handleConfigChange('token', data.token);
    } catch { /* empty */ }
    finally { setFetchingPlexToken(false); }
  };

  const detectMachineId = async () => {
    const url = config.url;
    const token = config.token;
    if (!url || !token) return;
    setDetectingMachineId(true);
    try {
      const res = await fetch(`${url}/identity`, {
        headers: { 'X-Plex-Token': token, Accept: 'application/json' },
      });
      const json = await res.json();
      const machineId = json.MediaContainer?.machineIdentifier;
      if (machineId) handleConfigChange('machineId', machineId);
    } catch { /* empty */ }
    finally { setDetectingMachineId(false); }
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ndp-text mb-5">{isEdit ? t('admin.services.edit_title') : t('admin.services.add_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label className="text-sm text-ndp-text mb-1.5 block">{t('admin.services.service_type')}</label>
              <select value={type} onChange={(e) => { setType(e.target.value); setConfig({}); }} className="input w-full">
                {Object.entries(SERVICE_SCHEMAS).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm text-ndp-text mb-1.5 block">{t('common.name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${schema?.label || type} Principal`} className="input w-full" required />
          </div>

          {schema?.fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm text-ndp-text mb-1.5 block">{t(field.labelKey)}</label>
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
              {/* Plex helpers */}
              {type === 'plex' && field.key === 'token' && (
                <button
                  type="button"
                  onClick={fetchPlexToken}
                  disabled={fetchingPlexToken}
                  className="mt-1.5 text-xs text-ndp-accent hover:text-ndp-accent-hover flex items-center gap-1 transition-colors"
                >
                  {fetchingPlexToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
                  {t('admin.services.use_plex_token')}
                </button>
              )}
              {type === 'plex' && field.key === 'machineId' && (
                <button
                  type="button"
                  onClick={detectMachineId}
                  disabled={detectingMachineId || !config.url || !config.token}
                  className="mt-1.5 text-xs text-ndp-accent hover:text-ndp-accent-hover flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  {detectingMachineId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {t('admin.services.auto_detect')}
                </button>
              )}
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm text-ndp-text-muted cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
            {t('admin.services.set_default')}
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? t('common.save') : t('common.add')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ============ QUALITY TAB ============
interface QualityMappingType {
  id: number;
  qualityProfileId: number;
  qualityProfileName: string;
  service: { id: number; name: string; type: string };
}

interface QualityOptionType {
  id: number;
  label: string;
  position: number;
  mappings: QualityMappingType[];
}

interface ServiceType {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

function QualityTab() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<QualityOptionType[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [editingMapping, setEditingMapping] = useState<{ qualityOptionId: number; serviceId: number } | null>(null);
  const [profiles, setProfiles] = useState<{ id: number; name: string }[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [optRes, svcRes] = await Promise.all([
        api.get('/admin/quality-options'),
        api.get('/admin/services'),
      ]);
      setOptions(optRes.data);
      setServices(svcRes.data.filter((s: ServiceType) => ['radarr', 'sonarr'].includes(s.type) && s.enabled));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedDefaults = async () => {
    await api.post('/admin/quality-options/seed');
    load();
  };

  const addOption = async () => {
    if (!newLabel.trim()) return;
    await api.post('/admin/quality-options', { label: newLabel.trim() });
    setNewLabel('');
    load();
  };

  const deleteOption = async (id: number) => {
    await api.delete(`/admin/quality-options/${id}`);
    load();
  };

  const openMapping = async (qualityOptionId: number, serviceId: number) => {
    setEditingMapping({ qualityOptionId, serviceId });
    setProfiles([]);
    setSelectedProfile(null);
    setLoadingProfiles(true);
    try {
      const { data } = await api.get(`/admin/services/${serviceId}/profiles`);
      // Filter out profiles already mapped to this quality+service
      const opt = options.find(o => o.id === qualityOptionId);
      const existingProfileIds = new Set(
        opt?.mappings.filter(m => m.service.id === serviceId).map(m => m.qualityProfileId) || []
      );
      setProfiles(data.filter((p: { id: number }) => !existingProfileIds.has(p.id)));
    } catch { /* service unreachable */ }
    finally { setLoadingProfiles(false); }
  };

  const saveMapping = async () => {
    if (!editingMapping || !selectedProfile) return;
    const profile = profiles.find(p => p.id === selectedProfile);
    await api.post('/admin/quality-mappings', {
      qualityOptionId: editingMapping.qualityOptionId,
      serviceId: editingMapping.serviceId,
      qualityProfileId: selectedProfile,
      qualityProfileName: profile?.name || `Profile ${selectedProfile}`,
    });
    setEditingMapping(null);
    load();
  };

  const deleteMapping = async (mappingId: number) => {
    await api.delete(`/admin/quality-mappings/${mappingId}`);
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ndp-accent" /></div>;

  return (
    <div className="space-y-8">
      {/* Quality Options */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ndp-text">{t('admin.quality.options_title')}</h2>
          {options.length === 0 && (
            <button onClick={seedDefaults} className="btn-secondary text-sm">
              {t('admin.quality.add_defaults')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          {options.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2 bg-ndp-surface-light px-4 py-2 rounded-xl">
              <span className="text-sm font-medium text-ndp-text">{opt.label}</span>
              <button onClick={() => deleteOption(opt.id)} className="text-ndp-text-dim hover:text-ndp-danger transition-colors">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOption()}
            placeholder={t('admin.quality.new_placeholder')}
            className="input flex-1 text-sm"
          />
          <button onClick={addOption} disabled={!newLabel.trim()} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quality Mappings */}
      {options.length > 0 && services.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-bold text-ndp-text mb-4">{t('admin.quality.mapping_title')}</h2>
          <p className="text-sm text-ndp-text-muted mb-6">
            {t('admin.quality.mapping_desc')}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-3 px-3 text-ndp-text-muted font-medium">{t('admin.tab.quality')}</th>
                  {services.map((svc) => (
                    <th key={svc.id} className="text-left py-3 px-3 text-ndp-text-muted font-medium">
                      {svc.name}
                      <span className="ml-1 text-xs opacity-50">({svc.type})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map((opt) => (
                  <tr key={opt.id} className="border-b border-white/5">
                    <td className="py-3 px-3 font-semibold text-ndp-text">{opt.label}</td>
                    {services.map((svc) => {
                      const mappings = opt.mappings.filter(m => m.service.id === svc.id);
                      return (
                        <td key={svc.id} className="py-3 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {mappings.map((mapping) => (
                              <div key={mapping.id} className="flex items-center gap-1 bg-ndp-success/10 px-2 py-1 rounded-lg">
                                <span className="text-ndp-success text-xs font-medium">{mapping.qualityProfileName}</span>
                                <button onClick={() => deleteMapping(mapping.id)} className="text-ndp-success/50 hover:text-ndp-danger transition-colors">
                                  <XCircle className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => openMapping(opt.id, svc.id)}
                              className="text-ndp-text-dim hover:text-ndp-accent transition-colors text-xs flex items-center gap-0.5 px-1.5 py-1"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profile selection modal */}
      {editingMapping && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={() => setEditingMapping(null)}>
          <div className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ndp-text mb-4">{t('admin.quality.select_profile')}</h3>
            {loadingProfiles ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-ndp-accent" /></div>
            ) : profiles.length === 0 ? (
              <p className="text-ndp-text-muted text-sm">{t('admin.quality.profiles_error')}</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfile(p.id)}
                    className={clsx(
                      'w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all',
                      selectedProfile === p.id
                        ? 'bg-ndp-accent text-white'
                        : 'bg-ndp-surface-light text-ndp-text hover:bg-white/10'
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingMapping(null)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={saveMapping} disabled={!selectedProfile} className="btn-primary text-sm">{t('common.save')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {services.length === 0 && options.length > 0 && (
        <div className="card p-6 text-center text-ndp-text-muted">
          <p>{t('admin.quality.no_services')}</p>
        </div>
      )}
    </div>
  );
}

// ============ GENERAL TAB ============
function GeneralTab() {
  const { t } = useTranslation();
  const { refreshFeatures } = useFeatures();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoApproveRequests, setAutoApproveRequests] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [requestsEnabled, setRequestsEnabled] = useState(true);
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [missingSearchCooldownMin, setMissingSearchCooldownMin] = useState(60);
  const [siteName, setSiteName] = useState('Oscarr');
  const [bannerText, setBannerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [versionInfo, setVersionInfo] = useState<{ current: string; latest?: string; updateAvailable?: boolean; releaseUrl?: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/admin/settings').then(({ data }) => {
        setAutoApproveRequests(data.autoApproveRequests ?? false);
        setRegistrationEnabled(data.registrationEnabled ?? true);
        setRequestsEnabled(data.requestsEnabled ?? true);
        setSupportEnabled(data.supportEnabled ?? true);
        setCalendarEnabled(data.calendarEnabled ?? true);
        setMissingSearchCooldownMin(data.missingSearchCooldownMin ?? 60);
        setSiteName(data.siteName ?? 'Oscarr');
      }),
      api.get('/app/banner').then(({ data }) => setBannerText(data.banner || '')),
      api.get('/app/version').then(({ data }) => setVersionInfo(data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await Promise.all([
        api.put('/admin/settings', {
          autoApproveRequests,
          registrationEnabled,
          requestsEnabled,
          supportEnabled,
          calendarEnabled,
          missingSearchCooldownMin,
          siteName: siteName.trim() || 'Oscarr',
        }),
        api.put('/admin/banner', { banner: bannerText.trim() || null }),
      ]);
      await refreshFeatures();
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
  ];

  return (
    <div className="space-y-6">
      {/* Version & Update Check */}
      {/* Site Name + Maintenance Banner */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:gap-0">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">{t('admin.general.site_name')}</h3>
            <p className="text-xs text-ndp-text-dim mb-3">{t('admin.general.site_name_desc')}</p>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="Oscarr"
              className="input w-full text-sm"
            />
          </div>
          <div className="hidden md:block w-px bg-white/5 mx-6" />
          <hr className="md:hidden border-white/5 my-5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">{t('admin.general.maintenance_banner')}</h3>
            <p className="text-xs text-ndp-text-dim mb-3">{t('admin.general.maintenance_desc')}</p>
            <input
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              placeholder={t('admin.general.maintenance_placeholder')}
              className="input w-full text-sm"
            />
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">{t('admin.general.features')}</h3>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.general.features_desc')}</p>
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

      {/* Missing search cooldown */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-4">{t('admin.general.search_cooldown')}</h3>
        <p className="text-xs text-ndp-text-dim mb-3">{t('admin.general.search_cooldown_desc')}</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={1440}
            value={missingSearchCooldownMin}
            onChange={(e) => setMissingSearchCooldownMin(Math.max(1, parseInt(e.target.value) || 60))}
            className="input w-24 text-sm text-center"
          />
          <span className="text-sm text-ndp-text-dim">minutes</span>
        </div>
      </div>

      {/* Save + Version */}
      <div className="flex items-center justify-between">
        <button onClick={handleSave} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t('common.saved') : t('common.save')}
        </button>
        {versionInfo && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-ndp-text-dim">{t('admin.general.current_version')} <span className="font-mono font-semibold text-ndp-accent">{versionInfo.current}</span></span>
            {versionInfo.updateAvailable && versionInfo.latest && (
              <a
                href={versionInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 bg-ndp-accent/10 text-ndp-accent rounded-lg text-xs font-medium hover:bg-ndp-accent/20 transition-colors"
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                v{versionInfo.latest}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {versionInfo.latest && !versionInfo.updateAvailable && (
              <span className="flex items-center gap-1 text-xs text-ndp-success">
                <CheckCircle className="w-3.5 h-3.5" />
                {t('admin.general.up_to_date')}
              </span>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ============ DANGER ZONE ============
function DangerZone() {
  const { t } = useTranslation();
  const [confirmAction, setConfirmAction] = useState<{ id: string; label: string; desc: string; keyword: string; onConfirm: () => Promise<void> } | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const actions = [
    {
      id: 'requests',
      label: t('admin.danger.purge_requests'),
      desc: t('admin.danger.purge_requests_desc'),
      keyword: 'SUPPRIMER',
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/requests');
        setResult(t('admin.danger.deleted_requests', { count: data.deleted }));
      },
    },
    {
      id: 'media',
      label: t('admin.danger.purge_media'),
      desc: t('admin.danger.purge_media_desc'),
      keyword: 'SUPPRIMER',
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/media');
        setResult(t('admin.danger.deleted_media', { media: data.deleted.media, seasons: data.deleted.seasons, requests: data.deleted.requests }));
      },
    },
    {
      id: 'users',
      label: t('admin.danger.purge_users'),
      desc: t('admin.danger.purge_users_desc'),
      keyword: 'SUPPRIMER',
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
        <div className="px-6 py-4 bg-ndp-danger/5 border-b border-ndp-danger/20">
          <h3 className="text-sm font-semibold text-ndp-danger flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {t('admin.danger.title')}
          </h3>
          <p className="text-xs text-ndp-text-dim mt-1">{t('admin.danger.description')}</p>
        </div>

        {result && (
          <div className="px-6 py-3 bg-ndp-success/5 border-b border-ndp-danger/20 animate-fade-in">
            <p className="text-sm text-ndp-success flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {result}
            </p>
          </div>
        )}

        <div className="divide-y divide-ndp-danger/10">
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

      {/* Confirmation modal */}
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

// ============ PLUGINS TAB ============
function PluginsTab() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<{ id: string; name: string; version: string; description?: string; author?: string; enabled: boolean; hasSettings: boolean; hasFrontend: boolean; error?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchPlugins = useCallback(() => {
    api.get('/plugins').then(({ data }) => setPlugins(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const handleToggle = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      await api.put(`/plugins/${id}/toggle`, { enabled });
      setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
    } catch { /* ignore */ }
    setToggling(null);
  };

  if (loading) return <Spinner />;

  if (plugins.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Plug className="w-10 h-10 text-ndp-text-dim mx-auto mb-3" />
        <p className="text-ndp-text-muted">{t('admin.plugins.no_plugins')}</p>
        {/* Translation contains safe static HTML (<code> tag) */}
        <p className="text-sm text-ndp-text-dim mt-1" dangerouslySetInnerHTML={{ __html: t('admin.plugins.no_plugins_help') }} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plugins.map((plugin) => (
        <div key={plugin.id} className="card p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ndp-text">{plugin.name}</h3>
              <span className="text-xs text-ndp-text-dim">v{plugin.version}</span>
              {plugin.error && (
                <span className="text-xs bg-ndp-danger/10 text-ndp-danger px-2 py-0.5 rounded-full">{t('common.error')}</span>
              )}
            </div>
            {plugin.description && (
              <p className="text-sm text-ndp-text-muted mt-0.5">{plugin.description}</p>
            )}
            {plugin.author && (
              <p className="text-xs text-ndp-text-dim mt-0.5">par {plugin.author}</p>
            )}
            {plugin.error && (
              <p className="text-xs text-ndp-danger mt-1">{plugin.error}</p>
            )}
          </div>
          <button
            onClick={() => handleToggle(plugin.id, !plugin.enabled)}
            disabled={toggling === plugin.id}
            className={clsx(
              'relative w-12 h-6 rounded-full transition-colors flex-shrink-0',
              plugin.enabled ? 'bg-ndp-accent' : 'bg-white/10'
            )}
          >
            <span className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
              plugin.enabled && 'translate-x-6'
            )} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ============ SHARED ============
function Spinner() { return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>; }

