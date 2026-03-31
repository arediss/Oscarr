import axios from 'axios';
import type { NotificationProvider, NotificationPayload } from '../types.js';

function buildDescription(payload: NotificationPayload): string {
  if (payload.type === 'incident_banner') return payload.message || '';
  const mediaLabel = payload.mediaType === 'movie' ? 'Film' : 'Series';
  return `**${payload.title}** (${mediaLabel})${payload.username ? ` — ${payload.username}` : ''}`;
}

export const discordProvider: NotificationProvider = {
  id: 'discord',
  nameKey: 'admin.notifications.provider.discord',
  icon: 'MessageCircle',
  settingsSchema: [
    {
      key: 'webhookUrl',
      labelKey: 'admin.notifications.provider.discord.webhook_url',
      type: 'password',
      placeholder: 'https://discord.com/api/webhooks/...',
      required: true,
    },
  ],

  async send(settings, payload) {
    const posterUrl = payload.posterPath ? `https://image.tmdb.org/t/p/w185${payload.posterPath}` : undefined;
    await axios.post(settings.webhookUrl, {
      embeds: [{
        title: payload.type,
        description: buildDescription(payload),
        color: payload.color ?? 0x808080,
        thumbnail: posterUrl ? { url: posterUrl } : undefined,
        footer: { text: 'Oscarr' },
        timestamp: new Date().toISOString(),
      }],
    });
  },

  async testConnection(settings) {
    await axios.post(settings.webhookUrl, {
      embeds: [{ title: 'Test', description: 'Notification Discord OK!', color: 0x10b981, footer: { text: 'Oscarr' } }],
    });
  },
};
