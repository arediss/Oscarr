import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import { invalidateUserStateCache } from '../../middleware/rbac.js';
import { getSharedServerUsers } from './client.js';
import type { SyncResult } from '../types.js';

/**
 * Reconciles Oscarr local users with the Plex server's shared_servers list.
 *
 * - Users with a linked Plex provider still present in shared_servers → disabled=false
 * - Users with a linked Plex provider absent from shared_servers → disabled=true
 * - Shared users with no matching Oscarr account → returned as pendingImports
 * - Users without a Plex provider are untouched (Jellyfin / email / etc.)
 * - Admin users are NEVER disabled by sync: the Plex server owner is not listed
 *   in their own shared_servers (that endpoint returns people the server is
 *   shared WITH, not the owner), so syncing would otherwise kick the admin out
 *   of their own instance. Admins are still re-enabled by sync if the flag was
 *   flipped by some other code path.
 */
export async function syncPlexUsers(token: string, machineId: string, callerAdminUserId?: number): Promise<SyncResult> {
  const sharedUsers = await getSharedServerUsers(token, machineId);
  const plexIdsInShares = new Set(sharedUsers.map((u) => String(u.id)));

  const localPlexLinks = await prisma.userProvider.findMany({
    where: { provider: 'plex' },
    select: {
      userId: true,
      providerId: true,
      user: { select: { id: true, disabled: true, displayName: true, email: true, role: true } },
    },
  });

  const linkedPlexIds = new Set(
    localPlexLinks.map((link) => link.providerId).filter((id): id is string => !!id)
  );

  let enabled = 0;
  let disabled = 0;

  for (const link of localPlexLinks) {
    if (!link.providerId) continue;
    const stillShared = plexIdsInShares.has(link.providerId);
    const currentlyDisabled = link.user.disabled;
    const isAdmin = link.user.role === 'admin';
    const isCaller = callerAdminUserId !== undefined && link.userId === callerAdminUserId;
    const protectedFromDisable = isAdmin || isCaller;

    if (stillShared && currentlyDisabled) {
      await prisma.user.update({ where: { id: link.userId }, data: { disabled: false } });
      invalidateUserStateCache(link.userId);
      logEvent('info', 'PlexSync', `Re-enabled ${link.user.displayName || link.user.email} (still on Plex)`);
      enabled++;
    } else if (!stillShared && !currentlyDisabled && !protectedFromDisable) {
      await prisma.user.update({ where: { id: link.userId }, data: { disabled: true } });
      invalidateUserStateCache(link.userId);
      logEvent('info', 'PlexSync', `Disabled ${link.user.displayName || link.user.email} (no longer on Plex)`);
      disabled++;
    }
  }

  const pendingImports = sharedUsers
    .filter((u) => !linkedPlexIds.has(String(u.id)))
    .map((u) => ({
      providerId: String(u.id),
      providerUsername: u.username || null,
      providerEmail: u.email || null,
    }));

  return { enabled, disabled, pendingImports };
}
