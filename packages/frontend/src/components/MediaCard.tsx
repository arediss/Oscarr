import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, CheckCircle, Clock, Film, Tv, Search, CalendarClock, Plus, Loader2 } from 'lucide-react';
import { posterUrl } from '@/lib/api';
import { PluginSlot } from '@/plugins/PluginSlot';
import api from '@/lib/api';
import type { TmdbMedia } from '@/types';
import { clsx } from 'clsx';

interface MediaCardProps {
  media: TmdbMedia;
  className?: string;
  availability?: { status: string; requestStatus?: string } | null;
  index?: number;
}

function getMediaType(media: TmdbMedia): string {
  return media.media_type || (media.title ? 'movie' : 'tv');
}

export default function MediaCard({ media, className, availability, index = 0 }: MediaCardProps) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const delay = Math.min(index * 50, 400); // 50ms stagger, max 400ms
  const title = media.title || media.name || 'Sans titre';
  const year = (media.release_date || media.first_air_date || '').slice(0, 4);
  const type = media.media_type || (media.title ? 'movie' : 'tv');
  const link = `/${type}/${media.id}`;

  const statusBadge = getAvailabilityBadge(availability, type, t);

  const canRequest = !availability || (availability.status === 'unknown' && !availability.requestStatus);

  const handleRequest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (requesting || requested) return;
    setRequesting(true);
    try {
      await api.post('/requests', { tmdbId: media.id, mediaType: type });
      setRequested(true);
    } catch { /* already requested or error */ }
    finally { setRequesting(false); }
  };

  return (
    <Link
      to={link}
      className={clsx(
        'group relative flex-shrink-0 rounded-xl overflow-hidden transition-all duration-300 hover:scale-105 hover:z-10 hover:shadow-2xl hover:shadow-black/50',
        className
      )}
    >
      {/* Poster */}
      <div className="aspect-[2/3] bg-ndp-surface-light">
        {media.poster_path ? (
          <img
            src={posterUrl(media.poster_path, 'w342')}
            alt={title}
            className={clsx('w-full h-full object-cover transition-opacity duration-500 ease-out', loaded ? 'opacity-100' : 'opacity-0')}
            style={{ transitionDelay: loaded ? '0ms' : `${delay}ms` }}
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ndp-text-dim">
            <Film className="w-10 h-10" />
          </div>
        )}
      </div>

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
        <h3 className="text-sm font-semibold text-white line-clamp-2 leading-tight">{title}</h3>
        <div className="flex items-center gap-2 mt-1">
          {year && <span className="text-xs text-ndp-text-muted">{year}</span>}
          {media.vote_average > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-ndp-gold">
              <Star className="w-3 h-3 fill-ndp-gold" />
              {media.vote_average.toFixed(1)}
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-ndp-accent font-semibold mt-1">
          {type === 'movie' ? t('common.movie') : t('common.series')}
        </span>

        {/* Quick request button */}
        {canRequest && !requested && (
          <button
            onClick={handleRequest}
            className="absolute top-2 right-2 p-1.5 bg-ndp-accent rounded-full hover:bg-ndp-accent/80 transition-colors shadow-lg"
            title="Demander ce média"
          >
            {requesting ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Plus className="w-4 h-4 text-white" />}
          </button>
        )}
        {requested && (
          <div className="absolute top-2 right-2 p-1.5 bg-ndp-success rounded-full shadow-lg">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Plugin hook: card overlay */}
        <PluginSlot hookPoint="media.card.overlay" context={{ media, type, availability }} />
      </div>

      {/* Top-left: media type badge (hidden on hover) */}
      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md p-1 transition-opacity duration-300 group-hover:opacity-0">
        {type === 'movie' ? (
          <Film className="w-3 h-3 text-white/80" />
        ) : (
          <Tv className="w-3 h-3 text-white/80" />
        )}
      </div>

      {/* Top-right: rating (hidden on hover) */}
      {media.vote_average > 0 && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-md transition-opacity duration-300 group-hover:opacity-0">
          <Star className="w-3 h-3 fill-ndp-gold text-ndp-gold" />
          <span className="text-xs font-medium text-white">{media.vote_average.toFixed(1)}</span>
        </div>
      )}

      {/* Bottom-left: latest episode badge for TV */}
      {media.lastEpisodeInfo && type === 'tv' && (
        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-black/60 text-white backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-0">
          S{String(media.lastEpisodeInfo.season).padStart(2, '0')}E{String(media.lastEpisodeInfo.episode).padStart(2, '0')}
        </div>
      )}

      {/* Bottom-right: availability status (hidden on hover) */}
      {statusBadge && (
        <div className={clsx(
          'absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-0',
          statusBadge.bgClass
        )}>
          <statusBadge.icon className="w-3 h-3" />
          {statusBadge.label}
        </div>
      )}
    </Link>
  );
}

function getAvailabilityBadge(availability?: { status: string; requestStatus?: string } | null, mediaType?: string, t?: (key: string) => string) {
  if (!availability || availability.status === 'unknown') return null;

  if (availability.status === 'available') {
    return {
      label: t?.('status.available') ?? 'Available',
      icon: CheckCircle,
      bgClass: 'bg-ndp-success/80 text-white',
    };
  }

  if (availability.status === 'upcoming') {
    return {
      label: t?.('status.upcoming') ?? 'Upcoming',
      icon: CalendarClock,
      bgClass: 'bg-purple-600/80 text-white',
    };
  }

  if (availability.status === 'searching') {
    return {
      label: t?.('status.searching') ?? 'Searching',
      icon: Search,
      bgClass: 'bg-ndp-accent/80 text-white',
    };
  }

  // Only TV shows can be "partially available"
  if (availability.status === 'processing' && mediaType === 'tv') {
    return {
      label: t?.('status.partial') ?? 'Partial',
      icon: Clock,
      bgClass: 'bg-ndp-accent/80 text-white',
    };
  }

  if (availability.requestStatus === 'pending') {
    return {
      label: t?.('status.requested') ?? 'Requested',
      icon: Clock,
      bgClass: 'bg-ndp-warning/80 text-white',
    };
  }

  if (availability.requestStatus === 'approved') {
    return {
      label: t?.('status.processing') ?? 'Processing',
      icon: Clock,
      bgClass: 'bg-ndp-accent/80 text-white',
    };
  }

  return null;
}

export function MediaCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('flex-shrink-0 rounded-xl overflow-hidden', className || 'w-[140px] sm:w-[160px] lg:w-[180px]')}>
      <div className="aspect-[2/3] skeleton" />
      <div className="mt-2 space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
    </div>
  );
}
