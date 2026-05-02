import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, UserCircle2, Sparkles, Pencil } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AvatarEditor, { renderDicebearAvatar, type AvatarOptions } from '@/components/account/AvatarEditor';

interface InfoFieldProps {
  label: string;
  value: React.ReactNode;
}

function InfoField({ label, value }: InfoFieldProps) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ndp-text-dim">{label}</p>
      <p className="text-sm text-ndp-text break-words">{value || '—'}</p>
    </div>
  );
}

export function AccountSection() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [savingSource, setSavingSource] = useState<string | null>(null);
  const [editingDicebear, setEditingDicebear] = useState(false);
  if (!user) return null;

  const dicebearConfig = useMemo(() => {
    if (!user.avatarConfig) return null;
    try {
      const parsed = JSON.parse(user.avatarConfig) as { seed?: string; options?: AvatarOptions };
      return parsed.seed ? { seed: parsed.seed, options: parsed.options ?? {} } : null;
    } catch { return null; }
  }, [user.avatarConfig]);

  // Re-render the saved dicebear avatar so the picker tile keeps showing it even when the active
  // source is something else (Plex/Discord). Without this the user would only see the sparkles
  // fallback after switching away — losing visibility of the avatar they took time to build.
  const dicebearPreview = useMemo(
    () => (dicebearConfig ? renderDicebearAvatar(dicebearConfig.seed, dicebearConfig.options) : null),
    [dicebearConfig],
  );

  const memberSince = user.createdAt ? new Date(user.createdAt) : null;
  const memberSinceLabel = memberSince && !Number.isNaN(memberSince.getTime())
    ? memberSince.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const avatarEl = user.avatar ? (
    <img src={user.avatar} alt="" className="w-20 h-20 rounded-full ring-4 ring-ndp-bg object-cover" />
  ) : (
    <div className="w-20 h-20 rounded-full ring-4 ring-ndp-bg bg-ndp-accent/20 flex items-center justify-center text-ndp-accent text-2xl font-bold">
      {(user.displayName || user.email || '?')[0].toUpperCase()}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
        <div className="h-10 bg-gradient-to-r from-ndp-accent/40 via-purple-500/40 to-ndp-accent/40" />
        <div className="px-5 pb-7 flex gap-4">
          <div className="-mt-6 flex-shrink-0">{avatarEl}</div>
          <div className="flex-1 min-w-0 pt-4">
            <p className="text-lg font-bold text-ndp-text truncate">{user.displayName || user.email}</p>
            {user.role && (
              <p className="text-xs text-ndp-text-dim mt-0.5 capitalize">{user.role}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ndp-text-dim mb-4">
          {t('account.info.title', 'Informations')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          <InfoField label={t('account.info.email', 'Email')} value={user.email} />
          <InfoField label={t('account.info.username', 'Pseudo')} value={user.displayName} />
          <InfoField label={t('account.info.role', 'Rôle')} value={user.role} />
          {memberSinceLabel && (
            <InfoField label={t('account.info.member_since', 'Membre depuis')} value={memberSinceLabel} />
          )}
        </div>
      </div>

      {user.providers && user.providers.length > 0 && !editingDicebear && (
        <AvatarSourcePicker
          providers={user.providers}
          currentSource={user.avatarSource ?? null}
          dicebearAvatar={dicebearPreview}
          savingSource={savingSource}
          onPick={async (source) => {
            if (savingSource) return;
            if (source === 'dicebear') {
              // No saved config (or already on dicebear) → open the editor.
              if (!dicebearConfig || user.avatarSource === 'dicebear') {
                setEditingDicebear(true);
                return;
              }
              // Saved config exists → restore directly without forcing the user to re-edit.
              setSavingSource('dicebear');
              try {
                const dataUri = renderDicebearAvatar(dicebearConfig.seed, dicebearConfig.options);
                await api.put('/auth/me/avatar-source', {
                  source: 'dicebear',
                  config: { style: 'avataaars', seed: dicebearConfig.seed, options: dicebearConfig.options },
                  avatar: dataUri,
                });
                await refreshUser();
              } finally {
                setSavingSource(null);
              }
              return;
            }
            setSavingSource(source);
            try {
              await api.put('/auth/me/avatar-source', { source });
              await refreshUser();
            } finally {
              setSavingSource(null);
            }
          }}
        />
      )}

      {editingDicebear && (
        <AvatarEditor
          initialSeed={dicebearConfig?.seed}
          initialOptions={dicebearConfig?.options}
          saving={savingSource === 'dicebear'}
          onCancel={() => setEditingDicebear(false)}
          onSave={async ({ seed, options, dataUri }) => {
            if (savingSource) return;
            setSavingSource('dicebear');
            try {
              await api.put('/auth/me/avatar-source', {
                source: 'dicebear',
                config: { style: 'avataaars', seed, options },
                avatar: dataUri,
              });
              await refreshUser();
              setEditingDicebear(false);
            } finally {
              setSavingSource(null);
            }
          }}
        />
      )}

      {user.providers && user.providers.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ndp-text-dim mb-4">
            {t('account.info.linked_accounts', 'Comptes liés')}
          </h3>
          <ul className="space-y-2">
            {user.providers.map((p) => (
              <li
                key={p.provider}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
              >
                <span className="text-sm font-medium text-ndp-text capitalize">{p.provider}</span>
                <span className="text-xs text-ndp-text-dim truncate">
                  {p.username || p.email || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface AvatarSourcePickerProps {
  providers: NonNullable<ReturnType<typeof useAuth>['user']>['providers'];
  currentSource: string | null;
  dicebearAvatar: string | null;
  savingSource: string | null;
  onPick: (source: string) => void;
}

interface Tile {
  id: string;
  label: string;
  avatar: string | null;
  fallbackIcon?: 'user' | 'sparkles';
}

function AvatarSourcePicker({ providers, currentSource, dicebearAvatar, savingSource, onPick }: AvatarSourcePickerProps) {
  const { t } = useTranslation();
  // Only show tiles for providers that actually carry an avatar URL — email and any future
  // credential-only provider (LDAP, basic OIDC without picture claim, …) are filtered out
  // automatically without a frontend change. New providers that DO supply an avatar appear as
  // tiles the moment their first login writes `UserProvider.providerAvatar`.
  const visibleProviders = (providers ?? []).filter((p) => !!p.avatar);
  const tiles: Tile[] = [
    ...visibleProviders.map<Tile>((p) => ({
      id: p.provider,
      label: p.provider,
      avatar: p.avatar ?? null,
    })),
    { id: 'dicebear', label: 'Oscarr', avatar: dicebearAvatar, fallbackIcon: 'sparkles' },
    { id: 'none', label: t('account.avatar.none', 'Aucun'), avatar: null },
  ];
  // savingSource takes priority so the selected ring + check move instantly on click — without
  // it the user waits for the PUT + /me refetch round-trip before the picker reflects their pick.
  const effectiveSource = savingSource ?? currentSource ?? visibleProviders.find((p) => p.avatar)?.provider ?? 'none';

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ndp-text-dim mb-1">
        {t('account.avatar.title', 'Avatar')}
      </h3>
      <p className="text-xs text-ndp-text-dim mb-4">
        {t('account.avatar.hint', 'Choisis quel compte fournit ta photo de profil.')}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {tiles.map((tile) => {
          const selected = effectiveSource === tile.id;
          const saving = savingSource === tile.id;
          // Dicebear tile is special: clicking it when already selected opens the editor (the
          // pencil icon hints at this). Every other tile no-ops on re-click since picking the
          // already-active source is meaningless.
          const isEditableActive = selected && tile.id === 'dicebear';
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => {
                if (savingSource) return;
                if (selected && tile.id !== 'dicebear') return;
                onPick(tile.id);
              }}
              disabled={!!savingSource}
              className={clsx(
                'group relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors text-left',
                selected
                  ? 'border-ndp-accent bg-ndp-accent/5'
                  : 'border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10',
                isEditableActive && 'cursor-pointer',
              )}
            >
              <div className="relative">
                {tile.avatar ? (
                  <img
                    src={tile.avatar}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-white/5 bg-white/5"
                  />
                ) : (
                  <div className={clsx(
                    'w-14 h-14 rounded-full ring-2 ring-white/5 flex items-center justify-center',
                    tile.fallbackIcon === 'sparkles' ? 'bg-ndp-accent/10 text-ndp-accent' : 'bg-white/5 text-ndp-text-dim',
                  )}>
                    {tile.fallbackIcon === 'sparkles' ? <Sparkles className="w-7 h-7" /> : <UserCircle2 className="w-8 h-8" />}
                  </div>
                )}
                {selected && !isEditableActive && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ndp-accent flex items-center justify-center ring-2 ring-ndp-bg">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </span>
                )}
                {isEditableActive && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ndp-accent flex items-center justify-center ring-2 ring-ndp-bg group-hover:scale-110 transition-transform">
                    <Pencil className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-ndp-text-muted capitalize truncate w-full text-center">
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
