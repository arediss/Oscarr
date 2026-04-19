import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { BookOpen, Download, Loader2, Package, RefreshCw } from 'lucide-react';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { PluginConsentModal } from './PluginConsentModal';
import { usePluginsTab } from './plugins/usePluginsTab';
import { InstalledList } from './plugins/InstalledList';
import { DiscoverList } from './plugins/DiscoverList';
import { ManualInstallModal } from './plugins/ManualInstallModal';
import { PluginDocsModal } from './plugins/PluginDocsModal';
import type { RegistryPlugin, SubTab } from './plugins/constants';

/**
 * Admin → Plugins. Two sub-tabs: Installed (local runtime list) and Discover (remote registry).
 * Install is a two-step flow: click → consent modal (shows the plugin's declared services and
 * capabilities) → confirm → actual tarball download.
 *
 * Data + mutations all live in `usePluginsTab`; lists and modals are their own components.
 */
export function PluginsTab() {
  const {
    plugins, registry, loading, registryLoading, registryError,
    toggling, installing, uninstalling, restarting, installMessage,
    fetchRegistry, checkForUpdates, toggle, install, uninstall, restart,
    setInstallMessage,
  } = usePluginsTab();

  const [subTab, setSubTab] = useState<SubTab>('installed');
  const [showHowTo, setShowHowTo] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [expandedInstall, setExpandedInstall] = useState<string | null>(null);

  /** Consent-first install: click Install → modal shows services + capabilities →
   *  admin confirms → Oscarr actually downloads the tarball (disabled by default). */
  const [installConsent, setInstallConsent] = useState<RegistryPlugin | null>(null);

  useEffect(() => {
    if (subTab === 'discover' && registry.length === 0 && !registryLoading) {
      fetchRegistry();
    }
  }, [subTab, registry.length, registryLoading, fetchRegistry]);

  useEffect(() => { checkForUpdates(subTab); }, [subTab, checkForUpdates]);

  const handleInstall = (entry: RegistryPlugin) => {
    setInstallMessage(null);
    setInstallConsent(entry);
  };

  const doInstall = async (entry: RegistryPlugin) => {
    // On failure, keep the consent modal open so the admin sees the error banner still inside
    // the Discover context. Only a successful install closes the modal and flips the sub-tab.
    const ok = await install(entry);
    if (ok) {
      setInstallConsent(null);
      setSubTab('installed');
    }
  };

  const handleRestart = async () => {
    setShowRestartConfirm(false);
    await restart();
  };

  if (loading) return <Spinner />;

  const updatesAvailable = plugins.filter((p) => p.updateAvailable).length;
  const installedIds = new Set(plugins.map((p) => p.id));

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

  const expandedPlugin = expandedInstall ? registry.find((p) => p.id === expandedInstall) ?? null : null;

  return (
    <AdminTabLayout actions={headerActions}>
      <div className="flex gap-2 mb-6 border-b border-white/5 pb-3">
        <button
          onClick={() => setSubTab('installed')}
          className={clsx(
            'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            subTab === 'installed' ? 'bg-ndp-accent/10 text-ndp-accent' : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5',
          )}
        >
          <Package className="w-4 h-4" />
          Installed
          {plugins.length > 0 && (
            <span className={clsx('text-xs px-1.5 py-0.5 rounded-full', subTab === 'installed' ? 'bg-ndp-accent/15' : 'bg-white/10')}>
              {plugins.length}
            </span>
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
            subTab === 'discover' ? 'bg-ndp-accent/10 text-ndp-accent' : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5',
          )}
        >
          <Download className="w-4 h-4" />
          Discover
        </button>
      </div>

      {showRestartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRestartConfirm(false)}>
          <div className="card p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
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

      {restarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-ndp-accent" />
            <p className="text-ndp-text font-medium">Restarting Oscarr...</p>
            <p className="text-sm text-ndp-text-dim">This usually takes a few seconds</p>
          </div>
        </div>
      )}

      {subTab === 'installed' && (
        <InstalledList
          plugins={plugins}
          registry={registry}
          toggling={toggling}
          uninstalling={uninstalling}
          onToggle={toggle}
          onUninstall={uninstall}
          onBrowse={() => setSubTab('discover')}
        />
      )}

      {subTab === 'discover' && (
        <DiscoverList
          registry={registry}
          registryLoading={registryLoading}
          registryError={registryError}
          installedIds={installedIds}
          installing={installing}
          installMessage={installMessage}
          onRetry={fetchRegistry}
          onInstall={handleInstall}
          onExpandManual={setExpandedInstall}
          onManage={() => setSubTab('installed')}
        />
      )}

      <PluginConsentModal
        plugin={installConsent}
        open={!!installConsent}
        busy={installConsent ? installing === installConsent.id : false}
        mode="install"
        onCancel={() => setInstallConsent(null)}
        onConfirm={() => installConsent && doInstall(installConsent)}
      />

      {expandedPlugin && (
        <ManualInstallModal plugin={expandedPlugin} onClose={() => setExpandedInstall(null)} />
      )}

      {showHowTo && <PluginDocsModal onClose={() => setShowHowTo(false)} />}
    </AdminTabLayout>
  );
}
