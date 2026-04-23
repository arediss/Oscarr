import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation, Trans } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { AdminTabLayout } from './AdminTabLayout';
import { extractApiError } from '@/utils/toast';
import { useModal } from '@/hooks/useModal';

/**
 * Destructive bulk operations (purge requests / media / users) — lives as a final stop inside
 * the System group. Each action requires typing a confirmation keyword to guard against slips.
 */
export function DangerTab() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; label: string; desc: string; keyword: string; onConfirm: () => Promise<void> } | null>(null);
  const confirmModal = useModal({
    open: confirmAction !== null,
    onClose: () => { if (!executing) setConfirmAction(null); },
  });
  const [confirmInput, setConfirmInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const actions = [
    {
      id: 'requests',
      label: t('admin.danger.purge_requests'),
      desc: t('admin.danger.purge_requests_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/requests');
        setResult(t('admin.danger.deleted_requests', { count: data.deleted }));
      },
    },
    {
      id: 'media',
      label: t('admin.danger.purge_media'),
      desc: t('admin.danger.purge_media_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/media');
        setResult(t('admin.danger.deleted_media', { media: data.deleted.media, seasons: data.deleted.seasons, requests: data.deleted.requests }));
      },
    },
    {
      id: 'users',
      label: t('admin.danger.purge_users'),
      desc: t('admin.danger.purge_users_desc'),
      keyword: t('admin.danger.keyword'),
      onConfirm: async () => {
        const { data } = await api.delete('/admin/danger/users');
        setResult(t('admin.danger.deleted_users', { count: data.deleted }));
      },
    },
  ];

  const handleExecute = async () => {
    if (!confirmAction || confirmInput !== confirmAction.keyword) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      await confirmAction.onConfirm();
      setConfirmAction(null);
      setConfirmInput('');
    } catch (err) {
      console.error('DangerTab purge failed', err);
      setExecuteError(extractApiError(err, t('admin.danger.purge_failed', 'Purge failed — the operation did not complete.')));
    } finally { setExecuting(false); }
  };

  return (
    <AdminTabLayout>
      <div className="mt-8">
        <div className="border border-ndp-danger/20 rounded-2xl overflow-hidden">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-6 py-4 bg-ndp-danger/5 flex items-center justify-between hover:bg-ndp-danger/10 transition-colors"
          >
            <div className="text-left">
              <h3 className="text-sm font-semibold text-ndp-danger flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {t('admin.danger.title')}
              </h3>
              <p className="text-xs text-ndp-text-dim mt-1">{t('admin.danger.description')}</p>
            </div>
            <svg className={clsx('w-4 h-4 text-ndp-danger transition-transform duration-200', expanded && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className={clsx('overflow-hidden transition-all duration-200', expanded ? 'max-h-[1000px]' : 'max-h-0')}>
            {result && (
              <div className="px-6 py-3 bg-ndp-success/5 border-t border-ndp-danger/20 animate-fade-in">
                <p className="text-sm text-ndp-success flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {result}
                </p>
              </div>
            )}

            <div className="divide-y divide-ndp-danger/10 border-t border-ndp-danger/20">
              {actions.map((action) => (
                <div key={action.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ndp-text">{action.label}</p>
                    <p className="text-xs text-ndp-text-dim mt-0.5">{action.desc}</p>
                  </div>
                  <button
                    onClick={() => { setConfirmAction(action); setConfirmInput(''); setResult(null); setExecuteError(null); }}
                    className="flex-shrink-0 px-4 py-2 text-sm font-medium text-ndp-danger border border-ndp-danger/30 rounded-xl hover:bg-ndp-danger/10 transition-colors"
                  >
                    {action.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {confirmAction && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !executing && setConfirmAction(null)}>
            <div
              ref={confirmModal.dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={confirmModal.titleId}
              className="bg-ndp-surface border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id={confirmModal.titleId} className="text-lg font-bold text-ndp-text flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-ndp-danger" />
                {t('admin.danger.confirm_title')}
              </h3>
              <p className="text-sm text-ndp-text-muted mt-3">{confirmAction.desc}</p>
              <p className="text-sm text-ndp-text-muted mt-4">
                <Trans
                  i18nKey="admin.danger.confirm_text"
                  values={{ keyword: confirmAction.keyword }}
                  components={{ strong: <strong /> }}
                />
              </p>
              <input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={confirmAction.keyword}
                className="input w-full mt-3 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
              />
              {executeError && (
                <div className="mt-3 p-3 rounded-xl bg-ndp-danger/10 border border-ndp-danger/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-ndp-danger flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-ndp-danger">{executeError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => setConfirmAction(null)} disabled={executing} className="btn-secondary text-sm">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleExecute}
                  disabled={confirmInput !== confirmAction.keyword || executing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ndp-danger rounded-xl hover:bg-ndp-danger/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {executing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmAction.label}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    </AdminTabLayout>
  );
}
