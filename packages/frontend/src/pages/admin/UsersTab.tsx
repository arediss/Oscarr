import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle, RefreshCw, Trash2, Link, ChevronDown, UserX, UserCheck, RefreshCcw, Download, X } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { showToast, extractApiError } from '@/utils/toast';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser } from '@/types';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useModal } from '@/hooks/useModal';
import { getProviderBadgeClass, getProviderHex } from '@/providers/colors';
import { startPlexPinFlow, type PlexPinFlowHandle } from '@/providers/plex/pinFlow';

type UserSort = 'username' | 'date' | 'role';

interface Role { id: number; name: string; position: number }

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
  const confirmDeleteModal = useModal({
    open: confirmDeleteUser !== null,
    onClose: () => setConfirmDeleteUser(null),
  });
  const [linkingUser, setLinkingUser] = useState<number | null>(null);
  const [linkModal, setLinkModal] = useState<{ userId: number; provider: string } | null>(null);
  const [linkUsername, setLinkUsername] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkError, setLinkError] = useState('');
  const [authProviders, setAuthProviders] = useState<{ id: string; label: string; type: string }[]>([]);
  const [syncableProviders, setSyncableProviders] = useState<{ id: string; label: string; type: string }[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<number | null>(null);
  const [togglingDisabledFor, setTogglingDisabledFor] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    providerId: string;
    providerLabel: string;
    enabled: number;
    disabled: number;
    pendingImports: Array<{ providerId: string; providerUsername?: string | null; providerEmail?: string | null }>;
  } | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const flowRef = useRef<PlexPinFlowHandle | null>(null);

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
    api.get('/auth/providers')
      .then(({ data }) => setAuthProviders(data))
      .catch((err) => console.error('Failed to fetch auth providers:', err));
    // Sync buttons are driven by service availability, not SSO — fetched separately so admins
    // can sync a Plex service they've configured even with Plex SSO turned off.
    api.get('/admin/auth-providers/syncable')
      .then(({ data }) => setSyncableProviders(data))
      .catch((err) => console.error('Failed to fetch syncable providers:', err));
  }, []);
  useEffect(() => { api.get('/admin/roles').then(({ data }) => setRoles(data)).catch(() => {}); }, []);

  const handleChangeRole = async (userId: number, newRole: string) => {
    setUpdatingRoleFor(userId);
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      const code = extractApiError(err, '');
      const msg =
        code === 'CANNOT_DEMOTE_SELF' ? t('admin.users.cannot_demote_self', "You can't demote your own admin role.")
        : code === 'LAST_ADMIN_LOCK' ? t('admin.users.last_admin_lock', 'At least one active admin must remain.')
        : extractApiError(err, t('admin.users.role_change_failed', 'Failed to change role'));
      showToast(msg, 'error');
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  const handleUnlinkProvider = async (userId: number, provider: string) => {
    try {
      await api.delete(`/admin/users/${userId}/providers/${provider}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, providers: (u.providers || []).filter(p => p.provider !== provider) } : u));
    } catch (err) {
      const code = extractApiError(err, '');
      const msg =
        code === 'LAST_AUTH_METHOD' ? t('admin.users.last_auth_method', 'Cannot unlink the last authentication method — set a password first.')
        : extractApiError(err, t('admin.users.unlink_failed', 'Failed to unlink provider'));
      showToast(msg, 'error');
    }
  };

  const handleToggleDisabled = async (userId: number, disabled: boolean) => {
    setTogglingDisabledFor(userId);
    try {
      await api.put(`/admin/users/${userId}/disabled`, { disabled });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, disabled } : u));
    } catch (err) {
      const code = extractApiError(err, '');
      const msg =
        code === 'LAST_ADMIN_LOCK' ? t('admin.users.last_admin_lock', 'At least one active admin must remain.')
        : extractApiError(err, t('admin.users.disable_failed', 'Failed to toggle account'));
      showToast(msg, 'error');
    } finally {
      setTogglingDisabledFor(null);
    }
  };

  useEffect(() => () => flowRef.current?.cancel(), []);

  const handleLinkPlex = (userId: number) => {
    setLinkingUser(userId);
    const authWindow = window.open('about:blank', 'PlexAuth', 'width=600,height=700');
    flowRef.current?.cancel();
    flowRef.current = startPlexPinFlow({
      authWindow,
      pinEndpoint: '/auth/plex/pin',
      checkEndpoint: `/admin/users/${userId}/link-provider`,
      checkPayload: { provider: 'plex' },
      // link-provider returns { success: true } once the link is created, not a token. The
      // helper interprets a non-null return as success — so we return the sentinel string
      // when linkData.success flips.
      extractToken: (res) => ((res as { success?: boolean })?.success ? 'ok' : null),
      onToken: () => {
        setLinkingUser(null);
        fetchUsers();
      },
      onError: () => setLinkingUser(null),
    });
  };

  const handleLinkCredentials = async () => {
    if (!linkModal) return;
    setLinkingUser(linkModal.userId);
    setLinkError('');
    try {
      await api.post(`/admin/users/${linkModal.userId}/link-provider`, {
        provider: linkModal.provider, username: linkUsername, password: linkPassword,
      });
      setLinkModal(null);
      setLinkUsername('');
      setLinkPassword('');
      fetchUsers();
    } catch (err) {
      setLinkError(extractApiError(err, t('login.error')));
    } finally {
      setLinkingUser(null);
    }
  };

  // Two-step flow: Sync reconciles existing accounts (enable/disable) and lists provider users
  // without an Oscarr account. The admin then opens a modal from the sync banner, cherry-picks
  // which to pull in, and confirms — avoids auto-creating random server members.
  const handleImport = async (providerId: string, providerIds?: string[]) => {
    setImporting(true); setImportResult(null);
    try {
      const { data } = await api.post(`/admin/users/import/${providerId}`, { providerIds });
      setImportResult(data);
      setImportModalOpen(false);
      setSyncResult(null); // pendingImports are now resolved, clear the sync banner
      fetchUsers();
    } catch (err) {
      console.error('Import failed:', err);
      showToast(extractApiError(err, t('admin.users.import_failed')), 'error');
      // Keep the modal open with the selection intact so the admin can retry.
    }
    finally { setImporting(false); }
  };

  const openImportModal = () => {
    if (!syncResult) return;
    setSelectedImportIds(new Set(syncResult.pendingImports.map((p) => p.providerId)));
    setImportModalOpen(true);
  };

  const toggleImportId = (providerId: string) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const toggleSelectAllImports = () => {
    if (!syncResult) return;
    if (selectedImportIds.size === syncResult.pendingImports.length) {
      setSelectedImportIds(new Set());
    } else {
      setSelectedImportIds(new Set(syncResult.pendingImports.map((p) => p.providerId)));
    }
  };

  const handleSync = async (providerId: string, providerLabel: string) => {
    setSyncing(true); setSyncResult(null); setImportResult(null);
    try {
      const { data } = await api.post(`/admin/users/sync/${providerId}`);
      setSyncResult({ providerId, providerLabel, ...data });
      fetchUsers();
    } catch (err) {
      console.error('Sync failed:', err);
      showToast(extractApiError(err, t('admin.users.sync_failed', { provider: providerLabel })), 'error');
    }
    finally { setSyncing(false); }
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
        <div className="flex items-center gap-2 flex-wrap">
          {syncableProviders.map(p => (
            <button key={p.id} onClick={() => handleSync(p.id, p.label)} disabled={syncing} className="btn-secondary flex items-center gap-2 text-sm">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              {t('admin.users.sync_provider', { provider: p.label })}
            </button>
          ))}
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

      {syncResult && (
        <div className="p-3 bg-ndp-accent/5 border border-ndp-accent/20 rounded-xl mb-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <RefreshCcw className="w-5 h-5 text-ndp-accent flex-shrink-0" />
            <p className="text-sm text-ndp-text-muted">
              {t('admin.users.sync_complete', {
                provider: syncResult.providerLabel,
                enabled: syncResult.enabled,
                disabled: syncResult.disabled,
              })}
              {syncResult.pendingImports.length > 0 && ` · ${t('admin.users.sync_pending_count', { count: syncResult.pendingImports.length })}`}
            </p>
            <button onClick={() => setSyncResult(null)} className="ml-auto text-xs text-ndp-text-dim hover:text-ndp-text">×</button>
          </div>
          {syncResult.pendingImports.length > 0 && (
            <div className="mt-3 pl-8">
              <p className="text-xs text-ndp-text-dim mb-2">{t('admin.users.sync_pending_hint')}</p>
              <button
                onClick={openImportModal}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                {t('admin.users.sync_review_cta', { count: syncResult.pendingImports.length })}
              </button>
            </div>
          )}
        </div>
      )}

      {importModalOpen && syncResult && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !importing && setImportModalOpen(false)}
        >
          <div
            className="bg-ndp-surface border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/5">
              <h3 className="text-lg font-bold text-ndp-text flex items-center gap-2">
                <Download className="w-5 h-5 text-ndp-accent" />
                {t('admin.users.import_modal.title', { provider: syncResult.providerLabel })}
              </h3>
              <p className="text-sm text-ndp-text-muted mt-1">
                {t('admin.users.import_modal.subtitle', { count: syncResult.pendingImports.length })}
              </p>
              <button
                onClick={toggleSelectAllImports}
                className="mt-3 text-xs text-ndp-accent hover:text-ndp-accent/80 transition-colors"
              >
                {selectedImportIds.size === syncResult.pendingImports.length
                  ? t('admin.users.import_modal.deselect_all')
                  : t('admin.users.import_modal.select_all')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {syncResult.pendingImports.map((p) => {
                const checked = selectedImportIds.has(p.providerId);
                return (
                  <label
                    key={p.providerId}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleImportId(p.providerId)}
                      className="w-4 h-4 rounded border-white/20 bg-transparent checked:bg-ndp-accent checked:border-ndp-accent focus:ring-ndp-accent focus:ring-offset-0 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ndp-text truncate">{p.providerUsername || p.providerEmail || p.providerId}</p>
                      {p.providerEmail && p.providerUsername && (
                        <p className="text-xs text-ndp-text-dim truncate">{p.providerEmail}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="p-4 border-t border-white/5 flex items-center justify-between gap-3">
              <span className="text-xs text-ndp-text-dim">
                {t('admin.users.import_modal.selected_count', { count: selectedImportIds.size })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setImportModalOpen(false)}
                  disabled={importing}
                  className="btn-secondary text-sm"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleImport(syncResult.providerId, Array.from(selectedImportIds))}
                  disabled={importing || selectedImportIds.size === 0}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {t('admin.users.sync_import_cta', { count: selectedImportIds.size })}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
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
            <div key={u.id} className={clsx('card transition-opacity', u.disabled && 'opacity-50')}>
              <div className="flex items-center gap-4 p-4">
                {u.avatar ? <img src={u.avatar} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent font-bold">{(u.displayName || u.email)[0].toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text">{u.displayName || u.email}</span>
                    {u.disabled && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-ndp-danger/10 text-ndp-danger">
                        Disabled
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ndp-text-dim mt-0.5 block">{u.email}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Group 1 — provider badges + request count */}
                  <span className="text-xs text-ndp-text-dim tabular-nums">{u.requestCount} {t('requests.title').toLowerCase()}</span>
                  {(u.providers || []).map((p) => (
                    <span key={p.provider} className="group relative inline-flex">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getProviderBadgeClass(p.provider)}`} title={p.email && p.email !== u.email ? p.email : p.username || undefined}>
                        {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}
                        {p.email && p.email !== u.email && <span className="ml-1 opacity-60">({p.email})</span>}
                      </span>
                      <button
                        onClick={() => handleUnlinkProvider(u.id, p.provider)}
                        className="ml-0.5 hidden group-hover:inline-flex items-center justify-center w-4 h-4 rounded-full text-ndp-text-dim hover:bg-ndp-danger/20 hover:text-ndp-danger"
                        title={t('admin.users.unlink', { provider: p.provider, defaultValue: 'Unlink {{provider}}' })}
                        aria-label={`Unlink ${p.provider}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <LinkProviderDropdown
                    userId={u.id}
                    userProviders={(u.providers || []).map(p => p.provider)}
                    authProviders={authProviders}
                    linking={linkingUser === u.id}
                    onLinkOAuth={(userId) => handleLinkPlex(userId)}
                    onLinkCredentials={(userId, providerId) => {
                      setLinkModal({ userId, provider: providerId });
                      setLinkUsername(''); setLinkPassword(''); setLinkError('');
                    }}
                  />

                  <span className="h-5 w-px bg-white/10" aria-hidden />

                  {/* Group 2 — role */}
                  <RoleBadgeDropdown
                    user={u}
                    roles={roles}
                    disabled={u.id === currentUser?.id || roles.length === 0}
                    loading={updatingRoleFor === u.id}
                    onSelect={(role) => handleChangeRole(u.id, role)}
                  />

                  <span className="h-5 w-px bg-white/10" aria-hidden />

                  {/* Group 3a — toggle disabled (never available for self) */}
                  <button
                    onClick={() => handleToggleDisabled(u.id, !u.disabled)}
                    disabled={u.id === currentUser?.id || togglingDisabledFor === u.id}
                    className={clsx(
                      'p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                      u.disabled
                        ? 'text-ndp-success hover:bg-ndp-success/10'
                        : 'text-ndp-text-dim hover:text-ndp-warning hover:bg-ndp-warning/10'
                    )}
                    title={u.disabled ? t('admin.users.enable_account', 'Re-enable account') : t('admin.users.disable_account', 'Disable account')}
                    aria-label={u.disabled ? t('admin.users.enable_account', 'Re-enable account') : t('admin.users.disable_account', 'Disable account')}
                  >
                    {togglingDisabledFor === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : u.disabled ? (
                      <UserCheck className="w-3.5 h-3.5" />
                    ) : (
                      <UserX className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Group 3b — delete (always visible, disabled for self) */}
                  <button
                    onClick={() => setConfirmDeleteUser(u.id)}
                    disabled={u.id === currentUser?.id || deletingUser === u.id}
                    className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors disabled:opacity-30 disabled:hover:text-ndp-text-dim disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    title={t('admin.danger.delete_user')}
                    aria-label={t('admin.danger.delete_user')}
                  >
                    {deletingUser === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
        ))}
      </div>

      {confirmDeleteUser && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            ref={confirmDeleteModal.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmDeleteModal.titleId}
            className="card p-6 max-w-sm w-full mx-4 shadow-2xl"
          >
            <h3 id={confirmDeleteModal.titleId} className="text-lg font-bold text-ndp-text mb-2">{t('admin.danger.confirm_title')}</h3>
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
      {/* Link credentials modal */}
      {linkModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setLinkModal(null)}>
          <div className="bg-ndp-bg rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ndp-text mb-1">
              {t('admin.users.link_provider', { provider: authProviders.find(p => p.id === linkModal.provider)?.label || linkModal.provider })}
            </h3>
            <p className="text-xs text-ndp-text-dim mb-4">
              {users.find(u => u.id === linkModal.userId)?.displayName || users.find(u => u.id === linkModal.userId)?.email}
            </p>
            {linkError && (
              <div className="mb-3 p-2 bg-ndp-danger/10 border border-ndp-danger/20 rounded-lg text-ndp-danger text-xs text-center">{linkError}</div>
            )}
            <form onSubmit={e => { e.preventDefault(); handleLinkCredentials(); }} className="space-y-3">
              <input
                type="text"
                placeholder={t('login.username')}
                value={linkUsername}
                onChange={e => setLinkUsername(e.target.value)}
                className="input w-full text-sm"
                autoFocus
              />
              <input
                type="password"
                placeholder={t('login.password_placeholder')}
                value={linkPassword}
                onChange={e => setLinkPassword(e.target.value)}
                className="input w-full text-sm"
              />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setLinkModal(null)} className="btn-secondary text-sm flex-1">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={linkingUser !== null || !linkUsername || !linkPassword}
                  className="btn-primary text-sm flex-1 flex items-center justify-center gap-2"
                >
                  {linkingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                  {t('admin.users.link')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </AdminTabLayout>
  );
}

// ─── Role Badge Dropdown ───────────────────────────────────────────

function RoleBadgeDropdown({ user, roles, disabled, loading, onSelect }: {
  user: AdminUser;
  roles: Role[];
  disabled: boolean;
  loading: boolean;
  onSelect: (role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = () => {
    if (disabled || loading) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  };

  // Intentionally different visual from provider pills so admins see this as
  // an interactive control (rounded-lg + border + chevron), not just a label.
  // Fixed min-width + justify-between keeps the column aligned across rows
  // regardless of role name length or state (loading/disabled).
  const badgeClasses = clsx(
    'text-[10px] px-2 py-1 rounded-lg font-semibold capitalize inline-flex items-center gap-1.5 justify-between min-w-[78px] transition-all border',
    user.role === 'admin'
      ? 'bg-ndp-accent/10 text-ndp-accent border-ndp-accent/20'
      : 'bg-white/5 text-ndp-text-muted border-white/10',
    disabled
      ? 'opacity-60 cursor-default'
      : 'hover:bg-white/10 hover:border-white/20 cursor-pointer',
  );

  return (
    <>
      <button ref={btnRef} onClick={toggle} disabled={disabled || loading} className={badgeClasses}>
        <span>{loading ? <Loader2 className="w-3 h-3 animate-spin" /> : user.role}</span>
        <ChevronDown
          className={clsx(
            'w-3 h-3 transition-transform shrink-0',
            disabled ? 'opacity-0' : 'opacity-70',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-ndp-surface border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden min-w-[160px]"
          style={{ top: pos.top, left: pos.left }}
        >
          {roles.map(r => {
            const active = r.name === user.role;
            return (
              <button
                key={r.id}
                onClick={() => { setOpen(false); if (!active) onSelect(r.name); }}
                className={clsx(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors capitalize',
                  active ? 'text-ndp-accent bg-ndp-accent/5 font-semibold' : 'text-ndp-text-muted hover:bg-white/5',
                )}
              >
                <span>{r.name}</span>
                {active && <CheckCircle className="w-3 h-3" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Link Provider Dropdown ────────────────────────────────────────

function LinkProviderDropdown({ userId, userProviders, authProviders, linking, onLinkOAuth, onLinkCredentials }: {
  userId: number;
  userProviders: string[];
  authProviders: { id: string; label: string; type: string }[];
  linking: boolean;
  onLinkOAuth: (userId: number) => void;
  onLinkCredentials: (userId: number, providerId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unlinked = authProviders.filter(ap => ap.id !== 'email' && !userProviders.includes(ap.id));
  if (unlinked.length === 0) return null;

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={linking}
        className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-white/5 text-ndp-text-dim hover:bg-white/10 hover:text-ndp-text-muted transition-colors flex items-center gap-1"
      >
        {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
        {t('admin.users.link')}
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-ndp-surface border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden min-w-[140px]"
          style={{ top: pos.top, left: pos.left }}
        >
          {unlinked.map(ap => {
            const color = getProviderHex(ap.id);
            return (
              <button
                key={ap.id}
                onClick={() => {
                  setOpen(false);
                  if (ap.type === 'oauth') onLinkOAuth(userId);
                  else onLinkCredentials(userId, ap.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ndp-text-muted hover:bg-white/5 transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                {ap.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
