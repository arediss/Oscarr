import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Trash2,
  Megaphone,
  MessageSquare as MessageIcon,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Message } from '@/types';

export default function MessagesPage() {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState<'general' | 'announcement'>('general');
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await api.get('/messages');
      setMessages(data.results);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      await api.post('/messages', { content: content.trim(), type: messageType });
      setContent('');
      fetchMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/messages/${id}`);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins}min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-2xl font-bold text-ndp-text mb-8">Messages</h1>

      {/* Compose */}
      <form onSubmit={handleSend} className="card p-4 mb-8">
        <div className="flex gap-3">
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent font-bold flex-shrink-0">
              {(user?.plexUsername || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Écrire un message..."
              className="input w-full resize-none min-h-[80px]"
              rows={3}
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setMessageType(messageType === 'general' ? 'announcement' : 'general')}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      messageType === 'announcement'
                        ? 'bg-ndp-gold/10 text-ndp-gold'
                        : 'bg-white/5 text-ndp-text-muted hover:bg-white/10'
                    )}
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    Annonce
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={sending || !content.trim()}
                className="btn-primary flex items-center gap-2 text-sm py-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Messages list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-ndp-accent animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-20">
          <MessageIcon className="w-16 h-16 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted">Aucun message pour le moment</p>
          <p className="text-ndp-text-dim text-sm mt-1">Soyez le premier !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={clsx(
                'card p-4',
                msg.type === 'announcement' && 'border-ndp-gold/30 bg-ndp-gold/5'
              )}
            >
              <div className="flex items-start gap-3">
                {msg.user.avatar ? (
                  <img src={msg.user.avatar} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent text-sm font-bold flex-shrink-0">
                    {(msg.user.plexUsername || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ndp-text">{msg.user.plexUsername}</span>
                    {msg.user.role === 'admin' && (
                      <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-1.5 py-0.5 rounded-full font-semibold">Admin</span>
                    )}
                    {msg.type === 'announcement' && (
                      <span className="text-[10px] bg-ndp-gold/10 text-ndp-gold px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                        <Megaphone className="w-2.5 h-2.5" />
                        Annonce
                      </span>
                    )}
                    <span className="text-xs text-ndp-text-dim">{formatDate(msg.createdAt)}</span>
                  </div>
                  <p className="text-sm text-ndp-text mt-1.5 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
                {(msg.userId === user?.id || isAdmin) && (
                  <button
                    onClick={() => handleDelete(msg.id)}
                    className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors flex-shrink-0"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
