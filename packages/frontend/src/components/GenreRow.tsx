import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface GenreItem {
  id: number;
  name: string;
  mediaType: 'movie' | 'tv';
}

const GENRE_GRADIENTS: Record<number, string> = {
  28: 'from-red-600 to-orange-500',
  12: 'from-emerald-600 to-teal-500',
  16: 'from-violet-600 to-purple-500',
  35: 'from-amber-500 to-yellow-400',
  80: 'from-slate-700 to-gray-600',
  99: 'from-teal-600 to-cyan-500',
  18: 'from-blue-700 to-indigo-600',
  10751: 'from-pink-500 to-rose-400',
  14: 'from-purple-700 to-fuchsia-500',
  36: 'from-amber-700 to-orange-600',
  27: 'from-red-800 to-red-600',
  10402: 'from-fuchsia-600 to-pink-500',
  9648: 'from-indigo-700 to-violet-600',
  10749: 'from-rose-600 to-pink-400',
  878: 'from-cyan-600 to-blue-500',
  53: 'from-gray-800 to-zinc-600',
  10752: 'from-stone-700 to-zinc-600',
  37: 'from-orange-700 to-amber-600',
  10759: 'from-red-600 to-orange-500',
  10762: 'from-pink-500 to-rose-400',
  10765: 'from-purple-700 to-fuchsia-500',
  10768: 'from-stone-700 to-zinc-600',
};

const DEFAULT_GRADIENT = 'from-ndp-accent to-purple-600';

// Deduplicated genre list - one card per genre name
// Genres shared by movie & TV use the movie ID (TMDB discover works with both)
export const ALL_GENRES: GenreItem[] = [
  { id: 28, name: 'Action', mediaType: 'movie' },
  { id: 12, name: 'Aventure', mediaType: 'movie' },
  { id: 16, name: 'Animation', mediaType: 'movie' },
  { id: 35, name: 'Comédie', mediaType: 'movie' },
  { id: 80, name: 'Crime', mediaType: 'movie' },
  { id: 99, name: 'Documentaire', mediaType: 'movie' },
  { id: 18, name: 'Drame', mediaType: 'movie' },
  { id: 10751, name: 'Familial', mediaType: 'movie' },
  { id: 14, name: 'Fantastique', mediaType: 'movie' },
  { id: 36, name: 'Histoire', mediaType: 'movie' },
  { id: 27, name: 'Horreur', mediaType: 'movie' },
  { id: 10402, name: 'Musique', mediaType: 'movie' },
  { id: 9648, name: 'Mystère', mediaType: 'movie' },
  { id: 10749, name: 'Romance', mediaType: 'movie' },
  { id: 878, name: 'Science-Fiction', mediaType: 'movie' },
  { id: 53, name: 'Thriller', mediaType: 'movie' },
  { id: 10752, name: 'Guerre', mediaType: 'movie' },
  { id: 37, name: 'Western', mediaType: 'movie' },
];

export default function GenreRow() {
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
      <h2 className="text-xl font-bold text-ndp-text mb-4 px-4 sm:px-8">Genres</h2>

      <div className="relative">
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

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-4 sm:px-8 pb-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {ALL_GENRES.map((genre) => {
            const gradient = GENRE_GRADIENTS[genre.id] || DEFAULT_GRADIENT;
            return (
              <Link
                key={genre.id}
                to={`/discover/${genre.mediaType}/genre/${genre.id}`}
                className="flex-shrink-0 group"
              >
                <div
                  className={`w-[180px] sm:w-[200px] h-[100px] sm:h-[110px] rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-xl`}
                >
                  <div className="absolute inset-0 bg-black/10" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

                  <span className="relative text-white font-bold text-base sm:text-lg text-center px-4 drop-shadow-lg">
                    {genre.name}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
