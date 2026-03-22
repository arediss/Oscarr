import { useState, useEffect } from 'react';
import { Calendar, Film, Tv, CheckCircle } from 'lucide-react';
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
      .then(({ data }) => {
        // Filter: only today and future
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        setItems(data.filter((item: CalendarItem) => new Date(item.date) >= now));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  // Group by date
  const grouped = items.reduce<Record<string, CalendarItem[]>>((acc, item) => {
    const d = new Date(item.date);
    const key = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const todayKey = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-ndp-accent" />
          <h1 className="text-2xl font-bold text-ndp-text">Prochaines sorties</h1>
        </div>
        <div className="flex items-center gap-2">
          {[14, 30, 60].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                days === d ? 'bg-ndp-accent text-white' : 'bg-ndp-surface text-ndp-text-muted hover:bg-ndp-surface-light'
              )}>
              {d}j
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-10">
          {[0, 1].map((s) => (
            <section key={s}>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-5 w-40 bg-ndp-surface-light rounded animate-pulse" />
                <div className="flex-1 h-px bg-white/5" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="rounded-xl overflow-hidden">
                    <div className="aspect-[2/3] bg-ndp-surface-light animate-pulse" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Calendar className="w-12 h-12 text-ndp-text-dim mx-auto mb-3" />
          <p className="text-ndp-text-muted">Aucune sortie prévue</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([date, dayItems]) => {
            const isToday = date === todayKey;
            return (
              <section key={date}>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className={clsx('text-base font-bold capitalize', isToday ? 'text-ndp-accent' : 'text-ndp-text')}>
                    {isToday ? "Aujourd'hui" : date}
                  </h2>
                  {isToday && <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-2 py-0.5 rounded-full font-semibold">{dayItems.length} sorties</span>}
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
                  {dayItems.map((item, i) => (
                    <CalendarCard key={i} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CalendarCard({ item }: { item: CalendarItem }) {
  const poster = extractPosterPath(item.poster);
  const link = item.type === 'movie' && item.tmdbId ? `/movie/${item.tmdbId}` : null;
  const isEpisode = item.type === 'episode';

  const inner = (
    <div className="group relative rounded-xl overflow-hidden transition-all duration-300 hover:scale-105 hover:z-10 hover:shadow-2xl hover:shadow-black/50">
      {/* Poster */}
      <div className="aspect-[2/3] bg-ndp-surface-light">
        {poster ? (
          <img src={posterUrl(poster, 'w342')} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ndp-text-dim">
            {item.type === 'movie' ? <Film className="w-10 h-10" /> : <Tv className="w-10 h-10" />}
          </div>
        )}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
        <h3 className="text-sm font-semibold text-white line-clamp-2 leading-tight">{item.title}</h3>
        {isEpisode && (
          <p className="text-xs text-ndp-text-muted mt-0.5">
            S{String(item.season).padStart(2, '0')}E{String(item.episode).padStart(2, '0')}
          </p>
        )}
        <span className="text-[10px] uppercase tracking-wider text-ndp-accent font-semibold mt-1">
          {item.type === 'movie' ? 'Film' : 'Série'}
        </span>
      </div>

      {/* Type badge */}
      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md p-1">
        {item.type === 'movie' ? <Film className="w-3 h-3 text-white/80" /> : <Tv className="w-3 h-3 text-white/80" />}
      </div>

      {/* Episode badge */}
      {isEpisode && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-1.5 h-5 flex items-center rounded-md">
          <span className="text-[11px] font-semibold text-white leading-none not-italic">S{String(item.season).padStart(2, '0')}E{String(item.episode).padStart(2, '0')}</span>
        </div>
      )}

      {/* Available badge */}
      {item.hasFile && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-ndp-success/80 px-1.5 h-5 rounded-md backdrop-blur-sm">
          <CheckCircle className="w-3 h-3 text-white" />
          <span className="text-[11px] font-semibold text-white leading-none">Dispo</span>
        </div>
      )}

      {/* Time */}
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-1.5 h-5 flex items-center rounded-md">
        <span className="text-[11px] font-medium text-white leading-none not-italic">
          {new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );

  return link ? <Link to={link}>{inner}</Link> : <div>{inner}</div>;
}
