import { prisma } from './prisma.js';

/** Resolves a user's effective avatar URL based on their `avatarSource` preference and the
 *  per-provider URLs cached on `UserProvider.providerAvatar`.
 *
 *  - `avatarSource = "none"` → null (initials fallback in the UI)
 *  - `avatarSource = "<providerId>"` → the matching `UserProvider.providerAvatar` (or null if the
 *    provider was unlinked or never reported one)
 *  - `avatarSource = null` (legacy/auto) → first non-null `providerAvatar` we find. Lets older
 *    accounts created before the picker existed keep behaving as before until the user picks. */
export async function resolveUserAvatar(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatar: true,
      avatarSource: true,
      providers: { select: { provider: true, providerAvatar: true } },
    },
  });
  if (!user) return null;

  if (user.avatarSource === 'none') return null;
  // DiceBear avatars are self-contained data URIs already in User.avatar — keep them.
  if (user.avatarSource === 'dicebear') return user.avatar;

  if (user.avatarSource) {
    return user.providers.find((p) => p.provider === user.avatarSource)?.providerAvatar ?? null;
  }

  // Auto / legacy — pick the first provider that actually has an avatar URL stored.
  return user.providers.find((p) => p.providerAvatar)?.providerAvatar ?? null;
}

/** Recomputes `User.avatar` from the current `avatarSource` + provider data and writes it.
 *  Call after any change that could affect the resolution: provider link/unlink, login refresh,
 *  picker selection. */
export async function refreshUserAvatar(userId: number): Promise<string | null> {
  const resolved = await resolveUserAvatar(userId);
  await prisma.user.update({ where: { id: userId }, data: { avatar: resolved } });
  return resolved;
}
