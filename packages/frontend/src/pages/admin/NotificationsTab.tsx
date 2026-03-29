import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Save, CheckCircle, Send, Eye, EyeOff, Pencil, Power } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

const EVENT_TYPES = [
  { key: 'request_new', label: 'admin.notifications.event.request_new' },
  { key: 'request_approved', label: 'admin.notifications.event.request_approved' },
  { key: 'request_declined', label: 'admin.notifications.event.request_declined' },
  { key: 'media_available', label: 'admin.notifications.event.media_available' },
  { key: 'incident_banner', label: 'admin.notifications.event.incident_banner' },
] as const;

const DEFAULT_MATRIX: Record<string, { discord: boolean; telegram: boolean; email: boolean }> = {
  request_new: { discord: true, telegram: true, email: false },
  request_approved: { discord: true, telegram: true, email: false },
  request_declined: { discord: true, telegram: true, email: false },
  media_available: { discord: true, telegram: true, email: false },
  incident_banner: { discord: true, telegram: true, email: false },
};

interface ChannelDef {
  id: 'discord' | 'telegram' | 'email';
  label: string;
  fields: { key: string; label: string; type: 'text' | 'password'; placeholder: string }[];
  enabledKey: string; // key in config to check if has value
}

export function NotificationsTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [config, setConfig] = useState<Record<string, string>>({
    discordWebhookUrl: '', telegramBotToken: '', telegramChatId: '',
    resendApiKey: '', resendFromEmail: '', resendToEmail: '',
  });
  const [channelEnabled, setChannelEnabled] = useState<Record<string, boolean>>({ discord: false, telegram: false, email: false });
  const [matrix, setMatrix] = useState<Record<string, { discord: boolean; telegram: boolean; email: boolean }>>(DEFAULT_MATRIX);

  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; ok: boolean } | null>(null);

  const channels: ChannelDef[] = [
    {
      id: 'discord', label: 'Discord', enabledKey: 'discordWebhookUrl',
      fields: [{ key: 'discordWebhookUrl', label: t('admin.notifications.webhook_url'), type: 'password', placeholder: 'https://discord.com/api/webhooks/...' }],
    },
    {
      id: 'telegram', label: 'Telegram', enabledKey: 'telegramBotToken',
      fields: [
        { key: 'telegramBotToken', label: t('admin.notifications.bot_token'), type: 'password', placeholder: '123456:ABC-DEF...' },
        { key: 'telegramChatId', label: t('admin.notifications.chat_id'), type: 'text', placeholder: '-1001234567890' },
      ],
    },
    {
      id: 'email', label: t('admin.notifications.email_resend'), enabledKey: 'resendApiKey',
      fields: [
        { key: 'resendApiKey', label: t('common.api_key'), type: 'password', placeholder: 're_...' },
        { key: 'resendFromEmail', label: t('admin.services.sender_email'), type: 'text', placeholder: 'Oscarr <notifs@domain.com>' },
        { key: 'resendToEmail', label: t('admin.services.recipient_email'), type: 'text', placeholder: 'admin@domain.com' },
      ],
    },
  ];

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      const cfg: Record<string, string> = {
        discordWebhookUrl: data.discordWebhookUrl || '',
        telegramBotToken: data.telegramBotToken || '',
        telegramChatId: data.telegramChatId || '',
        resendApiKey: data.resendApiKey || '',
        resendFromEmail: data.resendFromEmail || '',
        resendToEmail: data.resendToEmail || '',
      };
      setConfig(cfg);
      setChannelEnabled({
        discord: !!cfg.discordWebhookUrl,
        telegram: !!cfg.telegramBotToken && !!cfg.telegramChatId,
        email: !!cfg.resendApiKey && !!cfg.resendFromEmail && !!cfg.resendToEmail,
      });
      if (data.notificationMatrix) {
        try { setMatrix({ ...DEFAULT_MATRIX, ...JSON.parse(data.notificationMatrix) }); } catch {}
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const isConfigured = (chId: string) => channelEnabled[chId] && !!config[channels.find(c => c.id === chId)?.enabledKey || ''];

  const toggleChannel = (chId: string) => {
    setChannelEnabled(prev => ({ ...prev, [chId]: !prev[chId] }));
  };

  const openEditModal = (chId: string) => {
    const ch = channels.find(c => c.id === chId);
    if (!ch) return;
    const cfg: Record<string, string> = {};
    ch.fields.forEach(f => { cfg[f.key] = config[f.key] || ''; });
    setEditConfig(cfg);
    setShowSecrets({});
    setEditingChannel(chId);
  };

  const saveChannelConfig = () => {
    setConfig(prev => ({ ...prev, ...editConfig }));
    setChannelEnabled(prev => ({ ...prev, [editingChannel!]: true }));
    setEditingChannel(null);
  };

  const testChannel = async (channel: 'discord' | 'telegram' | 'email') => {
    setTestingChannel(channel);
    setTestResult(null);
    try {
      if (channel === 'discord') await api.post('/admin/notifications/test/discord', { webhookUrl: config.discordWebhookUrl });
      else if (channel === 'telegram') await api.post('/admin/notifications/test/telegram', { botToken: config.telegramBotToken, chatId: config.telegramChatId });
      else await api.post('/admin/notifications/test/email', { apiKey: config.resendApiKey, from: config.resendFromEmail, to: config.resendToEmail });
      setTestResult({ channel, ok: true });
    } catch {
      setTestResult({ channel, ok: false });
    } finally {
      setTestingChannel(null);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const toggleMatrix = (event: string, channel: 'discord' | 'telegram' | 'email') => {
    setMatrix(prev => ({ ...prev, [event]: { ...prev[event], [channel]: !prev[event][channel] } }));
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/admin/settings', {
        discordWebhookUrl: channelEnabled.discord ? (config.discordWebhookUrl || null) : null,
        telegramBotToken: channelEnabled.telegram ? (config.telegramBotToken || null) : null,
        telegramChatId: channelEnabled.telegram ? (config.telegramChatId || null) : null,
        resendApiKey: channelEnabled.email ? (config.resendApiKey || null) : null,
        resendFromEmail: channelEnabled.email ? (config.resendFromEmail || null) : null,
        resendToEmail: channelEnabled.email ? (config.resendToEmail || null) : null,
        notificationMatrix: JSON.stringify(matrix),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout
      title={t('admin.notifications.channels')}
      actions={
        <button onClick={handleSave} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t('common.saved') : t('common.save')}
        </button>
      }
    >
      {/* Channels */}
      <div>

        <div className="space-y-3">
          {channels.map((ch) => {
            const configured = isConfigured(ch.id);
            const enabled = channelEnabled[ch.id];
            const result = testResult?.channel === ch.id ? testResult : null;

            return (
              <div key={ch.id} className={clsx('card', !enabled && 'opacity-50')}>
                <div className="flex items-center gap-4 p-4">
                  <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', configured && enabled ? 'bg-ndp-success' : 'bg-ndp-text-dim')} />
                  <span className="text-sm font-semibold text-ndp-text flex-1">{ch.label}</span>

                  {result && (
                    <span className={clsx('text-xs px-2 py-1 rounded-lg flex-shrink-0', result.ok ? 'bg-ndp-success/10 text-ndp-success' : 'bg-ndp-danger/10 text-ndp-danger')}>
                      {result.ok ? t('common.sent') : t('status.connection_failed')}
                    </span>
                  )}

                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => testChannel(ch.id)}
                      disabled={!configured || !enabled || testingChannel === ch.id}
                      className="p-2 text-ndp-text-dim hover:text-ndp-accent hover:bg-white/5 rounded-lg transition-colors"
                      title={t('common.test')}
                    >
                      {testingChannel === ch.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEditModal(ch.id)}
                      className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors"
                      title={t('common.configure')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleChannel(ch.id)}
                      className="p-2 text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 rounded-lg transition-colors"
                      title={enabled ? t('common.disable') : t('common.enable')}
                    >
                      <Power className={clsx('w-4 h-4', enabled && 'text-ndp-success')} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Matrix */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-ndp-text mb-2">{t('admin.notifications.matrix_title')}</h2>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.notifications.matrix_desc')}</p>

        <div className="space-y-3">
          {EVENT_TYPES.map(({ key, label }) => (
            <div key={key} className="card">
              <div className="flex items-center gap-4 p-4">
                <span className="text-sm text-ndp-text flex-1">{t(label)}</span>
                {channels.map((ch) => {
                  const enabled = channelEnabled[ch.id];
                  const active = matrix[key]?.[ch.id] ?? false;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => enabled && toggleMatrix(key, ch.id)}
                      disabled={!enabled}
                      className={clsx(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                        !enabled ? 'opacity-30 cursor-not-allowed bg-white/5 text-ndp-text-dim' :
                        active ? 'bg-ndp-accent/10 text-ndp-accent' : 'bg-white/5 text-ndp-text-dim hover:bg-white/10'
                      )}
                    >
                      {ch.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Channel config modal */}
      {editingChannel && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={() => setEditingChannel(null)}>
          <div className="card p-6 w-full max-w-md border border-white/10 shadow-2xl animate-fade-in" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ndp-text mb-4">
              {channels.find(c => c.id === editingChannel)?.label}
            </h3>
            <div className="space-y-4">
              {channels.find(c => c.id === editingChannel)?.fields.map((field) => (
                <div key={field.key}>
                  <label className="text-xs text-ndp-text-dim block mb-1">{field.label}</label>
                  <div className="relative">
                    <input
                      type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                      value={editConfig[field.key] || ''}
                      onChange={(e) => setEditConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="input w-full text-sm pr-10"
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ndp-text-dim hover:text-ndp-text"
                      >
                        {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingChannel(null)} className="btn-secondary text-sm flex-1">{t('common.cancel')}</button>
              <button onClick={saveChannelConfig} className="btn-primary text-sm flex-1 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> {t('common.save')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AdminTabLayout>
  );
}
