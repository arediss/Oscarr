import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import MediaCard, { MediaCardSkeleton } from './MediaCard';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import type { TmdbMedia } from '@/types';

interface MediaRowProps {
  title: string;
  media: TmdbMedia[];
  loading?: boolean;
  href?: string;
}

export default function MediaRow({ title, media, loading, href }: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const statuses = useMediaStatus(media);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative group/row">
      <div className="flex items-center gap-2 mb-4 px-4 sm:px-8">
        <h2 className="text-xl font-bold text-ndp-text">{title}</h2>
        {href && (
          <Link
            to={href}
            className="flex items-center gap-1 text-ndp-text-dim hover:text-ndp-accent transition-colors group/link"
            title="Voir plus"
          >
            <ArrowRight className="w-5 h-5 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-20 w-12 bg-gradient-to-r from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-20 w-12 bg-gradient-to-l from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-4 sm:px-8 py-4 -my-4"
          style={{ scrollbarWidth: 'none', overflowY: 'visible', clipPath: 'inset(-100px 0)' }}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton key={i} />
              ))
            : media.map((item) => {
                const type = item.media_type || (item.title ? 'movie' : 'tv');
                return (
                  <MediaCard
                    key={`${type}-${item.id}`}
                    media={item}
                    className="w-[140px] sm:w-[160px] lg:w-[180px]"
                    availability={getStatusForMedia(statuses, item.id, type)}
                  />
                );
              })}
        </div>
      </div>
    </section>
  );
}
