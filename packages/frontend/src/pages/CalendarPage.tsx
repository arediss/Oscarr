import { useState, useEffect } from 'react';
import { Calendar, Film, Tv, Loader2, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { posterUrl } from '@/lib/api';
import { Link } from 'react-router-dom';

interface CalendarItem {
  type: 'movie' | 'episode';
  title: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  date: string;
  tmdbId?: number;
  tvdbId?: number;
  poster: string | null;
  hasFile?: boolean;
}

function extractPosterPath(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/t\/p\/\w+(\/.+?)(?:\?|$)/);
  return match ? match[1] : url.startsWith('http') ? url : null;
}

export default function CalendarPage() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    api.get(`/services/calendar?days=${days}`)
      .then(({ data }) => setItems(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  // Group by date
  const grouped = items.reduce<Record<string, CalendarItem[]>>((acc, item) => {
    const date = item.date ? new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date inconnue';
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  const isToday = (dateStr: string) => {
    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return dateStr === today;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-ndp-accent" />
          <h1 className="text-2xl font-bold text-ndp-text">Calendrier des sorties</h1>
        </div>
        <div className="flex items-center gap-2">
          {[14, 30, 60].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                days === d ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
              )}
            >
              {d}j
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-ndp-accent animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Calendar className="w-12 h-12 text-ndp-text-dim mx-auto mb-3" />
          <p className="text-ndp-text-muted">Aucune sortie prévue</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, dayItems]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className={clsx(
                  'text-sm font-semibold uppercase tracking-wider',
                  isToday(date) ? 'text-ndp-accent' : 'text-ndp-text-muted'
                )}>
                  {date}
                </h2>
                {isToday(date) && <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded-full font-semibold">Aujourd'hui</span>}
                <div className="flex-1 h-px bg-white/5" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dayItems.map((item, i) => {
                  const poster = extractPosterPath(item.poster);
                  const link = item.type === 'movie' && item.tmdbId ? `/movie/${item.tmdbId}` : null;

                  const content = (
                    <div className={clsx('card flex gap-3 p-3 transition-colors', link && 'hover:bg-ndp-surface-light/50')}>
                      {/* Poster */}
                      <div className="w-12 h-[72px] rounded-lg overflow-hidden bg-ndp-surface-light flex-shrink-0">
                        {poster ? (
                          <img src={posterUrl(poster, 'w92')} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-ndp-text-dim">
                            {item.type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {item.type === 'movie' ? (
                            <Film className="w-3 h-3 text-ndp-accent flex-shrink-0" />
                          ) : (
                            <Tv className="w-3 h-3 text-ndp-accent flex-shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-ndp-text truncate">{item.title}</span>
                        </div>
                        {item.type === 'episode' && (
                          <p className="text-xs text-ndp-text-muted truncate">
                            S{String(item.season).padStart(2, '0')}E{String(item.episode).padStart(2, '0')} - {item.episodeTitle}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-ndp-text-dim">
                            {new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {item.hasFile && (
                            <span className="flex items-center gap-0.5 text-[10px] text-ndp-success">
                              <CheckCircle className="w-3 h-3" /> Dispo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );

                  return link ? <Link key={i} to={link}>{content}</Link> : <div key={i}>{content}</div>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
