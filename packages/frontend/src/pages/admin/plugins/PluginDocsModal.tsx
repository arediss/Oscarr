import { BookOpen, ExternalLink, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useModal } from '@/hooks/useModal';

interface PluginDocsModalProps {
  onClose: () => void;
}

/** Quick-reference modal for building a plugin — minimal structure + manifest example + links
 *  out to the full docs and the registry. Triggered from the "Docs" button in the tab header. */
export function PluginDocsModal({ onClose }: PluginDocsModalProps) {
  const { t } = useTranslation();
  const { dialogRef, titleId } = useModal({ open: true, onClose });
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
        className="card w-full max-w-xl shadow-2xl shadow-black/50 max-h-[85vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ndp-text">Build a plugin</h2>
            <p className="text-xs text-ndp-text-dim mt-0.5">Quick reference to get a plugin skeleton running.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
            aria-label={t('common.close')}
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
  );
}
