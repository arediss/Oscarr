import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Download, ExternalLink, Loader2, Plug, Trash2 } from 'lucide-react';
import type { PluginInfo } from '@/plugins/types';
import { PluginInitial } from './PluginCardChrome';
import { usePluginsDir } from '@/hooks/usePluginsDir';
import type { RegistryPlugin } from './constants';

interface InstalledListProps {
  plugins: PluginInfo[];
  registry: RegistryPlugin[];
  toggling: string | null;
  uninstalling: string | null;
  onToggle: (plugin: PluginInfo) => void;
  onUninstall: (id: string) => void;
  onBrowse: () => void;
}

/** Grid of installed plugins — version / author / status badges / update link / enable toggle /
 *  uninstall-with-inline-confirm. Renders the empty state with a "Browse plugins" CTA when the
 *  list is empty. */
export function InstalledList({
  plugins, registry, toggling, uninstalling, onToggle, onUninstall, onBrowse,
}: InstalledListProps) {
  const { t } = useTranslation();
  const [uninstallConfirm, setUninstallConfirm] = useState<string | null>(null);
  const pluginsDir = usePluginsDir();

  // Registry lookup for the "View update" link — we don't care about the version here (the
  // backend decides updateAvailable), only the GitHub URL where the changelog lives.
  const registryRepos = new Map(registry.map((rp) => [rp.id, { url: rp.url, repository: rp.repository }]));

  if (plugins.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Plug className="w-12 h-12 text-ndp-text-dim mx-auto mb-4 opacity-50" />
        <p className="text-ndp-text font-medium">{t('admin.plugins.no_plugins')}</p>
        <p className="text-sm text-ndp-text-dim mt-1.5 max-w-md mx-auto">
          {t('admin.plugins.no_plugins_help')}{' '}
          <code className="text-ndp-text bg-black/30 px-1.5 py-0.5 rounded text-xs">{pluginsDir}</code>
        </p>
        <button
          onClick={onBrowse}
          className="mt-5 px-5 py-2.5 bg-ndp-accent text-white rounded-xl text-sm font-medium hover:bg-ndp-accent/90 transition-colors inline-flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Browse plugins
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {plugins.map((plugin) => {
        const rv = registryRepos.get(plugin.id);
        const hasUpdate = !!plugin.updateAvailable;
        const hasError = !!plugin.error;
        const isConfirming = uninstallConfirm === plugin.id;
        return (
          <div key={plugin.id} className={clsx('card p-5 flex flex-col gap-4 transition-colors', hasError && 'border-ndp-danger/30')}>
            <div className="flex items-start gap-3">
              <PluginInitial name={plugin.name} />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-ndp-text truncate">{plugin.name}</h3>
                <p className="text-xs text-ndp-text-dim mt-0.5 truncate">
                  v{plugin.version}
                  {plugin.author && <> · {plugin.author}</>}
                </p>
              </div>
            </div>

            {(hasUpdate || plugin.compat?.status === 'untested' || plugin.compat?.status === 'incompatible' || hasError) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {hasUpdate && plugin.latestVersion && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-ndp-accent/10 text-ndp-accent font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-ndp-accent" />
                    v{plugin.latestVersion} available
                  </span>
                )}
                {plugin.compat?.status === 'untested' && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-ndp-text-muted ring-1 ring-white/5" title={plugin.compat.reason}>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Untested
                  </span>
                )}
                {plugin.compat?.status === 'incompatible' && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-ndp-danger/10 text-ndp-danger font-medium" title={plugin.compat.reason}>
                    <span className="w-1.5 h-1.5 rounded-full bg-ndp-danger" />
                    Incompatible
                  </span>
                )}
                {hasError && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-ndp-danger/10 text-ndp-danger font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-ndp-danger" />
                    {t('common.error')}
                  </span>
                )}
              </div>
            )}

            <div className="flex-1 min-h-[2.5rem]">
              {hasError ? (
                <p className="text-xs text-ndp-danger line-clamp-3">{plugin.error}</p>
              ) : plugin.description ? (
                <p className="text-sm text-ndp-text-muted line-clamp-2">{plugin.description}</p>
              ) : null}
              {hasUpdate && rv?.url && !hasError && (
                <a href={rv.url} target="_blank" rel="noopener noreferrer" className="text-xs text-ndp-accent hover:underline inline-flex items-center gap-1 mt-1.5">
                  View update <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <button
                onClick={() => onToggle(plugin)}
                disabled={toggling === plugin.id}
                className="flex items-center gap-2.5 text-xs font-medium text-ndp-text-dim hover:text-ndp-text transition-colors disabled:opacity-70"
                title={plugin.enabled ? 'Disable' : 'Enable'}
              >
                {toggling === plugin.id ? (
                  <span className="inline-flex h-5 w-9 items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-ndp-accent" />
                  </span>
                ) : (
                  <span className={clsx('relative w-9 h-5 rounded-full transition-colors', plugin.enabled ? 'bg-ndp-accent' : 'bg-white/10')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform', plugin.enabled && 'translate-x-4')} />
                  </span>
                )}
                {toggling === plugin.id
                  ? (plugin.enabled ? 'Disabling…' : 'Enabling…')
                  : (plugin.enabled ? 'Enabled' : 'Disabled')}
              </button>
              {isConfirming ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setUninstallConfirm(null); onUninstall(plugin.id); }}
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
  );
}
