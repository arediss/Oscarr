import { Link } from 'react-router-dom';
import { Star, CheckCircle, Clock, Film, Tv, Search, CalendarClock } from 'lucide-react';
import { posterUrl } from '@/lib/api';
import type { TmdbMedia } from '@/types';
import { clsx } from 'clsx';

interface MediaCardProps {
  media: TmdbMedia;
  className?: string;
  availability?: { status: string; requestStatus?: string } | null;
}

function getMediaType(media: TmdbMedia): string {
  return media.media_type || (media.title ? 'movie' : 'tv');
}

export default function MediaCard({ media, className, availability }: MediaCardProps) {
  const title = media.title || media.name || 'Sans titre';
  const year = (media.release_date || media.first_air_date || '').slice(0, 4);
  const type = media.media_type || (media.title ? 'movie' : 'tv');
  const link = `/${type}/${media.id}`;

  const statusBadge = getAvailabilityBadge(availability, type);

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
            className="w-full h-full object-cover"
            loading="lazy"
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
          {type === 'movie' ? 'Film' : 'Série'}
        </span>
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

function getAvailabilityBadge(availability?: { status: string; requestStatus?: string } | null, mediaType?: string) {
  if (!availability || availability.status === 'unknown') return null;

  if (availability.status === 'available') {
    return {
      label: 'Dispo',
      icon: CheckCircle,
      bgClass: 'bg-ndp-success/80 text-white',
    };
  }

  if (availability.status === 'upcoming') {
    return {
      label: 'Prochainement',
      icon: CalendarClock,
      bgClass: 'bg-purple-600/80 text-white',
    };
  }

  if (availability.status === 'searching') {
    return {
      label: 'Recherche',
      icon: Search,
      bgClass: 'bg-ndp-accent/80 text-white',
    };
  }

  // Only TV shows can be "partially available"
  if (availability.status === 'processing' && mediaType === 'tv') {
    return {
      label: 'Partiel',
      icon: Clock,
      bgClass: 'bg-ndp-accent/80 text-white',
    };
  }

  if (availability.requestStatus === 'pending') {
    return {
      label: 'Demandé',
      icon: Clock,
      bgClass: 'bg-ndp-warning/80 text-white',
    };
  }

  if (availability.requestStatus === 'approved') {
    return {
      label: 'En cours',
      icon: Clock,
      bgClass: 'bg-ndp-accent/80 text-white',
    };
  }

  return null;
}

export function MediaCardSkeleton() {
  return (
    <div className="flex-shrink-0 rounded-xl overflow-hidden">
      <div className="aspect-[2/3] skeleton" />
    </div>
  );
}
