import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, XCircle, RefreshCw, Pencil, Power } from 'lucide-react';
import cronstrue from 'cronstrue/i18n';
import i18n from '@/i18n';
import { localizedDateTime } from '@/i18n/formatters';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { DangerZone } from './GeneralTab';

interface CronJobData {
  id: number;
  key: string;
  label: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDuration: number | null;
  lastResult: string | null;
}

interface SyncToast {
  type: 'success' | 'error';
  message: string;
}

export function JobsTab() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<CronJobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [editingCron, setEditingCron] = useState<{ key: string; value: string } | null>(null);
  const [toast, setToast] = useState<SyncToast | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/jobs');
      setJobs(data);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const showToast = (t: SyncToast) => { setToast(t); setTimeout(() => setToast(null), 6000); };

  const formatSyncResult = (data: Record<string, any>) => {
    const parts: string[] = [];
    if (data.radarr) {
      const r = data.radarr;
      if ('added' in r) parts.push(t('admin.jobs.toast.radarr_sync', { added: r.added, updated: r.updated, duration: (r.duration / 1000).toFixed(1) }));
      else if ('imported' in r) parts.push(t('admin.jobs.toast.radarr_requests', { imported: r.imported, skipped: r.skipped }) + (r.errors ? t('admin.jobs.toast.errors', { errors: r.errors }) : ''));
    }
    if (data.sonarr) {
      const s = data.sonarr;
      if ('added' in s) parts.push(t('admin.jobs.toast.sonarr_sync', { added: s.added, updated: s.updated, duration: (s.duration / 1000).toFixed(1) }));
      else if ('imported' in s) parts.push(t('admin.jobs.toast.sonarr_requests', { imported: s.imported, skipped: s.skipped }) + (s.errors ? t('admin.jobs.toast.errors', { errors: s.errors }) : ''));
    }
    return parts.join(' — ') || JSON.stringify(data);
  };

  const runJob = async (key: string) => {
    setRunning(key);
    try {
      const { data } = await api.post(`/admin/jobs/${key}/run`);
      await fetchJobs();
      if (data?.result && (data.result.radarr || data.result.sonarr)) {
        showToast({ type: 'success', message: formatSyncResult(data.result) });
      } else {
        showToast({ type: 'success', message: t('admin.jobs.job_done', { key }) });
      }
    } catch (err: any) {
      showToast({ type: 'error', message: err.response?.data?.error || t('admin.jobs.job_failed', { key }) });
    } finally { setRunning(null); }
  };

  const toggleJob = async (job: CronJobData) => {
    await api.put(`/admin/jobs/${job.key}`, { enabled: !job.enabled });
    fetchJobs();
  };

  const saveCron = async (key: string, cronExpression: string) => {
    await api.put(`/admin/jobs/${key}`, { cronExpression });
    setEditingCron(null);
    fetchJobs();
  };

  if (loading) return <Spinner />;

  const cronToHuman = (expr: string) => {
    try { return cronstrue.toString(expr, { locale: i18n.language, use24HourTimeFormat: true }); }
    catch { return null; }
  };
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <AdminTabLayout title={t('admin.jobs.header.job')} count={jobs.length}>
      {/* Toast */}
      {toast && (
        <div className={clsx(
          'fixed bottom-6 right-6 z-50 max-w-lg px-5 py-3 rounded-xl shadow-2xl shadow-black/50 animate-fade-in flex items-start gap-3',
          toast.type === 'success' ? 'bg-ndp-success/10 border border-ndp-success/20 text-ndp-success' : 'bg-ndp-danger/10 border border-ndp-danger/20 text-ndp-danger'
        )}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <p className="text-sm">{toast.message}</p>
        </div>
      )}

      {/* Jobs list */}
      <div className="space-y-3">
        {jobs.map((job) => {
          const isEditing = editingCron?.key === job.key;
          return (
            <div key={job.key} className={clsx('card', !job.enabled && 'opacity-50')}>
              <div className="flex items-center gap-4 p-4">
                {/* Status dot */}
                <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0',
                  !job.enabled ? 'bg-ndp-text-dim' :
                  job.lastStatus === 'success' ? 'bg-ndp-success' :
                  job.lastStatus === 'error' ? 'bg-ndp-danger' :
                  'bg-ndp-text-dim'
                )} />

                {/* Job info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text">{job.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingCron.value}
                          onChange={(e) => setEditingCron({ key: job.key, value: e.target.value })}
                          className="input text-xs font-mono w-32 py-0.5 px-2"
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCron(job.key, editingCron.value); if (e.key === 'Escape') setEditingCron(null); }}
                          autoFocus
                        />
                        <button onClick={() => saveCron(job.key, editingCron.value)} className="p-0.5 text-ndp-success hover:bg-ndp-success/10 rounded"><CheckCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingCron(null)} className="p-0.5 text-ndp-text-dim hover:bg-white/5 rounded"><XCircle className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingCron({ key: job.key, value: job.cronExpression })} className="text-xs text-ndp-text-dim hover:text-ndp-accent transition-colors flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        {cronToHuman(job.cronExpression) || job.cronExpression}
                      </button>
                    )}
                  </div>
                </div>

                {/* Last run info */}
                <div className="hidden sm:flex items-center gap-4 text-xs text-ndp-text-dim flex-shrink-0">
                  {job.lastRunAt && (
                    <span title={localizedDateTime(job.lastRunAt)}>{localizedDateTime(job.lastRunAt)}</span>
                  )}
                  {job.lastDuration !== null && (
                    <span className="font-mono">{formatDuration(job.lastDuration)}</span>
                  )}
                  {job.lastStatus && (
                    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full',
                      job.lastStatus === 'success' ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger'
                    )}>
                      {job.lastStatus === 'success' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {job.lastStatus === 'success' ? 'OK' : t('common.error')}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => runJob(job.key)} disabled={running !== null} className="p-2 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors" title={t('admin.jobs.run')}>
                    {running === job.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button onClick={() => toggleJob(job)} className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors" title={job.enabled ? t('common.disable') : t('common.enable')}>
                    <Power className={clsx('w-4 h-4', job.enabled && 'text-ndp-success')} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Danger Zone */}
      <DangerZone />
    </AdminTabLayout>
  );
}
