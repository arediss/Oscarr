import { prisma } from '../../utils/prisma.js';
import { safeNotify, safeUserNotify } from '../../utils/safeNotify.js';
import { COMPLETABLE_REQUEST_STATUSES } from '../../utils/requestStatus.js';

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
  safeNotify('media_available', { title, mediaType, posterPath });

  // Notify each user who has a pending request for this media
  prisma.mediaRequest.findMany({
    where: { mediaId, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
    select: { userId: true },
  }).then(requests => {
    for (const req of requests) {
      safeUserNotify(req.userId, {
        type: 'media_available',
        title,
        message: 'notifications.msg.media_available',
        metadata: { mediaId, tmdbId, mediaType, msgParams: { title } },
      });
    }
  }).catch(() => {});
}
