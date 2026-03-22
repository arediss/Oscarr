import axios from 'axios';
import { prisma } from '../utils/prisma.js';

type NotificationType = 'request_new' | 'request_approved' | 'request_declined' | 'request_available';

interface NotificationData {
  title: string;
  mediaType: 'movie' | 'tv';
  username: string;
  posterPath?: string | null;
  tmdbId?: number;
}

const COLORS: Record<NotificationType, number> = {
  request_new: 0xf59e0b,     // Yellow
  request_approved: 0x6366f1, // Indigo
  request_declined: 0xef4444, // Red
  request_available: 0x10b981, // Green
};

const TITLES: Record<NotificationType, string> = {
  request_new: 'Nouvelle demande',
  request_approved: 'Demande approuvée',
  request_declined: 'Demande refusée',
  request_available: 'Média disponible',
};

export async function sendNotification(type: NotificationType, data: NotificationData) {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.discordWebhookUrl) return;

    const posterUrl = data.posterPath
      ? `https://image.tmdb.org/t/p/w185${data.posterPath}`
      : undefined;

    await axios.post(settings.discordWebhookUrl, {
      embeds: [{
        title: TITLES[type],
        description: `**${data.title}**\n${data.mediaType === 'movie' ? 'Film' : 'Série'} - Demandé par **${data.username}**`,
        color: COLORS[type],
        thumbnail: posterUrl ? { url: posterUrl } : undefined,
        footer: { text: 'Netflix du Pauvre' },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.error('[Notification] Discord webhook failed:', err);
  }
}

// Log events for the admin logs
export async function logEvent(level: 'info' | 'warn' | 'error', label: string, message: string) {
  try {
    await prisma.appLog.create({ data: { level, label, message } });
  } catch {
    // Silently fail if table doesn't exist yet
  }
}
