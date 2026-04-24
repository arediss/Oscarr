import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Plus,
  Loader2,
  MessageSquare,
  CheckCircle,
  Circle,
  ArrowLeft,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { localizedTime, localizedDate } from '@/i18n/formatters';

interface Ticket {
  id: number;
  subject: string;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt: string | null;
  user: { id: number; displayName: string; avatar: string | null };
  messageCount: number;
  lastMessage: { content: string; createdAt: string; user: { displayName: string } } | null;
}

interface TicketMsg {
  id: number;
  ticketId: number;
  userId: number;
  content: string;
  createdAt: string;
  user: { id: number; displayName: string; avatar: string | null; role: string };
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = useCallback(async () => {
    try {
      const { data } = await api.get('/support/tickets');
      setTickets(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Load messages when ticket selected
  useEffect(() => {
    if (!activeTicket) return;
    setLoadingMsgs(true);
    api.get(`/support/tickets/${activeTicket.id}/messages`)
      .then(({ data }) => { setMessages(data); setTimeout(() => messagesEndRef.current?.scrollIntoView(), 50); })
      .catch(console.error)
      .finally(() => setLoadingMsgs(false));
  }, [activeTicket]);

  useEffect(() => {
    if (!activeTicket) return;
    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const { data } = await api.get(`/support/tickets/${activeTicket.id}/messages`);
        setMessages(data);
      } catch (err) { console.warn('[MessagesPage] ticket poll failed', err); }
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTicket]);

  const sendMessage = async () => {
    if (!input.trim() || !activeTicket || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/support/tickets/${activeTicket.id}/messages`, { content: input.trim() });
      setMessages((prev) => [...prev, data]);
      setInput('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      // Update ticket in list
      fetchTickets();
    } catch (err) { console.error(err); }
    finally { setSending(false); }
  };

  const createTicket = async () => {
    if (!newSubject.trim() || !newMessage.trim() || creating) return;
    setCreating(true);
    try {
      const { data } = await api.post('/support/tickets', { subject: newSubject.trim(), message: newMessage.trim() });
      setNewSubject(''); setNewMessage(''); setShowNew(false);
      await fetchTickets();
      setActiveTicket(data);
    } catch (err) { console.error(err); }
    finally { setCreating(false); }
  };

  const toggleTicketStatus = async (ticket: Ticket) => {
    const newStatus = ticket.status === 'open' ? 'closed' : 'open';
    try {
      await api.patch(`/support/tickets/${ticket.id}`, { status: newStatus });
      fetchTickets();
      if (activeTicket?.id === ticket.id) {
        setActiveTicket({ ...activeTicket, status: newStatus });
      }
    } catch (err) { console.error(err); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return t('messages.just_now');
    if (diff < 3600000) return t('messages.minutes_ago', { count: Math.floor(diff / 60000) });
    if (date.toDateString() === now.toDateString()) return localizedTime(date, { hour: '2-digit', minute: '2-digit' });
    return localizedDate(date, { day: '2-digit', month: '2-digit' }) + ' ' + localizedTime(date, { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-4rem)]"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          {activeTicket && (
            <button onClick={() => setActiveTicket(null)} className="sm:hidden p-1 text-ndp-text-muted hover:text-ndp-text">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <MessageSquare className="w-5 h-5 text-ndp-accent" />
          <h1 className="text-xl font-bold text-ndp-text">{t('messages.title')}</h1>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary text-sm flex items-center gap-1.5">
          {showNew ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showNew ? t('common.cancel') : t('messages.new_ticket')}
        </button>
      </div>

      {/* New ticket form */}
      {showNew && (
        <div className="mb-4 p-4 card border border-ndp-accent/20 animate-slide-up">
          <p className="text-sm font-semibold text-ndp-text mb-3">{t('messages.new_ticket')}</p>
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder={t('messages.subject_placeholder')}
            className="input text-sm w-full mb-3"
            autoFocus
          />
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={t('messages.description_placeholder')}
            className="input text-sm w-full mb-3 min-h-[100px] resize-none"
            rows={4}
          />
          <button onClick={createTicket} disabled={!newSubject.trim() || !newMessage.trim() || creating} className="btn-primary text-sm flex items-center gap-2">
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('messages.create_ticket')}
          </button>
        </div>
      )}

      {/* Main area: ticket list + conversation */}
      <div className="flex-1 flex gap-4 min-h-0 pb-4">
        {/* Ticket list */}
        <div className={clsx(
          'w-full sm:w-80 flex-shrink-0 overflow-y-auto space-y-1',
          activeTicket ? 'hidden sm:block' : 'block'
        )}>
          {tickets.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-10 h-10 text-ndp-text-dim mx-auto mb-2" />
              <p className="text-sm text-ndp-text-dim">{t('messages.no_tickets')}</p>
              <p className="text-xs text-ndp-text-dim mt-1">{t('messages.no_tickets_help')}</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setActiveTicket(ticket)}
                className={clsx(
                  'w-full text-left p-3 rounded-xl transition-all',
                  activeTicket?.id === ticket.id
                    ? 'bg-ndp-accent/10 border border-ndp-accent/20'
                    : 'hover:bg-white/5 border border-transparent'
                )}
              >
                <div className="flex items-start gap-2">
                  {ticket.status === 'open' ? (
                    <Circle className="w-3 h-3 text-ndp-success mt-1 flex-shrink-0 fill-ndp-success" />
                  ) : (
                    <CheckCircle className="w-3 h-3 text-ndp-text-dim mt-1 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ndp-text truncate">{ticket.subject}</p>
                      <span className="text-[10px] text-ndp-text-dim flex-shrink-0">{formatTime(ticket.createdAt)}</span>
                    </div>
                    {hasPermission('support.manage') && (
                      <p className="text-[11px] text-ndp-accent mt-0.5">{ticket.user.displayName}</p>
                    )}
                    {ticket.lastMessage && (
                      <p className="text-xs text-ndp-text-dim truncate mt-0.5">
                        {ticket.lastMessage.user.displayName}: {ticket.lastMessage.content}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Conversation */}
        {activeTicket ? (
          <div className="flex-1 flex flex-col card overflow-hidden min-h-0">
            {/* Ticket header */}
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ndp-text truncate">{activeTicket.subject}</p>
                <p className="text-[11px] text-ndp-text-dim">
                  {activeTicket.status === 'open' ? t('messages.open') : t('messages.closed')}
                  {hasPermission('support.manage') && ` · ${activeTicket.user.displayName}`}
                </p>
              </div>
              {hasPermission('support.manage') && (
                <button
                  onClick={() => toggleTicketStatus(activeTicket)}
                  className={clsx('text-xs px-3 py-1 rounded-lg transition-colors',
                    activeTicket.status === 'open'
                      ? 'bg-ndp-danger/10 text-ndp-danger hover:bg-ndp-danger/20'
                      : 'bg-ndp-success/10 text-ndp-success hover:bg-ndp-success/20'
                  )}
                >
                  {activeTicket.status === 'open' ? t('messages.close_ticket') : t('messages.reopen_ticket')}
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-ndp-accent animate-spin" /></div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.user.id === user?.id;
                  const showMeta = i === 0 || messages[i - 1].user.id !== msg.user.id ||
                    new Date(msg.createdAt).getTime() - new Date(messages[i - 1].createdAt).getTime() > 300000;

                  return (
                    <div key={msg.id} className={clsx('flex', isMe ? 'justify-end' : 'justify-start')}>
                      <div className="max-w-[75%]">
                        {showMeta && !isMe && (
                          <div className="flex items-center gap-2 mb-1 ml-1">
                            {msg.user.avatar ? (
                              <img src={msg.user.avatar} alt="" className="w-5 h-5 rounded-full" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-ndp-accent/20 flex items-center justify-center text-[9px] text-ndp-accent font-bold">
                                {(msg.user.displayName || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs font-medium text-ndp-text-muted">{msg.user.displayName}</span>
                            {msg.user.role === 'admin' && <span className="text-[8px] bg-ndp-accent/10 text-ndp-accent px-1 py-0.5 rounded">Admin</span>}
                          </div>
                        )}
                        <div className={clsx(
                          'px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words',
                          isMe ? 'bg-ndp-accent text-white rounded-br-md' : 'bg-ndp-surface-light text-ndp-text rounded-bl-md'
                        )}>
                          {msg.content}
                        </div>
                        {showMeta && (
                          <span className={clsx('text-[10px] text-ndp-text-dim mt-0.5 block', isMe ? 'text-right mr-1' : 'ml-1')}>
                            {formatTime(msg.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-5 py-3 border-t border-white/5">
              <div className="flex gap-2 items-center">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('messages.message_placeholder')}
                  className="input flex-1 text-sm rounded-full px-5"
                />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  aria-label={t('common.send')}
                  className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                    input.trim() ? 'bg-ndp-accent text-white hover:bg-ndp-accent-hover' : 'bg-white/5 text-ndp-text-dim'
                  )}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden sm:flex items-center justify-center card">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-ndp-text-dim mx-auto mb-3" />
              <p className="text-ndp-text-muted">{t('messages.select_ticket')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
