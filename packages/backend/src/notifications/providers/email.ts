import { Resend } from 'resend';
import type { NotificationProvider, NotificationPayload } from '../types.js';

function buildHtml(payload: NotificationPayload): string {
  const msg = `${payload.title}${payload.mediaType ? ` (${payload.mediaType === 'movie' ? 'Film' : 'Series'})` : ''}${payload.username ? ` — ${payload.username}` : ''}`;
  const poster = payload.posterPath
    ? `<br/><img src="https://image.tmdb.org/t/p/w185${payload.posterPath}" alt="" style="border-radius:8px" />`
    : '';

  if (payload.type === 'incident_banner') {
    return `<h2 style="margin:0 0 12px">Incident</h2><p style="margin:0">${payload.message || ''}</p>`;
  }
  return `<h2 style="margin:0 0 12px">${payload.type}</h2><p style="margin:0">${msg}</p>${poster}`;
}

export const emailProvider: NotificationProvider = {
  id: 'email',
  nameKey: 'admin.notifications.provider.email',
  icon: 'Mail',
  settingsSchema: [
    {
      key: 'apiKey',
      labelKey: 'common.api_key',
      type: 'password',
      placeholder: 're_...',
      required: true,
    },
    {
      key: 'fromEmail',
      labelKey: 'admin.notifications.provider.email.from',
      type: 'text',
      placeholder: 'Oscarr <notifs@domain.com>',
      required: true,
    },
    {
      key: 'toEmail',
      labelKey: 'admin.notifications.provider.email.to',
      type: 'text',
      placeholder: 'admin@domain.com',
      required: true,
    },
  ],

  async send(settings, payload) {
    const resend = new Resend(settings.apiKey);
    await resend.emails.send({
      from: settings.fromEmail,
      to: [settings.toEmail],
      subject: `[Oscarr] ${payload.type}`,
      html: buildHtml(payload),
    });
  },

  async testConnection(settings) {
    const resend = new Resend(settings.apiKey);
    await resend.emails.send({
      from: settings.fromEmail,
      to: [settings.toEmail],
      subject: '[Oscarr] Test',
      html: '<h2>Test</h2><p>Notification Email OK!</p>',
    });
  },
};
