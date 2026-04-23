import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Plus, Pencil, Trash2, Loader2, Lock, Check, X } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';
import { useModal } from '@/hooks/useModal';

interface Role {
  id: number;
  name: string;
  permissions: string;
  isDefault: boolean;
  isSystem: boolean;
  position: number;
}

interface Permission {
  key: string;
  description: string;
  source: 'core' | 'plugin';
}

// Group permissions by prefix for cleaner display
function groupPermissions(perms: Permission[]): Record<string, Permission[]> {
  const groups: Record<string, Permission[]> = {};
  for (const p of perms) {
    const prefix = p.key.includes('.') ? p.key.split('.')[0] : 'other';
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(p);
  }
  return groups;
}

export function RolesTab() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  // When the backend reports the role is in use, we switch the same modal
  // into a "migrate users then delete" flow instead of failing silently.
  const [deleteBlocker, setDeleteBlocker] = useState<{ userCount: number } | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');

  // Edit form state
  const [formName, setFormName] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/admin/roles'),
        api.get('/admin/permissions'),
      ]);
      setRoles(rolesRes.data);
      setAllPermissions(permsRes.data);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setFormName('');
    setFormPermissions(['$authenticated', 'requests.read', 'requests.create']);
    setCreating(true);
    setEditingRole(null);
  };

  const openEdit = (role: Role) => {
    setFormName(role.name);
    setFormPermissions(JSON.parse(role.permissions) as string[]);
    setEditingRole(role);
    setCreating(false);
  };

  const closeModal = () => {
    setEditingRole(null);
    setCreating(false);
  };

  const togglePermission = (key: string) => {
    setFormPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const toggleWildcard = () => {
    setFormPermissions(prev =>
      prev.includes('*') ? prev.filter(p => p !== '*') : ['*']
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        await api.post('/admin/roles', { name: formName, permissions: formPermissions });
      } else if (editingRole) {
        await api.put(`/admin/roles/${editingRole.id}`, {
          ...(!editingRole.isSystem ? { name: formName } : {}),
          permissions: formPermissions,
        });
      }
      closeModal();
      await fetchData();
    } catch (err) {
      console.error('Failed to save role:', err);
    } finally {
      setSaving(false);
    }
  };

  const closeDeleteModal = () => {
    setConfirmDelete(null);
    setDeleteBlocker(null);
    setReassignTo('');
  };

  const handleDelete = async (opts?: { reassignTo?: string }) => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/roles/${confirmDelete.id}`, opts?.reassignTo ? { params: { reassignTo: opts.reassignTo } } : undefined);
      closeDeleteModal();
      await fetchData();
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { error?: string; userCount?: number } } }).response;
      if (resp?.status === 409 && resp.data?.error === 'ROLE_IN_USE') {
        setDeleteBlocker({ userCount: resp.data.userCount ?? 0 });
        // Default the migration target to the system "default" role if any,
        // else the first non-self role.
        const fallback = roles.find(r => r.isDefault && r.id !== confirmDelete.id)
          ?? roles.find(r => r.id !== confirmDelete.id);
        setReassignTo(fallback?.name ?? '');
      } else {
        console.error('Failed to delete role:', err);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (role: Role) => {
    try {
      await api.put(`/admin/roles/${role.id}`, { isDefault: true });
      await fetchData();
    } catch (err) {
      console.error('Failed to set default role:', err);
    }
  };

  const isModalOpen = creating || !!editingRole;
  // Hooks must stay above the `if (loading)` early return.
  const editModal = useModal({ open: isModalOpen, onClose: closeModal });
  const confirmDeleteModal = useModal({ open: confirmDelete !== null, onClose: () => setConfirmDelete(null) });

  if (loading) return <Spinner />;

  const grouped = groupPermissions(allPermissions);
  const isWildcard = formPermissions.includes('*');

  return (
    <AdminTabLayout
      title={t('admin.roles.title', 'Roles')}
      count={roles.length}
      actions={
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          {t('admin.roles.create', 'New role')}
        </button>
      }
    >
      <div className="space-y-3">
        {roles.map((role) => {
          const perms = JSON.parse(role.permissions) as string[];
          const isAll = perms.includes('*');

          return (
            <div key={role.id} className="card p-4">
              <div className="flex items-center gap-4">
                <div className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  isAll ? 'bg-ndp-accent/20 text-ndp-accent' : 'bg-white/5 text-ndp-text-muted'
                )}>
                  <Shield className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text capitalize">{role.name}</span>
                    {role.isSystem && (
                      <span className="text-[10px] bg-white/5 text-ndp-text-dim px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        {t('admin.roles.system', 'System')}
                      </span>
                    )}
                    {role.isDefault && (
                      <span className="text-[10px] bg-ndp-success/10 text-ndp-success px-2 py-0.5 rounded-full font-medium">
                        {t('admin.roles.default', 'Default')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ndp-text-dim mt-0.5">
                    {isAll
                      ? t('admin.roles.all_permissions', 'All permissions')
                      : t('admin.roles.permission_count', '{{count}} permissions', { count: perms.filter(p => p !== '$authenticated').length })
                    }
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Never offer wildcard roles as default — would grant new users full admin. */}
                  {!role.isDefault && !isAll && (
                    <button
                      onClick={() => handleSetDefault(role)}
                      className="text-xs px-2.5 py-1 rounded-lg text-ndp-text-dim hover:text-ndp-success hover:bg-ndp-success/10 transition-colors"
                      title={t('admin.roles.set_default', 'Set as default')}
                    >
                      {t('admin.roles.set_default', 'Set as default')}
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(role)}
                    className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-accent hover:bg-ndp-accent/10 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={() => setConfirmDelete(role)}
                      className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            ref={editModal.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={editModal.titleId}
            className="card p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id={editModal.titleId} className="text-lg font-bold text-ndp-text">
                {creating ? t('admin.roles.create', 'New role') : t('admin.roles.edit', 'Edit role')}
              </h3>
              <button onClick={closeModal} aria-label={t('common.close')} className="p-1 rounded-lg hover:bg-white/5 text-ndp-text-dim">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Name */}
            <div className="mb-4">
              <label htmlFor="role-name" className="text-sm text-ndp-text mb-1.5 block font-medium">
                {t('admin.roles.name', 'Name')}
              </label>
              <input
                id="role-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={editingRole?.isSystem}
                placeholder="moderator"
                className="input w-full"
              />
            </div>

            {/* Permissions */}
            <div className="mb-4 flex-1 overflow-y-auto min-h-0">
              <label className="text-sm text-ndp-text mb-2 block font-medium">
                {t('admin.roles.permissions', 'Permissions')}
              </label>

              {/* Wildcard toggle */}
              <button
                onClick={toggleWildcard}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-3 transition-colors text-left',
                  isWildcard ? 'bg-ndp-accent/10 text-ndp-accent' : 'bg-white/5 text-ndp-text-muted hover:bg-white/10'
                )}
              >
                <div className={clsx(
                  'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                  isWildcard ? 'bg-ndp-accent border-ndp-accent' : 'border-white/20'
                )}>
                  {isWildcard && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm font-semibold">{t('admin.roles.all_permissions', 'All permissions')} (*)</span>
              </button>

              {/* Grouped permissions */}
              {!isWildcard && Object.entries(grouped).map(([group, perms]) => (
                <div key={group} className="mb-3">
                  <p className="text-[10px] text-ndp-text-dim uppercase tracking-wider mb-1.5 px-1">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {perms.map((perm) => {
                      const active = formPermissions.includes(perm.key);
                      return (
                        <button
                          key={perm.key}
                          onClick={() => togglePermission(perm.key)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                            active ? 'bg-ndp-accent/10 text-ndp-text' : 'text-ndp-text-muted hover:bg-white/5'
                          )}
                        >
                          <div className={clsx(
                            'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5',
                            active ? 'bg-ndp-accent border-ndp-accent' : 'border-white/20'
                          )}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono">{perm.key}</span>
                              {perm.source === 'plugin' && (
                                <span className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full">
                                  plugin
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-ndp-text-dim mt-0.5">{perm.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-white/5">
              <button onClick={closeModal} className="btn-secondary text-sm flex-1">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!creating && !editingRole) || (!formName.trim() && creating)}
                className="btn-primary text-sm flex-1 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirmation — switches to a "migrate then delete" flow when
          the backend reports the role is still assigned to users. */}
      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            ref={confirmDeleteModal.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmDeleteModal.titleId}
            className="card p-6 max-w-sm w-full mx-4 shadow-2xl"
          >
            {deleteBlocker ? (
              <>
                <h3 id={confirmDeleteModal.titleId} className="text-lg font-bold text-ndp-text mb-2">
                  {t('admin.roles.in_use_title', 'Role still in use')}
                </h3>
                <p className="text-sm text-ndp-text-muted mb-1">
                  {t('admin.roles.in_use_desc', '{{count}} user(s) still have the role "{{name}}". Pick a role to migrate them to before deleting.', { count: deleteBlocker.userCount, name: confirmDelete.name })}
                </p>
                <label className="text-xs text-ndp-text-dim mt-4 mb-1.5 block font-medium">
                  {t('admin.roles.reassign_to', 'Migrate users to')}
                </label>
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className="input w-full text-sm capitalize mb-6"
                >
                  {roles
                    .filter(r => r.id !== confirmDelete.id)
                    .map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}{r.isDefault ? ` — ${t('admin.roles.default', 'Default')}` : ''}
                      </option>
                    ))}
                </select>
                <div className="flex gap-3">
                  <button onClick={closeDeleteModal} className="btn-secondary text-sm flex-1">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => handleDelete({ reassignTo })}
                    disabled={deleting || !reassignTo}
                    className="btn-danger text-sm flex-1 flex items-center justify-center gap-2"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t('admin.roles.migrate_and_delete', 'Migrate & delete')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-ndp-text mb-2">{t('admin.danger.confirm_title')}</h3>
                <p className="text-sm text-ndp-text-muted mb-6">
                  {t('admin.roles.confirm_delete', 'Are you sure you want to delete the role "{{name}}"?', { name: confirmDelete.name })}
                </p>
                <div className="flex gap-3">
                  <button onClick={closeDeleteModal} className="btn-secondary text-sm flex-1">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => handleDelete()}
                    disabled={deleting}
                    className="btn-danger text-sm flex-1 flex items-center justify-center gap-2"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t('common.delete', 'Delete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </AdminTabLayout>
  );
}
