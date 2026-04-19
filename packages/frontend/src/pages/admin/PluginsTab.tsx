import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plug, ExternalLink, Star, Loader2, Download, Package, Terminal, BookOpen, Copy, Check, RefreshCw, AlertTriangle, Trash2, X } from 'lucide-react';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import { invalidatePluginUICache } from '@/plugins/usePlugins';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { PluginConsentModal } from './PluginConsentModal';
import type { PluginInfo } from '@/plugins/types';

// `plugin.updateAvailable` + `plugin.latestVersion` come straight from the backend, which
// runs a proper semver comparison against the registry cache. No hand-rolled version logic here.

interface RegistryPlugin {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description: string;
  author: string;
  repository: string;
  category: string;
  tags?: string[];
  url: string;
  stars: number;
  updatedAt: string | null;
  services?: string[];
  capabilities?: string[];
  capabilityReasons?: Record<string, string>;
}

type SubTab = 'installed' | 'discover';

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  bots: { label: 'Bot', color: 'bg-indigo-500/15 text-indigo-400' },
  notifications: { label: 'Notifications', color: 'bg-amber-500/15 text-amber-400' },
  automation: { label: 'Automation', color: 'bg-cyan-500/15 text-cyan-400' },
  'requests-workflow': { label: 'Requests', color: 'bg-pink-500/15 text-pink-400' },
  subscriptions: { label: 'Subscriptions', color: 'bg-fuchsia-500/15 text-fuchsia-400' },
  'ui-themes': { label: 'Themes', color: 'bg-purple-500/15 text-purple-400' },
  analytics: { label: 'Analytics', color: 'bg-emerald-500/15 text-emerald-400' },
  utilities: { label: 'Utilities', color: 'bg-slate-500/15 text-slate-400' },
};

