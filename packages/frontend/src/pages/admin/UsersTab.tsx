import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Users, Loader2, CheckCircle, RefreshCw, Trash2, Link } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser } from '@/types';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

type UserSort = 'username' | 'date' | 'role';

export function UsersTab() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<UserSort>('username');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const [deletingUser, setDeletingUser] = useState<number | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<number | null>(null);
  const [linkingUser, setLinkingUser] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const { data: usersData } = await api.get('/admin/users');
      setUsers(usersData);
    } catch (err) { console.error('Failed to fetch users:', err); }
    finally { setLoading(false); }
  }, []);

  const handleDeleteUser = async (userId: number) => {
    setDeletingUser(userId);
    try {
      await api.delete(`/admin/danger/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) { console.error('Failed to delete user:', err); }
    finally { setDeletingUser(null); }
  };

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleLinkPlex = async (userId: number) => {
    setLinkingUser(userId);
    try {
      const { data } = await api.post('/auth/plex/pin');
      const { pin, authUrl } = data;
      window.open(authUrl, 'PlexAuth', 'width=600,height=700');

      let attempts = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts >= 120) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setLinkingUser(null);
          return;
        }
        try {
          const { data: linkData } = await api.post(`/admin/users/${userId}/link-provider`, { provider: 'plex', pinId: pin.id });
          if (linkData.success) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setLinkingUser(null);
            fetchUsers();
          }
        } catch { /* keep polling */ }
      }, 1000);
    } catch {
      setLinkingUser(null);
    }
  };

  const handleImportPlex = async () => {
    setImporting(true); setImportResult(null);
    try {
      const { data } = await api.post('/admin/users/import/plex');
      setImportResult(data);
      fetchUsers();
    } catch (err) { console.error('Import failed:', err); }
    finally { setImporting(false); }
  };

  if (loading) return <Spinner />;

  const sortedUsers = [...users].sort((a, b) => {
    if (sortBy === 'username') return (a.displayName || a.email).localeCompare(b.displayName || b.email);
    if (sortBy === 'role') return a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return (
    <AdminTabLayout
      title={t('admin.users.count', { count: users.length })}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={handleImportPlex} disabled={importing} className="btn-primary flex items-center gap-2 text-sm">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            {t('admin.users.import_plex')}
          </button>
          <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> {t('common.refresh')}</button>
        </div>
      }
    >
      <div className="flex items-center gap-1 mb-4">
        {([['username', t('admin.users.sort.name')], ['date', t('admin.users.sort.date')], ['role', t('admin.users.sort.role')]] as [UserSort, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSortBy(key)}
            className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-all', sortBy === key ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light')}>
            {label}
          </button>
        ))}
      </div>

      {importResult && (
        <div className="p-3 bg-ndp-success/5 border border-ndp-success/20 rounded-xl mb-4 animate-fade-in flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-ndp-success flex-shrink-0" />
          <p className="text-sm text-ndp-text-muted">
            {t('admin.users.imported', { imported: importResult.imported, existing: importResult.skipped })}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {sortedUsers.map((u) => (
            <div key={u.id} className="card">
              <div className="flex items-center gap-4 p-4">
                {u.avatar ? <img src={u.avatar} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent font-bold">{(u.displayName || u.email)[0].toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text">{u.displayName || u.email}</span>
                    <span className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize',
                      u.role === 'admin' ? 'bg-ndp-accent/10 text-ndp-accent' : 'bg-white/5 text-ndp-text-dim'
                    )}>{u.role}</span>
                  </div>
                  <span className="text-xs text-ndp-text-dim mt-0.5 block">{u.email}</span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-xs text-ndp-text-dim tabular-nums">{u.requestCount} {t('requests.title').toLowerCase()}</span>
                  {(u.providers || []).map((p) => (
                    <span key={p.provider} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      p.provider === 'plex' ? 'bg-[#e5a00d]/10 text-[#e5a00d]' :
                      p.provider === 'email' ? 'bg-ndp-accent/10 text-ndp-accent' :
                      'bg-white/5 text-ndp-text-dim'
                    }`} title={p.email && p.email !== u.email ? p.email : p.username || undefined}>
                      {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}
                      {p.email && p.email !== u.email && <span className="ml-1 opacity-60">({p.email})</span>}
                    </span>
                  ))}
                  {!(u.providers || []).some((p) => p.provider === 'plex') && (
                    <button
                      onClick={() => handleLinkPlex(u.id)}
                      disabled={linkingUser === u.id}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#e5a00d]/5 text-[#e5a00d]/60 hover:bg-[#e5a00d]/15 hover:text-[#e5a00d] transition-colors flex items-center gap-1"
                      title={t('admin.users.link_plex')}
                    >
                      {linkingUser === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                      Plex
                    </button>
                  )}
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => setConfirmDeleteUser(u.id)}
                      disabled={deletingUser === u.id}
                      className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                      title={t('admin.danger.delete_user')}
                    >
                      {deletingUser === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
        ))}
      </div>

      {confirmDeleteUser && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="card p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-ndp-text mb-2">{t('admin.danger.confirm_title')}</h3>
            <p className="text-sm text-ndp-text-muted mb-1">
              {t('admin.users.confirm_delete', { name: users.find(u => u.id === confirmDeleteUser)?.displayName || users.find(u => u.id === confirmDeleteUser)?.email })}
            </p>
            <p className="text-xs text-ndp-text-dim mb-6">
              {t('admin.users.confirm_delete_desc')}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteUser(null)} className="btn-secondary text-sm flex-1">
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => { const userId = confirmDeleteUser; setConfirmDeleteUser(null); await handleDeleteUser(userId); }}
                disabled={deletingUser !== null}
                className="btn-danger text-sm flex-1 flex items-center justify-center gap-2"
              >
                {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('admin.danger.delete_user')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AdminTabLayout>
  );
}
