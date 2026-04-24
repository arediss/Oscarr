import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Plus, Bug, Zap, Wrench } from 'lucide-react';
import api from '@/lib/api';
import { useModal } from '@/hooks/useModal';

interface Entry {
  type: string;
  title: string;
  description: string | null;
}

interface Release {
  version: string;
  type: string;
  title: string;
  date: string;
  entries: Entry[];
}

interface ChangelogData {
  current: string;
  releases: Release[];
}

const TYPE_KEYS: Record<string, string> = {
  major: 'changelog.type_major',
  minor: 'changelog.type_minor',
  patch: 'changelog.type_patch',
};

const ENTRY_ICONS: Record<string, { icon: typeof Plus; color: string; bg: string }> = {
  feat: { icon: Plus, color: 'text-ndp-success', bg: 'bg-ndp-success/10' },
  fix: { icon: Bug, color: 'text-ndp-warning', bg: 'bg-ndp-warning/10' },
  perf: { icon: Zap, color: 'text-ndp-accent', bg: 'bg-ndp-accent/10' },
  other: { icon: Wrench, color: 'text-ndp-text-dim', bg: 'bg-white/5' },
};

// ─── Modal ──────────────────────────────────────────────────────────

export default function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<ChangelogData | null>(null);
  const [loading, setLoading] = useState(false);
  const { dialogRef, titleId } = useModal({ open, onClose });

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    api.get('/app/changelog')
      .then(({ data: d }) => setData(d))
      .catch((err) => console.warn("[ChangelogModal] failed to fetch changelog", err))
      .finally(() => setLoading(false));
  }, [open, data]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-ndp-bg rounded-2xl w-full max-w-3xl max-h-[85vh] mx-4 shadow-2xl shadow-black/60 overflow-hidden flex flex-col border border-white/5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 flex items-center justify-between">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-ndp-text">{t('changelog.title')}</h2>
            <p className="text-[11px] text-ndp-text-dim mt-0.5">{t('changelog.subtitle')}</p>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="p-2 rounded-xl hover:bg-white/5 transition-colors">
            <X className="w-5 h-5 text-ndp-text-dim" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-ndp-accent/30 border-t-ndp-accent rounded-full animate-spin" />
            </div>
          ) : !data || data.releases.length === 0 ? (
            <p className="text-center text-ndp-text-dim py-16">{t('changelog.empty')}</p>
          ) : (
            <div className="relative pt-2">
              {data.releases.map((release, i) => {
                const isCurrent = release.version === data.current || release.version === `v${data.current}`;
                const isLast = i === data.releases.length - 1;
                const date = new Date(release.date);
                const day = date.getDate();
                const month = date.toLocaleDateString(undefined, { month: 'short' });
                const year = date.getFullYear();
                const typeText = t(TYPE_KEYS[release.type] || TYPE_KEYS.patch);

                return (
                  <div key={release.version} className="flex gap-5">
                    {/* Left: version node + vertical line */}
                    <div className="flex flex-col items-center w-16 flex-shrink-0">
                      <div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-1 ${
                        isCurrent ? 'bg-ndp-accent/10 ring-1 ring-ndp-accent/30' : 'bg-white/[0.03] ring-1 ring-white/5'
                      }`}>
                        <span className={`text-base font-bold leading-none ${isCurrent ? 'text-ndp-accent' : 'text-ndp-text'}`}>
                          {release.version.replace(/^v/, '')}
                        </span>
                        <span className={`text-[7px] uppercase tracking-wider font-semibold leading-none ${
                          release.type === 'major' ? 'text-purple-400' :
                          release.type === 'minor' ? 'text-ndp-accent/70' :
                          'text-ndp-text-dim/60'
                        }`}>
                          {typeText}
                        </span>
                      </div>
                      <span className="text-[9px] text-ndp-text-dim mt-1.5">{day} {month}</span>
                      <span className="text-[9px] text-ndp-text-dim">{year}</span>
                      {!isLast && <div className="w-px flex-1 bg-white/5 mt-2" />}
                    </div>

                    {/* Right: content */}
                    <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-8'}`}>
                      {/* Title row */}
                      <h3 className={`text-sm font-bold mb-3 ${isCurrent ? 'text-ndp-accent' : 'text-ndp-text'}`}>
                        {release.title}
                      </h3>

                      {/* Entries */}
                      <div className="space-y-2">
                        {release.entries.map((entry, j) => {
                          const iconDef = ENTRY_ICONS[entry.type] || ENTRY_ICONS.other;
                          const EntryIcon = iconDef.icon;
                          return (
                            <div key={`${entry.type}-${entry.title}`} className="flex items-start gap-2.5">
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${iconDef.bg}`}>
                                <EntryIcon className={`w-3 h-3 ${iconDef.color}`} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-ndp-text leading-tight">{entry.title}</p>
                                {entry.description && (
                                  <p className="text-xs text-ndp-text-dim leading-relaxed mt-0.5">{entry.description}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
