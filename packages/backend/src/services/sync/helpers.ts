import { prisma } from '../../utils/prisma.js';
import { safeNotify, safeUserNotify } from '../../utils/safeNotify.js';
import { COMPLETABLE_REQUEST_STATUSES } from '@oscarr/shared';
import { sendPushToUsers } from '../pushService.js';

export interface SyncResult {
  added: number;
  updated: number;
  errors: number;
  duration: number;
}

export function sendAvailabilityNotifications(
  title: string,
  mediaType: 'movie' | 'tv',
  posterPath: string | null,
  mediaId: number,
  tmdbId: number,
): void {
  // Only notify when at least one Oscarr user has an active request for this
  // media — otherwise the event comes from a direct *arr import nobody asked
  // for, and external channels (Discord/Telegram/Email) would be spammed with
  // irrelevant "media available" pings.
  prisma.mediaRequest.findMany({
    where: { mediaId, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
    select: { userId: true },
  }).then(requests => {
    if (requests.length === 0) return;

    // External broadcast (Discord / Telegram / Email configured by admins)
    safeNotify('media_available', { title, mediaType, posterPath });

    // In-app bell — one per requester
    for (const req of requests) {
      safeUserNotify(req.userId, {
        type: 'media_available',
        title,
        message: 'notifications.msg.media_available',
        metadata: { mediaId, tmdbId, mediaType, msgParams: { title } },
      });
    }

    // Web push — deduped per user
    const userIds = [...new Set(requests.map(r => r.userId))];
    const icon = posterPath ? `https://image.tmdb.org/t/p/w200${posterPath}` : undefined;
    // Fall back to /requests when the media has no real TMDB id yet
    // (e.g. webhook-imported TV series stored with negative tmdbId).
    const url = tmdbId > 0 ? `/${mediaType}/${tmdbId}` : '/requests';
    sendPushToUsers(userIds, {
      title: `${title} is available!`,
      body: 'Your requested media is now ready to watch.',
      icon,
      url,
    }).catch(() => {}); // fire-and-forget
  }).catch(() => {});
}
