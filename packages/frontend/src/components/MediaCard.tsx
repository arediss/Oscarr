import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { posterUrl } from '@/lib/api';
import type { TmdbMedia } from '@/types';
import { clsx } from 'clsx';

interface MediaCardProps {
  media: TmdbMedia;
  className?: string;
}

export default function MediaCard({ media, className }: MediaCardProps) {
  const title = media.title || media.name || 'Sans titre';
  const year = (media.release_date || media.first_air_date || '').slice(0, 4);
  const type = media.media_type || (media.title ? 'movie' : 'tv');
  const link = `/${type}/${media.id}`;

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
            <span className="text-4xl">🎬</span>
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

      {/* Badge rating always visible */}
      {media.vote_average > 0 && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
          <Star className="w-3 h-3 fill-ndp-gold text-ndp-gold" />
          <span className="text-xs font-medium text-white">{media.vote_average.toFixed(1)}</span>
        </div>
      )}
    </Link>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex-shrink-0 rounded-xl overflow-hidden">
      <div className="aspect-[2/3] skeleton" />
    </div>
  );
}
