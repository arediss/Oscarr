import axios from 'axios';
import type { NotificationProvider, NotificationPayload } from '../types.js';

function buildText(payload: NotificationPayload): string {
  if (payload.type === 'incident_banner') return `*Incident*\n${payload.message || ''}`;
  const mediaLabel = payload.mediaType === 'movie' ? 'Film' : 'Series';
  return `*${payload.type}*\n${payload.title} (${mediaLabel})${payload.username ? ` — ${payload.username}` : ''}`;
}

export const telegramProvider: NotificationProvider = {
  id: 'telegram',
  nameKey: 'admin.notifications.provider.telegram',
  icon: 'Send',
  settingsSchema: [
    {
      key: 'botToken',
      labelKey: 'admin.notifications.provider.telegram.bot_token',
      type: 'password',
      placeholder: '123456:ABC-DEF...',
      required: true,
    },
    {
      key: 'chatId',
      labelKey: 'admin.notifications.provider.telegram.chat_id',
      type: 'text',
      placeholder: '-1001234567890',
      required: true,
    },
  ],

  async send(settings, payload) {
    await axios.post(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      chat_id: settings.chatId,
      text: buildText(payload),
      parse_mode: 'Markdown',
    });
  },

  async testConnection(settings) {
    await axios.post(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      chat_id: settings.chatId,
      text: '*Test*\nNotification Telegram OK!',
      parse_mode: 'Markdown',
    });
  },
};
