import { prisma } from '../../utils/prisma.js';
import { safeNotify, safeUserNotify } from '../../utils/safeNotify.js';
import { COMPLETABLE_REQUEST_STATUSES } from '@oscarr/shared';
import type { PluginMediaAvailableV1 } from '@oscarr/shared';
import { sendPushToUsers } from '../pushService.js';
import { pluginEventBus } from '../../plugins/eventBus.js';
import { logEvent } from '../../utils/logEvent.js';

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
  // Skip when no Oscarr user has an active request — direct *arr imports shouldn't trigger
  // external channels for media nobody asked for.
  prisma.mediaRequest.findMany({
    where: { mediaId, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
    select: { userId: true },
  }).then(requests => {
    if (requests.length === 0) return;

    safeNotify('media_available', { title, mediaType, posterPath });

    const userIds = [...new Set(requests.map(r => r.userId))];

    const event: PluginMediaAvailableV1 = {
      v: 1,
      mediaId,
      tmdbId,
      mediaType,
      title,
      posterPath,
      requesterUserIds: userIds,
    };
    pluginEventBus.emit('media.available', event).catch(err => {
      logEvent('error', 'PluginEvent', `Subscriber of 'media.available' threw: ${String(err)}`);
    });

    for (const userId of userIds) {
      safeUserNotify(userId, {
        type: 'media_available',
        title,
        message: 'notifications.msg.media_available',
        metadata: { mediaId, tmdbId, mediaType, posterPath, msgParams: { title } },
      });
    }

    const icon = posterPath ? `https://image.tmdb.org/t/p/w200${posterPath}` : undefined;
    const url = tmdbId > 0 ? `/${mediaType}/${tmdbId}` : '/requests';
    sendPushToUsers(userIds, {
      title: `${title} is available!`,
      body: 'Your requested media is now ready to watch.',
      icon,
      url,
    }).catch((err) => {
      logEvent('warn', 'Notif', `Web push fan-out failed for media ${mediaId}: ${String(err)}`);
    });
  }).catch((err) => {
    logEvent('error', 'Notif', `sendAvailabilityNotifications failed for media ${mediaId}: ${String(err)}`);
  });
}
