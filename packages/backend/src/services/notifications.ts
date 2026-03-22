import axios from 'axios';
import { Resend } from 'resend';
import { prisma } from '../utils/prisma.js';

export type NotificationType =
  | 'request_new'
  | 'request_approved'
  | 'request_declined'
  | 'media_available'
  | 'subscription_expiring'
  | 'incident_banner';

export interface NotificationData {
  title: string;
  mediaType?: 'movie' | 'tv';
  username?: string;
  posterPath?: string | null;
  tmdbId?: number;
  message?: string;
  expiresAt?: string;
}

interface NotificationMatrix {
  [event: string]: { discord?: boolean; telegram?: boolean; email?: boolean };
}

const DEFAULT_MATRIX: NotificationMatrix = {
  request_new: { discord: true, telegram: true, email: false },
  request_approved: { discord: true, telegram: true, email: false },
  request_declined: { discord: true, telegram: true, email: false },
  media_available: { discord: true, telegram: true, email: false },
  subscription_expiring: { discord: false, telegram: false, email: true },
  incident_banner: { discord: true, telegram: true, email: false },
};

const LABELS: Record<NotificationType, string> = {
  request_new: 'Nouvelle demande',
  request_approved: 'Demande approuvée',
  request_declined: 'Demande refusée',
  media_available: 'Média disponible',
  subscription_expiring: 'Abonnement bientôt expiré',
  incident_banner: 'Incident',
};

const COLORS: Record<NotificationType, number> = {
  request_new: 0xf59e0b,
  request_approved: 0x6366f1,
  request_declined: 0xef4444,
  media_available: 0x10b981,
  subscription_expiring: 0xf97316,
  incident_banner: 0xef4444,
};

function buildMessage(type: NotificationType, data: NotificationData): string {
  if (type === 'incident_banner') return data.message || 'Incident en cours';
  if (type === 'subscription_expiring') return `L'abonnement de **${data.username}** expire le ${data.expiresAt}`;
  const mediaLabel = data.mediaType === 'movie' ? 'Film' : 'Série';
  return `**${data.title}** (${mediaLabel})${data.username ? ` — ${data.username}` : ''}`;
}

// === DISCORD ===
async function sendDiscord(webhookUrl: string, type: NotificationType, data: NotificationData) {
  const posterUrl = data.posterPath ? `https://image.tmdb.org/t/p/w185${data.posterPath}` : undefined;
  await axios.post(webhookUrl, {
    embeds: [{
      title: LABELS[type],
      description: buildMessage(type, data),
      color: COLORS[type],
      thumbnail: posterUrl ? { url: posterUrl } : undefined,
      footer: { text: 'Netflix du Pauvre' },
      timestamp: new Date().toISOString(),
    }],
  });
}

// === TELEGRAM ===
async function sendTelegram(botToken: string, chatId: string, type: NotificationType, data: NotificationData) {
  const text = `*${LABELS[type]}*\n${buildMessage(type, data).replace(/\*/g, '')}`;
  await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  });
}

// === EMAIL (Resend) ===
async function sendEmail(apiKey: string, from: string, to: string, type: NotificationType, data: NotificationData) {
  const resend = new Resend(apiKey);
  const msg = buildMessage(type, data).replace(/\*\*/g, '');
  await resend.emails.send({
    from,
    to: [to],
    subject: `[Netflix du Pauvre] ${LABELS[type]}`,
    html: `<h2 style="margin:0 0 12px">${LABELS[type]}</h2><p style="margin:0">${msg}</p>${
      data.posterPath ? `<br/><img src="https://image.tmdb.org/t/p/w185${data.posterPath}" alt="" style="border-radius:8px" />` : ''
    }`,
  });
}

// === DISPATCHER ===
export async function sendNotification(type: NotificationType, data: NotificationData) {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) return;

    const matrix: NotificationMatrix = settings.notificationMatrix
      ? JSON.parse(settings.notificationMatrix)
      : DEFAULT_MATRIX;

    const channels = matrix[type] || {};
    const promises: Promise<void>[] = [];

    if (channels.discord && settings.discordWebhookUrl) {
      promises.push(sendDiscord(settings.discordWebhookUrl, type, data).catch(err =>
        console.error('[Notification] Discord failed:', err.message)
      ));
    }

    if (channels.telegram && settings.telegramBotToken && settings.telegramChatId) {
      promises.push(sendTelegram(settings.telegramBotToken, settings.telegramChatId, type, data).catch(err =>
        console.error('[Notification] Telegram failed:', err.message)
      ));
    }

    if (channels.email && settings.resendApiKey && settings.resendFromEmail && settings.resendToEmail) {
      promises.push(sendEmail(settings.resendApiKey, settings.resendFromEmail, settings.resendToEmail, type, data).catch(err =>
        console.error('[Notification] Email failed:', err.message)
      ));
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.error('[Notification] Dispatch failed:', err);
  }
}

// === TEST FUNCTIONS ===
export async function testDiscord(webhookUrl: string) {
  await axios.post(webhookUrl, {
    embeds: [{ title: 'Test', description: 'Notification Discord OK !', color: 0x10b981, footer: { text: 'Netflix du Pauvre' } }],
  });
}

export async function testTelegram(botToken: string, chatId: string) {
  await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId, text: '*Test*\nNotification Telegram OK !', parse_mode: 'Markdown',
  });
}

export async function testEmail(apiKey: string, from: string, to: string) {
  const resend = new Resend(apiKey);
  await resend.emails.send({ from, to: [to], subject: '[Netflix du Pauvre] Test', html: '<h2>Test</h2><p>Notification Email OK !</p>' });
}

// Log events for the admin logs
export async function logEvent(level: 'info' | 'warn' | 'error', label: string, message: string) {
  try {
    await prisma.appLog.create({ data: { level, label, message } });
  } catch {
    // Silently fail if table doesn't exist yet
  }
}
