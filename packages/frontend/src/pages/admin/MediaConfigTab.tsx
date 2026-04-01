import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { QualityTab } from './QualityTab';
import { PathsTab } from './PathsTab';
import { KeywordsTab } from './KeywordsTab';

const SUB_TABS = [
  { id: 'quality', labelKey: 'admin.tab.quality' },
  { id: 'paths', labelKey: 'admin.tab.paths' },
  { id: 'keywords', labelKey: 'admin.tab.keywords' },
] as const;

type SubTab = typeof SUB_TABS[number]['id'];

export function MediaConfigTab() {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('quality');

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/5 pb-3">
        {SUB_TABS.map(({ id, labelKey }) => (
          <button
            key={id}
            onClick={() => setActiveSubTab(id)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeSubTab === id
                ? 'bg-ndp-accent/10 text-ndp-accent'
                : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="animate-fade-in" key={activeSubTab}>
        {activeSubTab === 'quality' && <QualityTab />}
        {activeSubTab === 'paths' && <PathsTab />}
        {activeSubTab === 'keywords' && <KeywordsTab />}
      </div>
    </div>
  );
}
