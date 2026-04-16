import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import { invalidateUserStateCache } from '../../middleware/rbac.js';
import { getSharedServerUsers } from '../../services/plex.js';
import type { SyncResult } from '../types.js';

/**
 * Reconciles Oscarr local users with the Plex server's shared_servers list.
 *
 * - Users with a linked Plex provider still present in shared_servers → disabled=false
 * - Users with a linked Plex provider absent from shared_servers → disabled=true
 * - Shared users with no matching Oscarr account → returned as pendingImports
 * - Users without a Plex provider are untouched (they may be Jellyfin/email/etc.)
 */
export async function syncPlexUsers(token: string, machineId: string): Promise<SyncResult> {
  const sharedUsers = await getSharedServerUsers(token, machineId);
  const plexIdsInShares = new Set(sharedUsers.map((u) => String(u.id)));

  const localPlexLinks = await prisma.userProvider.findMany({
    where: { provider: 'plex' },
    select: {
      userId: true,
      providerId: true,
      user: { select: { id: true, disabled: true, displayName: true, email: true } },
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

    if (stillShared && currentlyDisabled) {
      await prisma.user.update({ where: { id: link.userId }, data: { disabled: false } });
      invalidateUserStateCache(link.userId);
      logEvent('info', 'PlexSync', `Re-enabled ${link.user.displayName || link.user.email} (still on Plex)`);
      enabled++;
    } else if (!stillShared && !currentlyDisabled) {
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