const TAG_CONFIG: Record<string, { label: string; color: string }> = {
  plex: { label: 'Plex', color: 'bg-[#e5a00d]/15 text-[#e5a00d]' },
  jellyfin: { label: 'Jellyfin', color: 'bg-violet-500/15 text-violet-400' },
  emby: { label: 'Emby', color: 'bg-green-500/15 text-green-400' },
  discord: { label: 'Discord', color: 'bg-indigo-500/15 text-indigo-400' },
  telegram: { label: 'Telegram', color: 'bg-sky-500/15 text-sky-400' },
  matrix: { label: 'Matrix', color: 'bg-teal-500/15 text-teal-400' },
  slack: { label: 'Slack', color: 'bg-rose-500/15 text-rose-400' },
  radarr: { label: 'Radarr', color: 'bg-yellow-500/15 text-yellow-400' },
  sonarr: { label: 'Sonarr', color: 'bg-blue-500/15 text-blue-400' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-ndp-text-dim hover:text-ndp-text transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-ndp-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function PluginInitial({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="w-12 h-12 rounded-xl bg-ndp-accent/15 flex items-center justify-center text-ndp-accent font-bold text-lg flex-shrink-0">
      {letter}
    </div>
  );
}

export function PluginsTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<SubTab>('installed');
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [registry, setRegistry] = useState<RegistryPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedInstall, setExpandedInstall] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Consent-first install: click Install → modal shows the manifest's services + capabilities →
  // admin confirms → Oscarr actually downloads the tarball and stores the plugin (disabled by default).
  const [installConsent, setInstallConsent] = useState<RegistryPlugin | null>(null);

  const handleInstall = (entry: RegistryPlugin) => {
    setInstallMessage(null);
    setInstallConsent(entry);
  };

  const doInstall = async (entry: RegistryPlugin) => {
    setInstalling(entry.id);
    const url = `https://api.github.com/repos/${entry.repository}/tarball/HEAD`;
    try {
      const { data } = await api.post('/plugins/install', { url });
      setInstallMessage({ kind: 'success', text: `Installed ${data.plugin.name} v${data.plugin.version} — toggle it on in Installed whenever you're ready` });
      setInstallConsent(null);
      await fetchPlugins();
      setSubTab('installed');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String((err as Error).message);
      setInstallMessage({ kind: 'error', text: msg });
    } finally {
      setInstalling(null);
      setTimeout(() => setInstallMessage(null), 6000);
    }
  };

  const handleRestart = async () => {
    setShowRestartConfirm(false);
    setRestarting(true);
    try {
      await api.post('/admin/restart');
    } catch { /* server is shutting down, expected */ }

    // Poll until server is back
    const poll = async () => {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          await api.get('/app/features');
          window.location.reload();
          return;
        } catch { /* still down */ }
      }
      // Give up after 30s
      setRestarting(false);
      alert('Server did not come back after 30 seconds. Check the logs.');
    };
    poll();
  };

  const fetchPlugins = useCallback(() => {
    api.get('/plugins')
      .then(({ data }) => setPlugins(data))
      .catch((err) => toastApiError(err, t('admin.plugins.load_failed')))
      .finally(() => setLoading(false));
  }, [t]);

  const fetchRegistry = useCallback(() => {
    setRegistryLoading(true);
    setRegistryError(null);
    api.get('/plugins/registry')
      .then(({ data }) => setRegistry(data))
      .catch(() => setRegistryError('Failed to load plugin registry'))
      .finally(() => setRegistryLoading(false));
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);
  useEffect(() => {
    if (subTab === 'discover' && registry.length === 0 && !registryLoading) {
      fetchRegistry();
    }
  }, [subTab, registry.length, registryLoading, fetchRegistry]);

  // Kick an update-check once on first mount of the Installed tab so the
  // latestVersion badges can populate without user action. Backend has its
  // own 1h cache, so this is a no-op on subsequent mounts.
  const updateCheckedRef = useRef(false);
  useEffect(() => {
    if (subTab !== 'installed' || updateCheckedRef.current) return;
    updateCheckedRef.current = true;
    api.get('/plugins/updates').then(() => fetchPlugins()).catch(() => { /* best-effort */ });
  }, [subTab, fetchPlugins]);

  // Toggle is now friction-free — consent lives at install time (handleInstall), so flipping a
  // plugin on/off post-install is just a DB flag change.
  const handleToggle = async (plugin: PluginInfo) => {
    setToggling(plugin.id);
    try {
      await api.put(`/plugins/${plugin.id}/toggle`, { enabled: !plugin.enabled });
      setPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, enabled: !plugin.enabled } : p));
      invalidatePluginUICache();
    } catch (err) { toastApiError(err, t('admin.plugins.toggle_failed', { name: plugin.name })); }
    setToggling(null);
  };

  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [uninstallConfirm, setUninstallConfirm] = useState<string | null>(null);

  const handleUninstall = async (id: string) => {
    setUninstalling(id);
    setUninstallConfirm(null);
    try {
      await api.post(`/plugins/${id}/uninstall`);
      await fetchPlugins();
      invalidatePluginUICache();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String((err as Error).message);
      setInstallMessage({ kind: 'error', text: `Uninstall failed: ${msg}` });
      setTimeout(() => setInstallMessage(null), 6000);
    }
    setUninstalling(null);
  };

  const installedIds = new Set(plugins.map(p => p.id));

  // Registry metadata (repo URL etc.) — used only for the "View update" link, not for version detection.
  const registryRepos = new Map<string, { url: string; repository: string }>();
  for (const rp of registry) {
    registryRepos.set(rp.id, { url: rp.url, repository: rp.repository });
  }

  // Update detection is authoritative from the backend (plugin.updateAvailable / plugin.latestVersion).
  const updatesAvailable = plugins.filter((p) => p.updateAvailable).length;

  if (loading) return <Spinner />;

  const headerActions = (
    <>
      <button
        onClick={() => setShowHowTo(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
        title="Plugin development guide"
      >
        <BookOpen className="w-4 h-4" />
        <span className="hidden sm:inline">Docs</span>
      </button>
      <button
        onClick={() => setShowRestartConfirm(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
        title="Restart the server to pick up plugins dropped into packages/plugins by hand. Installs from Discover don't need this."
      >
        <RefreshCw className="w-4 h-4" />
        <span className="hidden sm:inline">Reload</span>
      </button>
    </>
  );

  return (
    <AdminTabLayout actions={headerActions}>
      {/* Sub-tabs — underline style to stay consistent with MediaConfigTab. */}
      <div className="flex gap-2 mb-6 border-b border-white/5 pb-3">
        <button
          onClick={() => setSubTab('installed')}
          className={clsx(
            'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            subTab === 'installed'
              ? 'bg-ndp-accent/10 text-ndp-accent'
              : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
          )}
        >
          <Package className="w-4 h-4" />
          Installed
          {plugins.length > 0 && (
            <span className={clsx(
              'text-xs px-1.5 py-0.5 rounded-full',
              subTab === 'installed' ? 'bg-ndp-accent/15' : 'bg-white/10'
            )}>{plugins.length}</span>
          )}
          {updatesAvailable > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-ndp-accent/80 text-white">
              {updatesAvailable} update{updatesAvailable > 1 ? 's' : ''}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('discover')}
          className={clsx(
            'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            subTab === 'discover'
              ? 'bg-ndp-accent/10 text-ndp-accent'
              : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
          )}
        >
          <Download className="w-4 h-4" />
          Discover
        </button>
      </div>

      {/* Restart confirmation modal */}
      {showRestartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRestartConfirm(false)}>
          <div className="card p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-ndp-text font-semibold mb-2">Reload plugins</h3>
            <p className="text-sm text-ndp-text-muted mb-4">
              Restarts Oscarr to discover plugins you added to <code className="text-ndp-text bg-black/30 px-1 py-0.5 rounded text-xs">packages/plugins</code> by hand.
              Plugins installed from Discover are already live — you don't need this for those.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRestartConfirm(false)} className="px-4 py-2 text-sm text-ndp-text-dim hover:text-ndp-text transition-colors">
                Cancel
              </button>
              <button onClick={handleRestart} className="px-4 py-2 bg-ndp-accent text-white rounded-lg text-sm font-medium hover:bg-ndp-accent/90 transition-colors">
                Restart now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restarting overlay */}
      {restarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-ndp-accent" />
            <p className="text-ndp-text font-medium">Restarting Oscarr...</p>
            <p className="text-sm text-ndp-text-dim">This usually takes a few seconds</p>
          </div>
        </div>
      )}

      {/* ═══ Installed tab ═══ */}
      {subTab === 'installed' && (
        <>
          {plugins.length === 0 ? (
            <div className="card p-10 text-center">
              <Plug className="w-12 h-12 text-ndp-text-dim mx-auto mb-4 opacity-50" />
              <p className="text-ndp-text font-medium">{t('admin.plugins.no_plugins')}</p>
              <p className="text-sm text-ndp-text-dim mt-1.5 max-w-md mx-auto">{t('admin.plugins.no_plugins_help')}</p>
              <button
                onClick={() => setSubTab('discover')}
                className="mt-5 px-5 py-2.5 bg-ndp-accent text-white rounded-xl text-sm font-medium hover:bg-ndp-accent/90 transition-colors inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Browse plugins
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plugins.map((plugin) => {
                const rv = registryRepos.get(plugin.id);
                const hasUpdate = !!plugin.updateAvailable;
                const hasError = !!plugin.error;
                const isConfirming = uninstallConfirm === plugin.id;
                return (
                  <div
                    key={plugin.id}
                    className={clsx(
                      'card p-5 flex flex-col gap-4 transition-colors',
                      hasError && 'border-ndp-danger/30'
                    )}
                  >
                    {/* Header: avatar + name + version */}
                    <div className="flex items-start gap-3">
                      <PluginInitial name={plugin.name} />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-ndp-text truncate">{plugin.name}</h3>
                        <p className="text-xs text-ndp-text-dim mt-0.5">
                          v{plugin.version}
                          {plugin.author && <> · {plugin.author}</>}
                        </p>
                      </div>
                    </div>

                    {/* Status badges */}
                    {(hasUpdate || plugin.compat?.status === 'untested' || plugin.compat?.status === 'incompatible' || hasError) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {hasUpdate && plugin.latestVersion && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-ndp-accent/15 text-ndp-accent font-medium">
                            v{plugin.latestVersion} available
                          </span>
                        )}
                        {plugin.compat?.status === 'untested' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium" title={plugin.compat.reason}>
                            Untested
                          </span>
                        )}
                        {plugin.compat?.status === 'incompatible' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-ndp-danger/15 text-ndp-danger font-medium" title={plugin.compat.reason}>
                            Incompatible
                          </span>
                        )}
                        {hasError && (
                          <span className="text-xs bg-ndp-danger/10 text-ndp-danger px-2 py-0.5 rounded-full">
                            {t('common.error')}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Description or error detail — fills to push footer down */}
                    <div className="flex-1 min-h-[2.5rem]">
                      {hasError ? (
                        <p className="text-xs text-ndp-danger line-clamp-3">{plugin.error}</p>
                      ) : plugin.description ? (
                        <p className="text-sm text-ndp-text-muted line-clamp-2">{plugin.description}</p>
                      ) : null}
                      {hasUpdate && rv?.url && !hasError && (
                        <a
                          href={rv.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-ndp-accent hover:underline inline-flex items-center gap-1 mt-1.5"
                        >
                          View update <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Footer: toggle + uninstall */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <button
                        onClick={() => handleToggle(plugin)}
                        disabled={toggling === plugin.id}
                        className="flex items-center gap-2.5 text-xs font-medium text-ndp-text-dim hover:text-ndp-text transition-colors"
                        title={plugin.enabled ? 'Disable' : 'Enable'}
                      >
                        <span
                          className={clsx(
                            'relative w-9 h-5 rounded-full transition-colors',
                            plugin.enabled ? 'bg-ndp-accent' : 'bg-white/10'
                          )}
                        >
                          <span
                            className={clsx(
                              'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                              plugin.enabled && 'translate-x-4'
                            )}
                          />
                        </span>
                        {plugin.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleUninstall(plugin.id)}
                            disabled={uninstalling === plugin.id}
                            className="px-2.5 py-1 bg-ndp-danger hover:bg-ndp-danger/80 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {uninstalling === plugin.id ? 'Uninstalling…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setUninstallConfirm(null)}
                            className="px-2.5 py-1 text-ndp-text-dim hover:text-ndp-text rounded-md text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setUninstallConfirm(plugin.id)}
                          className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                          title="Uninstall"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ Discover tab ═══ */}
      {subTab === 'discover' && (
        <div className="space-y-5">
          {installMessage && (
            <div
              className={clsx(
                'card px-4 py-3 text-sm flex items-center gap-3',
                installMessage.kind === 'success' && 'border-ndp-success/30 text-ndp-success',
                installMessage.kind === 'error' && 'border-ndp-error/30 text-ndp-error'
              )}
            >
              {installMessage.kind === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>{installMessage.text}</span>
            </div>
          )}

          {registryLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-ndp-accent" />
            </div>
          )}

          {registryError && (
            <div className="card p-6 text-center">
              <p className="text-ndp-error text-sm">{registryError}</p>
              <button
                onClick={fetchRegistry}
                className="mt-3 px-4 py-2 bg-ndp-accent text-white rounded-lg text-sm font-medium hover:bg-ndp-accent/90 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!registryLoading && !registryError && registry.length === 0 && (
            <div className="card p-10 text-center">
              <Download className="w-12 h-12 text-ndp-text-dim mx-auto mb-4 opacity-50" />
              <p className="text-ndp-text font-medium">No plugins available yet</p>
              <p className="text-sm text-ndp-text-dim mt-1.5">Community plugins will appear here once published.</p>
            </div>
          )}

          {!registryLoading && registry.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-ndp-text-dim">
                  {registry.length} plugin{registry.length !== 1 ? 's' : ''} available
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {registry.map((plugin) => {
                  const isInstalled = installedIds.has(plugin.id);
                  const cat = CATEGORY_CONFIG[plugin.category] || { label: plugin.category, color: 'bg-white/5 text-ndp-text-dim' };

                  return (
                    <div key={plugin.id} className="card p-5 flex flex-col gap-4">
                      {/* Header: avatar + name + version */}
                      <div className="flex items-start gap-3">
                        <PluginInitial name={plugin.name} />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-ndp-text truncate">{plugin.name}</h3>
                          <p className="text-xs text-ndp-text-dim mt-0.5">
                            v{plugin.version}
                            {plugin.author && <> · {plugin.author}</>}
                          </p>
                        </div>
                        <a
                          href={plugin.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 -m-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
                          title="View on GitHub"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>

                      {/* Category + tags */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', cat.color)}>
                          {cat.label}
                        </span>
                        {plugin.tags?.map((tag) => {
                          const tagCfg = TAG_CONFIG[tag] || { label: tag, color: 'bg-white/5 text-ndp-text-dim' };
                          return (
                            <span key={tag} className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', tagCfg.color)}>
                              {tagCfg.label}
                            </span>
                          );
                        })}
                        {isInstalled && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-ndp-success/15 text-ndp-success font-medium">
                            Installed
                          </span>
                        )}
                      </div>

                      {/* Description — fills to push footer down so actions align across the row */}
                      <div className="flex-1 min-h-[2.5rem]">
                        {plugin.description && (
                          <p className="text-sm text-ndp-text-muted line-clamp-3">{plugin.description}</p>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-ndp-text-dim">
                        {plugin.stars > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            {plugin.stars}
                          </span>
                        )}
                        {plugin.updatedAt && (
                          <span>Updated {new Date(plugin.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>

                      {/* Footer: Install + advanced terminal */}
                      <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                        {isInstalled ? (
                          <button
                            onClick={() => setSubTab('installed')}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-ndp-text-muted transition-colors"
                          >
                            <Package className="w-4 h-4" />
                            Manage
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleInstall(plugin)}
                              disabled={installing === plugin.id}
                              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-ndp-accent hover:bg-ndp-accent/90 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                            >
                              {installing === plugin.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Installing…
                                </>
                              ) : (
                                <>
                                  <Download className="w-4 h-4" />
                                  Install
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setExpandedInstall(plugin.id)}
                              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-ndp-text-dim hover:text-ndp-text transition-colors"
                              title="Manual install (advanced)"
                            >
                              <Terminal className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

        </div>
      )}
      <PluginConsentModal
        plugin={installConsent}
        open={!!installConsent}
        busy={installConsent ? installing === installConsent.id : false}
        mode="install"
        onCancel={() => setInstallConsent(null)}
        onConfirm={() => installConsent && doInstall(installConsent)}
      />

      {/* Manual install modal — replaces the inline expand so the discover grid stays intact. */}
      {expandedInstall && (() => {
        const plugin = registry.find((p) => p.id === expandedInstall);
        if (!plugin) return null;
        const installCmd = `cd packages/plugins && git clone ${plugin.url}.git ${plugin.id}`;
        const npmCmd = `cd packages/plugins/${plugin.id} && npm install --production`;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setExpandedInstall(null); }}
          >
            <div className="card w-full max-w-lg shadow-2xl shadow-black/50">
              <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ndp-text">Manual install</h2>
                  <p className="text-xs text-ndp-text-dim mt-0.5">{plugin.name} · v{plugin.version}</p>
                </div>
                <button
                  onClick={() => setExpandedInstall(null)}
                  className="p-1.5 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-6 pb-6 space-y-2">
                <p className="text-xs text-ndp-text-dim">
                  Run these commands from your Oscarr checkout, then restart the server to discover and enable the plugin.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-xs text-ndp-text-dim w-4 text-center font-mono">1</span>
                  <code className="flex-1 text-xs bg-black/30 rounded-lg px-3 py-2 text-ndp-text font-mono overflow-x-auto">
                    {installCmd}
                  </code>
                  <CopyButton text={installCmd} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ndp-text-dim w-4 text-center font-mono">2</span>
                  <code className="flex-1 text-xs bg-black/30 rounded-lg px-3 py-2 text-ndp-text font-mono overflow-x-auto">
                    {npmCmd}
                  </code>
                  <CopyButton text={npmCmd} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ndp-text-dim w-4 text-center font-mono">3</span>
                  <span className="flex-1 text-xs text-ndp-text-dim px-3 py-2">
                    Click <span className="text-ndp-text">Reload plugins</span> to pick it up without a full restart.
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Plugin development docs — triggered from the Docs button in the header row. */}
      {showHowTo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowHowTo(false); }}
        >
          <div className="card w-full max-w-xl shadow-2xl shadow-black/50 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ndp-text">Build a plugin</h2>
                <p className="text-xs text-ndp-text-dim mt-0.5">Quick reference to get a plugin skeleton running.</p>
              </div>
              <button
                onClick={() => setShowHowTo(false)}
                className="p-1.5 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 pb-6 space-y-4 text-sm text-ndp-text-muted overflow-y-auto">
              <p>
                Oscarr plugins are Node.js modules that extend the backend and/or frontend.
                Each one lives in its own folder under <code className="text-ndp-text bg-black/30 px-1.5 py-0.5 rounded text-xs">packages/plugins/</code>.
              </p>
              <div>
                <p className="text-ndp-text font-medium mb-2 text-xs uppercase tracking-wider">Minimal structure</p>
                <pre className="text-xs bg-black/30 rounded-lg px-4 py-3 text-ndp-text-dim overflow-x-auto">
{`my-plugin/
├── manifest.json    # Plugin metadata
├── package.json     # Dependencies
├── index.js         # Entry point (register function)
└── src/             # Your code`}
                </pre>
              </div>
              <div>
                <p className="text-ndp-text font-medium mb-2 text-xs uppercase tracking-wider">manifest.json</p>
                <pre className="text-xs bg-black/30 rounded-lg px-4 py-3 text-ndp-text-dim overflow-x-auto">
{`{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": "v1",
  "entry": "index.js",
  "description": "What it does",
  "author": "Your name"
}`}
                </pre>
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <a
                  href="https://github.com/arediss/Oscarr/blob/main/docs/plugins.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-ndp-text transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Full documentation
                </a>
                <a
                  href="https://github.com/arediss/Oscarr-Plugin-Registry"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-ndp-text transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Submit your plugin
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminTabLayout>
  );
}
