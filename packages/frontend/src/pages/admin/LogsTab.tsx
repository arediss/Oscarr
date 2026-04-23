import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualList } from '@/hooks/useVirtualList';
import type { TFunction } from 'i18next';
import { clsx } from 'clsx';
import { Trash2, RefreshCw, ScrollText, ChevronDown, ChevronRight, ChevronLeft, Copy, Check } from 'lucide-react';
import { localizedDateTime } from '@/i18n/formatters';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

interface LogEntry { id: number; level: string; label: string; message: string; createdAt: string; }

const LABEL_COLORS: Record<string, string> = {
  Auth: 'bg-blue-500/10 text-blue-400',
  Sync: 'bg-cyan-500/10 text-cyan-400',
  Job: 'bg-violet-500/10 text-violet-400',
  Settings: 'bg-slate-500/10 text-slate-400',
  Service: 'bg-orange-500/10 text-orange-400',
  User: 'bg-emerald-500/10 text-emerald-400',
  Notification: 'bg-pink-500/10 text-pink-400',
  Support: 'bg-amber-500/10 text-amber-400',
  Request: 'bg-indigo-500/10 text-indigo-400',
  Quality: 'bg-rose-500/10 text-rose-400',
  Media: 'bg-teal-500/10 text-teal-400',
  Test: 'bg-gray-500/10 text-gray-400',
  Setup: 'bg-lime-500/10 text-lime-400',
};

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t('admin.logs.just_now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('admin.logs.minutes_ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('admin.logs.hours_ago', { count: hours });
  const days = Math.floor(hours / 24);
  return t('admin.logs.days_ago', { count: days });
}

export function LogsTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (levelFilter) params.set('level', levelFilter);
      if (labelFilter) params.set('label', labelFilter);
      const { data } = await api.get(`/admin/logs?${params}`);
      setLogs(data.results);
      setTotalPages(data.totalPages);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, levelFilter, labelFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    const tick = () => { if (!document.hidden) fetchLogs(); };
    const interval = setInterval(tick, 10_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const clearLogs = async () => {
    try { await api.delete('/admin/logs'); setLogs([]); }
    catch (err) { console.error(err); }
  };

  const levelColors: Record<string, string> = {
    info: 'bg-ndp-accent/10 text-ndp-accent',
    warn: 'bg-ndp-warning/10 text-ndp-warning',
    error: 'bg-ndp-danger/10 text-ndp-danger',
  };

  const uniqueLabels = [...new Set(logs.map((l) => l.label))].sort((a, b) => a.localeCompare(b));

  // 4 icon-only action buttons share the same visual shape: rounded-lg, 2.5×2.5rem hit area,
  // hover-bg on white/5. Keeps the toolbar visually tight when there's a lot of labels in
  // the filter row.
  const iconBtn = 'p-2 rounded-lg text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <AdminTabLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {['', 'info', 'warn', 'error'].map((lvl) => (
            <button key={lvl} onClick={() => { setLevelFilter(lvl); setPage(1); }}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                levelFilter === lvl ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
              )}>
              {lvl || t('common.all')}
            </button>
          ))}
          <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />
          {uniqueLabels.map((lbl) => (
            <button key={lbl} onClick={() => { setLabelFilter(labelFilter === lbl ? '' : lbl); setPage(1); }}
              className={clsx('px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all',
                labelFilter === lbl ? (LABEL_COLORS[lbl] || 'bg-white/10 text-ndp-text') : 'bg-white/5 text-ndp-text-dim hover:bg-white/10'
              )}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={t('common.previous')}
                title={t('common.previous')}
                className={iconBtn}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-ndp-text-dim tabular-nums px-1">{page}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label={t('common.next')}
                title={t('common.next')}
                className={iconBtn}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
            </>
          )}
          <button
            onClick={fetchLogs}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
            className={iconBtn}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={clearLogs}
            aria-label={t('admin.logs.clear')}
            title={t('admin.logs.clear')}
            className={clsx(iconBtn, 'hover:bg-ndp-danger/10 hover:text-ndp-danger')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading && logs.length === 0 ? <Spinner /> : logs.length === 0 ? (
          <div className="text-center py-16"><ScrollText className="w-10 h-10 text-ndp-text-dim mx-auto mb-2" /><p className="text-sm text-ndp-text-dim">{t('admin.logs.no_logs')}</p></div>
        ) : (
          <LogList logs={logs} t={t} />
        )}
      </div>
    </AdminTabLayout>
  );
}

/** Virtualized log list — renders only the rows in viewport. Uses window-mode virtualization
 *  (the browser's own scroll drives the list) so the list flows naturally with the page
 *  instead of being cut at a fixed height. Row heights are variable (the stack-trace expand
 *  ~doubles a row), so we use `measureElement`. */
function LogList({ logs, t }: { logs: LogEntry[]; t: TFunction }) {
  const { parentRef, rowVirtualizer, items } = useVirtualList({
    count: logs.length,
    estimateSize: 64,
    mode: 'window',
  });
  // In window mode translateY is relative to the document, so we subtract the parent's
  // offset from each virtual item's start. Computed once per render via `scrollMargin`.
  const scrollMargin = parentRef.current?.offsetTop ?? 0;

  return (
    <div ref={parentRef}>
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {items.map((v) => {
          const log = logs[v.index];
          return (
            <div
              key={log.id}
              ref={rowVirtualizer.measureElement}
              data-index={v.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${v.start - scrollMargin}px)`,
                paddingBottom: '0.5rem',
              }}
            >
              <LogRow log={log} t={t} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogRow({ log, t }: { log: LogEntry; t: TFunction }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [head, ...stackLines] = log.message.split('\n---\n');
  const hasStack = stackLines.length > 0;
  const stack = stackLines.join('\n---\n');

  const levelColors: Record<string, string> = {
    info: 'bg-ndp-accent/10 text-ndp-accent',
    warn: 'bg-ndp-warning/10 text-ndp-warning',
    error: 'bg-ndp-danger/10 text-ndp-danger',
  };

  const copy = async () => {
    const block = [
      `[${log.level.toUpperCase()}] [${log.label}] ${localizedDateTime(log.createdAt)}`,
      head,
      hasStack ? `\n${stack}` : '',
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(block);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card">
      <div className="flex items-center gap-4 p-4">
        {hasStack ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 text-ndp-text-dim hover:text-ndp-text flex-shrink-0"
            aria-label={expanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase', levelColors[log.level] || '')}>{log.level}</span>
          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold', LABEL_COLORS[log.label] || 'bg-white/10 text-ndp-text-muted')}>{log.label}</span>
        </div>
        <p className="text-sm text-ndp-text flex-1 min-w-0 truncate">{head}</p>
        <button
          onClick={copy}
          className="p-1 text-ndp-text-dim hover:text-ndp-text rounded hover:bg-white/5 transition-colors flex-shrink-0"
          title={t('admin.logs.copy', 'Copy details')}
          aria-label={t('admin.logs.copy', 'Copy details')}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-ndp-success" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <span className="text-xs text-ndp-text-dim flex-shrink-0" title={localizedDateTime(log.createdAt)}>{timeAgo(log.createdAt, t)}</span>
      </div>
      {expanded && hasStack && (
        <pre className="px-4 pb-4 text-[11px] leading-relaxed text-ndp-text-dim overflow-x-auto whitespace-pre-wrap font-mono border-t border-white/5 pt-3">{stack}</pre>
      )}
    </div>
  );
}
