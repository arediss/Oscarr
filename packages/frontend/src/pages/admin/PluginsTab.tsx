import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plug, ExternalLink, Star, Loader2, Download, Package, Terminal, ChevronDown, ChevronUp, BookOpen, Copy, Check, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { invalidatePluginUICache } from '@/plugins/usePlugins';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import type { PluginInfo } from '@/plugins/types';

function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

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
    api.get('/plugins').then(({ data }) => setPlugins(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

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

  const handleToggle = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      await api.put(`/plugins/${id}/toggle`, { enabled });
      setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
      invalidatePluginUICache(); // Refresh plugin UI contributions (sidebar, hooks)
    } catch { /* ignore */ }
    setToggling(null);
  };

  const installedIds = new Set(plugins.map(p => p.id));

  // Build a map of registry versions for update detection
  const registryVersions = new Map<string, { version: string; url: string; repository: string }>();
  for (const rp of registry) {
    registryVersions.set(rp.id, { version: rp.version, url: rp.url, repository: rp.repository });
  }

  // Count available updates
  const updatesAvailable = plugins.filter(p => {
    const rv = registryVersions.get(p.id);
    return rv && isNewerVersion(rv.version, p.version);
  }).length;

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout title={t('admin.tab.plugins')} count={plugins.length}>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubTab('installed')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            subTab === 'installed' ? 'bg-ndp-accent text-white' : 'text-ndp-text-muted hover:text-ndp-text'
          )}
        >
          <Package className="w-4 h-4" />
          Installed
          {plugins.length > 0 && (
            <span className={clsx(
              'text-xs px-1.5 py-0.5 rounded-full',
              subTab === 'installed' ? 'bg-white/20' : 'bg-white/10'
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
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            subTab === 'discover' ? 'bg-ndp-accent text-white' : 'text-ndp-text-muted hover:text-ndp-text'
          )}
        >
          <Download className="w-4 h-4" />
          Discover
        </button>
        <button
          onClick={() => setShowRestartConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-all ml-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Reload plugins
        </button>
      </div>

      {/* Restart confirmation modal */}
      {showRestartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRestartConfirm(false)}>
          <div className="card p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-ndp-text font-semibold mb-2">Reload plugins</h3>
            <p className="text-sm text-ndp-text-muted mb-4">
              This will restart the Oscarr server to discover and load new plugins. The app will be unavailable for a few seconds.
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
        <div className="space-y-3">
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
            plugins.map((plugin) => {
              const rv = registryVersions.get(plugin.id);
              const hasUpdate = rv && isNewerVersion(rv.version, plugin.version);
              return (
                <div key={plugin.id} className="card p-5 flex items-center gap-4">
                  <PluginInitial name={plugin.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-ndp-text">{plugin.name}</h3>
                      <span className="text-xs text-ndp-text-dim">v{plugin.version}</span>
                      {hasUpdate && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-ndp-accent/15 text-ndp-accent font-medium">
                          v{rv.version} available
                        </span>
                      )}
                      {plugin.error && (
                        <span className="text-xs bg-ndp-danger/10 text-ndp-danger px-2 py-0.5 rounded-full">{t('common.error')}</span>
                      )}
                    </div>
                    {plugin.description && (
                      <p className="text-sm text-ndp-text-muted mt-0.5 line-clamp-1">{plugin.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-0.5">
                      {plugin.author && (
                        <span className="text-xs text-ndp-text-dim">{t('common.by')} {plugin.author}</span>
                      )}
                      {hasUpdate && rv.url && (
                        <a
                          href={rv.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-ndp-accent hover:underline inline-flex items-center gap-1"
                        >
                          View update <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {plugin.error && (
                      <p className="text-xs text-ndp-danger mt-1 line-clamp-2">{plugin.error}</p>
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
              );
            })
          )}
        </div>
      )}

      {/* ═══ Discover tab ═══ */}
      {subTab === 'discover' && (
        <div className="space-y-5">
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

              <div className="space-y-3">
                {registry.map((plugin) => {
                  const isInstalled = installedIds.has(plugin.id);
                  const cat = CATEGORY_CONFIG[plugin.category] || { label: plugin.category, color: 'bg-white/5 text-ndp-text-dim' };
                  const isExpanded = expandedInstall === plugin.id;
                  const installCmd = `cd packages/plugins && git clone ${plugin.url}.git ${plugin.id}`;
                  const npmCmd = `cd packages/plugins/${plugin.id} && npm install --production`;

                  return (
                    <div key={plugin.id} className="card overflow-hidden">
                      <div className="p-5 flex items-start gap-4">
                        <PluginInitial name={plugin.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-ndp-text">{plugin.name}</h3>
                            <span className="text-xs text-ndp-text-dim">v{plugin.version}</span>
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
                          {plugin.description && (
                            <p className="text-sm text-ndp-text-muted mt-1.5">{plugin.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-ndp-text-dim">
                            {plugin.author && <span>{t('common.by')} {plugin.author}</span>}
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
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isInstalled && (
                            <button
                              onClick={() => setExpandedInstall(isExpanded ? null : plugin.id)}
                              className="flex items-center gap-2 px-4 py-2 bg-ndp-accent hover:bg-ndp-accent/90 rounded-lg text-sm text-white font-medium transition-colors"
                            >
                              <Terminal className="w-4 h-4" />
                              Install
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <a
                            href={plugin.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-ndp-text-dim hover:text-ndp-text transition-colors"
                            title="View on GitHub"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>

                      {/* Install instructions (expandable) */}
                      {isExpanded && (
                        <div className="border-t border-white/5 bg-white/[0.02] px-5 py-4 space-y-3">
                          <p className="text-xs text-ndp-text-dim font-medium uppercase tracking-wider">Installation</p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
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
                                Restart Oscarr and enable the plugin in the Installed tab
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* How to section */}
          <div className="card overflow-hidden">
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-ndp-accent" />
                <span className="text-sm font-medium text-ndp-text">How to develop a plugin</span>
              </div>
              {showHowTo ? <ChevronUp className="w-4 h-4 text-ndp-text-dim" /> : <ChevronDown className="w-4 h-4 text-ndp-text-dim" />}
            </button>
            {showHowTo && (
              <div className="border-t border-white/5 px-5 py-4 space-y-4 text-sm text-ndp-text-muted">
                <p>
                  Oscarr plugins are Node.js modules that extend the backend and/or frontend.
                  Each plugin lives in its own folder under <code className="text-ndp-text bg-black/30 px-1.5 py-0.5 rounded text-xs">packages/plugins/</code>.
                </p>

                <div>
                  <p className="text-ndp-text font-medium mb-2">Minimal structure</p>
                  <pre className="text-xs bg-black/30 rounded-lg px-4 py-3 text-ndp-text-dim overflow-x-auto">
{`my-plugin/
├── manifest.json    # Plugin metadata
├── package.json     # Dependencies
├── index.js         # Entry point (register function)
└── src/             # Your code`}
                  </pre>
                </div>

                <div>
                  <p className="text-ndp-text font-medium mb-2">manifest.json</p>
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

                <div className="flex items-center gap-3 pt-1">
                  <a
                    href="https://github.com/arediss/Oscarr/blob/main/docs/plugins.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-ndp-text transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    Full documentation
                  </a>
                  <a
                    href="https://github.com/arediss/Oscarr-Plugin-Registry"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-ndp-text transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Submit your plugin
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminTabLayout>
  );
}
