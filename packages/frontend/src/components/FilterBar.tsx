import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, X, Star } from 'lucide-react';
import { clsx } from 'clsx';

/** Detects when the sticky bar is pinned (scrolled past its natural position) */
function useIsStuck() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { sentinelRef, stuck };
}

export interface FilterValues {
  sortBy: string;
  voteAverageGte: number;
  releaseYear: number | null;
  hideRequested: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

const RATING_OPTIONS = [0, 5, 6, 7, 8];

interface FilterBarProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  sortOptions: { value: string; labelKey: string }[];
  title: string;
  subtitle?: string;
  backButton?: React.ReactNode;
}

export const DEFAULT_FILTERS: FilterValues = {
  sortBy: 'popularity.desc',
  voteAverageGte: 0,
  releaseYear: null,
  hideRequested: false,
};

export default function FilterBar({ filters, onChange, sortOptions, title, subtitle, backButton }: Readonly<FilterBarProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { sentinelRef, stuck } = useIsStuck();

  const activeCount = [
    filters.sortBy !== 'popularity.desc',
    filters.voteAverageGte > 0,
    filters.releaseYear != null,
    filters.hideRequested,
  ].filter(Boolean).length;

  const activeSortLabel = sortOptions.find(o => o.value === filters.sortBy)?.labelKey;

  const reset = () => onChange({ ...DEFAULT_FILTERS });

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Build active chips
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.sortBy !== 'popularity.desc' && activeSortLabel) {
    chips.push({
      key: 'sort',
      label: t(activeSortLabel),
      onRemove: () => onChange({ ...filters, sortBy: 'popularity.desc' }),
    });
  }
  if (filters.releaseYear != null) {
    chips.push({
      key: 'year',
      label: String(filters.releaseYear),
      onRemove: () => onChange({ ...filters, releaseYear: null }),
    });
  }
  if (filters.voteAverageGte > 0) {
    chips.push({
      key: 'rating',
      label: `${filters.voteAverageGte}+`,
      onRemove: () => onChange({ ...filters, voteAverageGte: 0 }),
    });
  }
  if (filters.hideRequested) {
    chips.push({
      key: 'hide',
      label: t('filter.hide_requested_short'),
      onRemove: () => onChange({ ...filters, hideRequested: false }),
    });
  }

  return (
    <>
    <div ref={sentinelRef} className="h-0" />
    <div className="sticky top-16 z-20 mb-6" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)' }}>
      <div className={clsx(
        'px-4 sm:px-8 transition-all duration-200',
        'border-b',
        stuck ? 'bg-ndp-bg/90 backdrop-blur-xl border-white/5 py-2.5' : 'border-transparent py-4',
      )}>
      <div className="max-w-[1800px] mx-auto flex items-center gap-4">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {backButton}
          <div className="min-w-0">
            {subtitle && !stuck && (
              <p className="text-xs text-ndp-accent uppercase tracking-wider font-semibold">{subtitle}</p>
            )}
            <h1 className={clsx(
              'font-bold text-ndp-text truncate transition-all duration-200',
              stuck ? 'text-lg' : 'text-2xl',
            )}>{title}</h1>
          </div>
        </div>

        {/* Center: active chips */}
        {chips.length > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            {chips.map(chip => (
              <span
                key={chip.key}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-ndp-text-muted"
              >
                {chip.key === 'rating' && <Star className="w-2.5 h-2.5 fill-ndp-text-muted" />}
                {chip.label}
                <button onClick={chip.onRemove} aria-label={t('common.clear')} className="hover:text-white transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Right: filter button + popover */}
        <div className="relative flex-shrink-0" ref={popoverRef}>
          <button
            onClick={() => setOpen(!open)}
            className={clsx(
              'flex items-center gap-2 rounded-xl font-medium transition-all',
              stuck ? 'px-3.5 py-2 text-xs' : 'px-4 py-2 text-sm',
              open || activeCount > 0
                ? 'bg-ndp-accent/10 text-ndp-accent'
                : 'bg-white/5 text-ndp-text-muted hover:bg-white/10',
            )}
          >
            <SlidersHorizontal className={stuck ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            <span className="hidden sm:inline">{t('filter.filters')}</span>
            {activeCount > 0 && (
              <span className="text-ndp-accent/70">· {activeCount}</span>
            )}
          </button>

          {/* Popover */}
          {open && (
            <div className="absolute right-0 top-full mt-2 w-72 p-4 rounded-2xl bg-ndp-surface border border-white/10 shadow-2xl shadow-black/50 space-y-4 animate-fade-in z-50">
              {/* Sort */}
              {sortOptions.length > 0 && (
                <Section label={t('filter.sort_by')}>
                  {sortOptions.map(opt => (
                    <Chip
                      key={opt.value}
                      active={filters.sortBy === opt.value}
                      onClick={() => onChange({ ...filters, sortBy: opt.value })}
                    >
                      {t(opt.labelKey)}
                    </Chip>
                  ))}
                </Section>
              )}

              {/* Year */}
              <div>
                <label className="text-[10px] font-semibold text-ndp-text-dim uppercase tracking-wider mb-1.5 block">
                  {t('filter.release_year')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('filter.all_years')}
                  value={filters.releaseYear ?? ''}
                  onChange={e => {
                    const v = e.target.value.replaceAll(/\D/g, '').slice(0, 4);
                    const year = v.length === 4 ? Number.parseInt(v) : null;
                    onChange({ ...filters, releaseYear: year && year >= 1900 && year <= CURRENT_YEAR + 2 ? year : null });
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg text-xs text-ndp-text px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 placeholder:text-ndp-text-dim"
                />
              </div>

              {/* Rating */}
              <Section label={t('filter.min_rating')}>
                {RATING_OPTIONS.map(rating => (
                  <Chip
                    key={rating}
                    active={filters.voteAverageGte === rating}
                    onClick={() => onChange({ ...filters, voteAverageGte: rating })}
                  >
                    {rating === 0 ? t('filter.all') : `${rating}+`}
                  </Chip>
                ))}
              </Section>

              {/* Hide requested */}
              <button
                onClick={() => onChange({ ...filters, hideRequested: !filters.hideRequested })}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                  filters.hideRequested
                    ? 'bg-ndp-accent text-white'
                    : 'bg-white/5 text-ndp-text-muted hover:bg-white/10',
                )}
              >
                <div className={clsx(
                  'w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all',
                  filters.hideRequested ? 'border-white bg-white/20' : 'border-white/30',
                )}>
                  {filters.hideRequested && <div className="w-1.5 h-1.5 rounded-sm bg-white" />}
                </div>
                {t('filter.hide_requested')}
              </button>

              {/* Reset */}
              {activeCount > 0 && (
                <button
                  onClick={() => { reset(); setOpen(false); }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-ndp-text-dim hover:text-ndp-text-muted transition-colors pt-2 border-t border-white/5"
                >
                  <X className="w-3 h-3" />
                  {t('filter.reset')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
    </>
  );
}

function Section({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-ndp-text-dim uppercase tracking-wider mb-1.5 block">{label}</label>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: Readonly<{ active: boolean; onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
        active ? 'bg-ndp-accent text-white' : 'bg-white/5 text-ndp-text-muted hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}
