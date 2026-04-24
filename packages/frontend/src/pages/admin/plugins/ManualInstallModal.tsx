import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from './PluginCardChrome';
import { useModal } from '@/hooks/useModal';
import { usePluginsDir } from '@/hooks/usePluginsDir';
import type { RegistryPlugin } from './constants';

interface ManualInstallModalProps {
  plugin: RegistryPlugin;
  onClose: () => void;
}

/** Shell commands an admin would run to clone + install a plugin by hand — escape hatch for
 *  when the Install button can't reach the GitHub tarball (air-gapped env, rate-limit, etc.). */
export function ManualInstallModal({ plugin, onClose }: ManualInstallModalProps) {
  const { t } = useTranslation();
  const { dialogRef, titleId } = useModal({ open: true, onClose });
  const pluginsDir = usePluginsDir();
  const installCmd = `cd ${pluginsDir} && git clone ${plugin.url}.git ${plugin.id}`;
  const npmCmd = `cd ${pluginsDir}/${plugin.id} && npm install --production`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-lg shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ndp-text">Manual install</h2>
            <p className="text-xs text-ndp-text-dim mt-0.5">{plugin.name} · v{plugin.version}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
            aria-label={t('common.close')}
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
}
