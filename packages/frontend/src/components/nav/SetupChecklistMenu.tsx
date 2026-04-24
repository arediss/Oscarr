import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ListChecks, CheckCircle2, Circle, ChevronRight, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface ChecklistItem {
  id: string;
  required: boolean;
  done: boolean;
  href: string;
}

interface ChecklistResponse {
  items: ChecklistItem[];
  dismissed: boolean;
}

interface Props {
  dropdownDirection?: 'below' | 'above';
}

export default function SetupChecklistMenu({ dropdownDirection = 'below' }: Props = {}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('admin.*');

  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [hiding, setHiding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get<ChecklistResponse>('/admin/setup-checklist');
      setData(data);
    } catch { /* non-critical UI */ }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isAdmin, fetchData]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isAdmin || !data || data.dismissed || hiding) return null;

  const required = data.items.filter((i) => i.required);
  const optional = data.items.filter((i) => !i.required);
  const requiredRemaining = required.filter((i) => !i.done).length;
  const requiredDone = required.length - requiredRemaining;
  const totalDone = data.items.filter((i) => i.done).length;
  const allRequiredDone = requiredRemaining === 0;

  if (allRequiredDone && optional.every((i) => i.done)) return null;

  const dismiss = async () => {
    setHiding(true);
    setOpen(false);
    try { await api.post('/admin/setup-checklist/dismiss'); }
    catch { /* optimistic */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          // Re-fetch on every open so an admin who just completed an item (added a service,
          // filled the default folders, …) sees the checklist reflect reality without having
          // to reload the page. Cheap call — a single SQL COUNT round-trip.
          if (!open) fetchData();
          setOpen(!open);
        }}
        className="relative p-2 text-ndp-accent hover:text-ndp-accent rounded-lg hover:bg-white/5 transition-colors"
        title={t('admin.setup_checklist.title')}
        aria-label={t('admin.setup_checklist.title')}
      >
        <ListChecks className="w-5 h-5" />
        {requiredRemaining > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-ndp-accent text-[10px] font-bold text-white px-1 animate-pulse">
            {requiredRemaining}
          </span>
        )}
      </button>

      {open && (
        <div className={clsx(
          'absolute right-0 w-80 sm:w-96 card shadow-2xl shadow-black/50 border border-white/10 animate-fade-in overflow-hidden',
          dropdownDirection === 'below' ? 'top-full mt-2' : 'bottom-full mb-2',
        )}>
          <div className="px-4 py-3 border-b border-white/5">
            <h3 className="text-sm font-semibold text-ndp-text">{t('admin.setup_checklist.title')}</h3>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              {allRequiredDone
                ? t('admin.setup_checklist.all_required_done', { done: totalDone, total: data.items.length })
                : t('admin.setup_checklist.progress', { done: requiredDone, total: required.length })}
            </p>
          </div>

          <ul className="max-h-96 overflow-y-auto py-1">
            {[...required, ...optional].map((item) => (
              <ChecklistRow key={item.id} item={item} t={t} onNavigate={() => setOpen(false)} />
            ))}
          </ul>

          {/* Explicit, full-width "stop reminding me" — previous design used a bare X icon in
              the header that looked like a close-dropdown affordance but actually persisted
              a dismissal. Users hit it by accident. Now: dropdown closes via outside-click or
              clicking the bell again; permanent dismissal is this clearly-labeled button. */}
          <button
            onClick={dismiss}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 border-t border-white/5 transition-colors"
          >
            <EyeOff className="w-3.5 h-3.5" />
            {t('admin.setup_checklist.dismiss', "Don't show again")}
          </button>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  item,
  t,
  onNavigate,
}: {
  item: ChecklistItem;
  t: (k: string, opts?: Record<string, unknown>) => string;
  onNavigate: () => void;
}) {
  const title = t(`admin.setup_checklist.items.${item.id}.title`);
  const desc = t(`admin.setup_checklist.items.${item.id}.desc`);
  return (
    <li>
      <Link
        to={item.href}
        onClick={onNavigate}
        className={clsx(
          'flex items-center gap-3 px-4 py-2.5 transition-colors',
          item.done ? 'text-ndp-text-dim hover:bg-white/[0.02]' : 'text-ndp-text hover:bg-white/5',
        )}
      >
        {item.done
          ? <CheckCircle2 className="w-4 h-4 text-ndp-success flex-shrink-0" />
          : <Circle className={clsx('w-4 h-4 flex-shrink-0', item.required ? 'text-ndp-warning' : 'text-ndp-text-dim')} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={clsx('text-sm font-medium truncate', item.done && 'line-through opacity-60')}>{title}</span>
            {!item.required && !item.done && (
              <span className="text-[10px] uppercase tracking-wider text-ndp-text-dim bg-white/5 px-1.5 py-0.5 rounded flex-shrink-0">
                {t('admin.setup_checklist.optional')}
              </span>
            )}
          </div>
          {!item.done && <p className="text-xs text-ndp-text-dim mt-0.5 line-clamp-2">{desc}</p>}
        </div>
        {!item.done && <ChevronRight className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />}
      </Link>
    </li>
  );
}
