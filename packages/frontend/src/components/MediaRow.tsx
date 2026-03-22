import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard, { MediaCardSkeleton } from './MediaCard';
import type { TmdbMedia } from '@/types';

interface MediaRowProps {
  title: string;
  media: TmdbMedia[];
  loading?: boolean;
}

export default function MediaRow({ title, media, loading }: MediaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
      <h2 className="text-xl font-bold text-ndp-text mb-4 px-4 sm:px-8">{title}</h2>

      <div className="relative">
        {/* Scroll buttons */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-ndp-bg to-transparent flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        {/* Scrollable row */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-8 pb-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton key={i} />
              ))
            : media.map((item) => (
                <MediaCard
                  key={`${item.media_type || 'media'}-${item.id}`}
                  media={item}
                  className="w-[140px] sm:w-[160px] lg:w-[180px]"
                />
              ))}
        </div>
      </div>
    </section>
  );
}
