import { clsx } from 'clsx';
import { AlertTriangle, Check, Download, ExternalLink, Loader2, Package, Star, Terminal } from 'lucide-react';
import { PluginInitial } from './PluginCardChrome';
import { CATEGORY_CONFIG, TAG_CONFIG, type RegistryPlugin } from './constants';
import type { InstallMessage } from './usePluginsTab';

interface DiscoverListProps {
  registry: RegistryPlugin[];
  registryLoading: boolean;
  registryError: string | null;
  installedIds: Set<string>;
  installing: string | null;
  installMessage: InstallMessage | null;
  onRetry: () => void;
  onInstall: (entry: RegistryPlugin) => void;
  onExpandManual: (id: string) => void;
  onManage: () => void;
}

/** Discover grid — browse the GitHub plugin registry, install with a click (consent happens in
 *  the parent through PluginConsentModal), or expand the Terminal icon for manual git-clone
 *  instructions (admin escape hatch when the automatic install can't reach the registry). */
export function DiscoverList({
  registry, registryLoading, registryError, installedIds,
  installing, installMessage, onRetry, onInstall, onExpandManual, onManage,
}: DiscoverListProps) {
  return (
    <div className="space-y-5">
      {installMessage && (
        <div
          className={clsx(
            'card px-4 py-3 text-sm flex items-center gap-3',
            installMessage.kind === 'success' && 'border-ndp-success/30 text-ndp-success',
            installMessage.kind === 'error' && 'border-ndp-error/30 text-ndp-error',
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
          <button onClick={onRetry} className="mt-3 px-4 py-2 bg-ndp-accent text-white rounded-lg text-sm font-medium hover:bg-ndp-accent/90 transition-colors">
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

                  <div className="flex-1 min-h-[2.5rem]">
                    {plugin.description && (
                      <p className="text-sm text-ndp-text-muted line-clamp-3">{plugin.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-ndp-text-dim">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      {plugin.stars}
                    </span>
                    {plugin.downloads !== undefined && (
                      <span className="flex items-center gap-1" title="Total installs (GitHub release downloads)">
                        <Download className="w-3 h-3" />
                        {plugin.downloads}
                      </span>
                    )}
                    {plugin.updatedAt && (
                      <span>Updated {new Date(plugin.updatedAt).toLocaleDateString()}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                    {isInstalled ? (
                      <button
                        onClick={onManage}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-ndp-text-muted transition-colors"
                      >
                        <Package className="w-4 h-4" />
                        Manage
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onInstall(plugin)}
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
                          onClick={() => onExpandManual(plugin.id)}
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
  );
}
