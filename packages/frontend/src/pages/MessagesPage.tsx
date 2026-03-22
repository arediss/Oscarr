import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Plus,
  Hash,
  Lock,
  Megaphone,
  HeadphonesIcon,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface Channel {
  id: number;
  name: string;
  type: 'general' | 'announcements' | 'support';
  isPrivate: boolean;
  messageCount: number;
}

interface ChatMsg {
  id: number;
  channelId: number;
  userId: number;
  content: string;
  createdAt: string;
  user: { id: number; plexUsername: string; avatar: string | null; role: string };
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewSupport, setShowNewSupport] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/channels');
      setChannels(data);
      if (!activeChannel && data.length > 0) setActiveChannel(data[0]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    let cancelled = false;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/api/chat/ws`);
    wsRef.current = ws;
    ws.onopen = () => { if (cancelled) { ws.close(); return; } ws.send(JSON.stringify({ type: 'auth', token })); };
    ws.onmessage = (event) => {
      if (cancelled) return;
      const msg = JSON.parse(event.data);
      if (msg.type === 'auth_ok') { setWsConnected(true); return; }
      if (msg.type === 'message') {
        setMessages((prev) => [...prev, msg.data]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    };
    ws.onclose = () => { if (!cancelled) setWsConnected(false); };
    return () => { cancelled = true; ws.close(); };
  }, []);

  // Join channel
  useEffect(() => {
    if (!activeChannel || !wsConnected) return;
    wsRef.current?.send(JSON.stringify({ type: 'join', channelId: activeChannel.id }));
    setLoadingMsgs(true);
    api.get(`/chat/channels/${activeChannel.id}/messages`)
      .then(({ data }) => { setMessages(data); setTimeout(() => messagesEndRef.current?.scrollIntoView(), 50); })
      .catch(console.error)
      .finally(() => setLoadingMsgs(false));
  }, [activeChannel, wsConnected]);

  const sendMessage = () => {
    if (!input.trim() || !activeChannel) return;
    if (wsConnected && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'message', content: input.trim() }));
    } else {
      api.post(`/chat/channels/${activeChannel.id}/messages`, { content: input.trim() });
    }
    setInput('');
  };

  const createSupportTicket = async () => {
    if (!supportSubject.trim()) return;
    try {
      const { data } = await api.post('/chat/support', { subject: supportSubject.trim() });
      setSupportSubject(''); setShowNewSupport(false);
      await fetchChannels();
      setActiveChannel(data);
    } catch (err) { console.error(err); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const channelIcon = (ch: Channel) => {
    if (ch.type === 'support') return <HeadphonesIcon className="w-4 h-4" />;
    if (ch.type === 'announcements') return <Megaphone className="w-4 h-4" />;
    if (ch.isPrivate) return <Lock className="w-4 h-4" />;
    return <Hash className="w-4 h-4" />;
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-4rem)]"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-ndp-text">Messages</h1>
          <div className="flex items-center gap-1.5">
            <div className={clsx('w-2 h-2 rounded-full', wsConnected ? 'bg-ndp-success' : 'bg-ndp-danger')} />
            <span className="text-[10px] text-ndp-text-dim">{wsConnected ? 'En ligne' : 'Hors ligne'}</span>
          </div>
        </div>
        <button onClick={() => setShowNewSupport(!showNewSupport)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Support
        </button>
      </div>

      {/* Support ticket form */}
      {showNewSupport && (
        <div className="mb-4 p-4 card border border-ndp-accent/20 animate-slide-up">
          <p className="text-sm font-semibold text-ndp-text mb-2">Demande de support</p>
          <input value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)} placeholder="Décrivez votre problème..." className="input text-sm w-full mb-3" onKeyDown={(e) => e.key === 'Enter' && createSupportTicket()} autoFocus />
          <div className="flex gap-2">
            <button onClick={createSupportTicket} disabled={!supportSubject.trim()} className="btn-primary text-sm">Créer</button>
            <button onClick={() => setShowNewSupport(false)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </div>
      )}

      {/* Channel tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-1" style={{ scrollbarWidth: 'none' }}>
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setActiveChannel(ch)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-t-xl text-sm font-medium transition-all whitespace-nowrap border-b-2',
              activeChannel?.id === ch.id
                ? 'bg-ndp-surface border-ndp-accent text-ndp-accent'
                : 'bg-transparent border-transparent text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
            )}
          >
            {channelIcon(ch)}
            <span>{ch.name}</span>
          </button>
        ))}
      </div>

      {/* Chat area */}
      {activeChannel ? (
        <div className="flex-1 flex flex-col card rounded-t-none border-t-0 overflow-hidden min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {loadingMsgs ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-ndp-accent animate-spin" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 text-ndp-text-dim mx-auto mb-2" />
                <p className="text-sm text-ndp-text-dim">Commencez la conversation</p>
              </div>
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
                              {(msg.user.plexUsername || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <span className="text-xs font-medium text-ndp-text-muted">{msg.user.plexUsername}</span>
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
                placeholder={`Message dans #${activeChannel.name}...`}
                className="input flex-1 text-sm rounded-full px-5"
              />
              <button onClick={sendMessage} disabled={!input.trim()}
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                  input.trim() ? 'bg-ndp-accent text-white hover:bg-ndp-accent-hover' : 'bg-white/5 text-ndp-text-dim'
                )}>
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center card">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 text-ndp-text-dim mx-auto mb-3" />
            <p className="text-ndp-text-muted">Aucun canal disponible</p>
          </div>
        </div>
      )}
    </div>
  );
}
