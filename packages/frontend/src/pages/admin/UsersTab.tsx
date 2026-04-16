import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Users, Loader2, CheckCircle, RefreshCw, Trash2, Link, ChevronDown, UserX, UserCheck, RefreshCcw, Download } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser } from '@/types';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

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
  const [linkingUser, setLinkingUser] = useState<number | null>(null);
  const [linkModal, setLinkModal] = useState<{ userId: number; provider: string } | null>(null);
  const [linkUsername, setLinkUsername] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkError, setLinkError] = useState('');
  const [authProviders, setAuthProviders] = useState<{ id: string; label: string; type: string }[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<number | null>(null);
  const [togglingDisabledFor, setTogglingDisabledFor] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ enabled: number; disabled: number; pendingImports: Array<{ providerId: string; providerUsername?: string | null; providerEmail?: string | null }> } | null>(null);
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
  useEffect(() => { api.get('/auth/providers').then(({ data }) => setAuthProviders(data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/admin/roles').then(({ data }) => setRoles(data)).catch(() => {}); }, []);

  const handleChangeRole = async (userId: number, newRole: string) => {
    setUpdatingRoleFor(userId);
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      console.error('Failed to change role:', err);
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  const handleToggleDisabled = async (userId: number, disabled: boolean) => {
    setTogglingDisabledFor(userId);
    try {
      await api.put(`/admin/users/${userId}/disabled`, { disabled });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, disabled } : u));
    } catch (err) {
      console.error('Failed to toggle disabled:', err);
    } finally {
      setTogglingDisabledFor(null);
    }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleLinkPlex = async (userId: number) => {
    setLinkingUser(userId);
    // Open popup BEFORE the async call — Safari blocks window.open() after await
    const authWindow = window.open('about:blank', 'PlexAuth', 'width=600,height=700');
    try {
      const { data } = await api.post('/auth/plex/pin');
      const { pin, authUrl } = data;
      if (authWindow) authWindow.location.href = authUrl;

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
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setLinkError(msg || t('login.error'));
    } finally {
      setLinkingUser(null);
    }
  };

  const handleImport = async (providerId: string) => {
    setImporting(true); setImportResult(null);
    try {
      const { data } = await api.post(`/admin/users/import/${providerId}`);
      setImportResult(data);
      fetchUsers();
    } catch (err) { console.error('Import failed:', err); }
    finally { setImporting(false); }
  };

  const handleSync = async (providerId: string) => {
    setSyncing(true); setSyncResult(null);
    try {
      const { data } = await api.post(`/admin/users/sync/${providerId}`);
      setSyncResult(data);
      fetchUsers();
    } catch (err) { console.error('Sync failed:', err); }
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
          {authProviders.filter(p => p.id !== 'email').map(p => (
            <div key={p.id} className="flex items-center gap-1.5">
              <button onClick={() => handleSync(p.id)} disabled={syncing} className="btn-secondary flex items-center gap-2 text-sm">
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                Sync {p.label}
              </button>
              <button onClick={() => handleImport(p.id)} disabled={importing} className="btn-primary flex items-center gap-2 text-sm">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('admin.users.import_provider', { provider: p.label })}
              </button>
            </div>
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
              Sync complete: {syncResult.enabled} re-enabled · {syncResult.disabled} disabled
              {syncResult.pendingImports.length > 0 && ` · ${syncResult.pendingImports.length} on provider without Oscarr account`}
            </p>
            <button onClick={() => setSyncResult(null)} className="ml-auto text-xs text-ndp-text-dim hover:text-ndp-text">×</button>
          </div>
          {syncResult.pendingImports.length > 0 && (
            <div className="mt-3 pl-8 space-y-1">
              <p className="text-xs text-ndp-text-dim">Found on provider but not in Oscarr — click "Import" to pull them in:</p>
              <ul className="text-xs text-ndp-text-muted space-y-0.5">
                {syncResult.pendingImports.slice(0, 10).map((p) => (
                  <li key={p.providerId}>
                    · {p.providerUsername || p.providerEmail || p.providerId}
                    {p.providerEmail && p.providerUsername && <span className="text-ndp-text-dim"> ({p.providerEmail})</span>}
                  </li>
                ))}
                {syncResult.pendingImports.length > 10 && (
                  <li className="text-ndp-text-dim">… and {syncResult.pendingImports.length - 10} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
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
                    <span key={p.provider} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      p.provider === 'plex' ? 'bg-[#e5a00d]/10 text-[#e5a00d]' :
                      p.provider === 'jellyfin' ? 'bg-[#00a4dc]/10 text-[#00a4dc]' :
                      p.provider === 'emby' ? 'bg-[#52b54b]/10 text-[#52b54b]' :
                      p.provider === 'email' ? 'bg-ndp-accent/10 text-ndp-accent' :
                      'bg-white/5 text-ndp-text-dim'
                    }`} title={p.email && p.email !== u.email ? p.email : p.username || undefined}>
                      {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}
                      {p.email && p.email !== u.email && <span className="ml-1 opacity-60">({p.email})</span>}
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
                    title={u.disabled ? 'Re-enable account' : 'Disable account'}
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

const PROVIDER_COLORS: Record<string, string> = {
  plex: '#e5a00d', jellyfin: '#00a4dc', emby: '#52b54b',
};

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
            const color = PROVIDER_COLORS[ap.id] || '#888';
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
