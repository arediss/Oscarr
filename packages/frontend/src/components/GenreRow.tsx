import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Genre {
  id: number;
  name: string;
}

const GENRE_GRADIENTS: Record<number, string> = {
  // Movie genres
  28: 'from-red-600 to-orange-500',       // Action
  12: 'from-emerald-600 to-teal-500',     // Aventure
  16: 'from-violet-600 to-purple-500',    // Animation
  35: 'from-amber-500 to-yellow-400',     // Comédie
  80: 'from-slate-700 to-gray-600',       // Crime
  99: 'from-teal-600 to-cyan-500',        // Documentaire
  18: 'from-blue-700 to-indigo-600',      // Drame
  10751: 'from-pink-500 to-rose-400',     // Familial
  14: 'from-purple-700 to-fuchsia-500',   // Fantastique
  36: 'from-amber-700 to-orange-600',     // Histoire
  27: 'from-red-800 to-red-600',          // Horreur
  10402: 'from-fuchsia-600 to-pink-500',  // Musique
  9648: 'from-indigo-700 to-violet-600',  // Mystère
  10749: 'from-rose-600 to-pink-400',     // Romance
  878: 'from-cyan-600 to-blue-500',       // Science-Fiction
  10770: 'from-gray-600 to-slate-500',    // Téléfilm
  53: 'from-gray-800 to-zinc-600',        // Thriller
  10752: 'from-stone-700 to-zinc-600',    // Guerre
  37: 'from-orange-700 to-amber-600',     // Western
  // TV genres
  10759: 'from-red-600 to-orange-500',    // Action & Adventure
  10762: 'from-pink-500 to-rose-400',     // Kids
  10763: 'from-blue-600 to-indigo-500',   // News
  10764: 'from-amber-600 to-yellow-500',  // Reality
  10765: 'from-purple-700 to-fuchsia-500', // Sci-Fi & Fantasy
  10766: 'from-rose-600 to-pink-400',     // Soap
  10767: 'from-teal-600 to-emerald-500',  // Talk
  10768: 'from-stone-700 to-zinc-600',    // War & Politics
};

const DEFAULT_GRADIENT = 'from-ndp-accent to-purple-600';

// TMDB genre lists
export const MOVIE_GENRES: Genre[] = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Aventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comédie' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentaire' },
  { id: 18, name: 'Drame' },
  { id: 10751, name: 'Familial' },
  { id: 14, name: 'Fantastique' },
  { id: 36, name: 'Histoire' },
  { id: 27, name: 'Horreur' },
  { id: 10402, name: 'Musique' },
  { id: 9648, name: 'Mystère' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science-Fiction' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'Guerre' },
  { id: 37, name: 'Western' },
];

export const TV_GENRES: Genre[] = [
  { id: 10759, name: 'Action & Aventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comédie' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentaire' },
  { id: 18, name: 'Drame' },
  { id: 10751, name: 'Familial' },
  { id: 10762, name: 'Enfants' },
  { id: 9648, name: 'Mystère' },
  { id: 10765, name: 'SF & Fantastique' },
  { id: 10768, name: 'Guerre & Politique' },
];

interface GenreRowProps {
  title: string;
  genres: Genre[];
  mediaType: 'movie' | 'tv';
}

export default function GenreRow({ title, genres, mediaType }: GenreRowProps) {
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
          {genres.map((genre) => {
            const gradient = GENRE_GRADIENTS[genre.id] || DEFAULT_GRADIENT;
            return (
              <Link
                key={genre.id}
                to={`/discover/${mediaType}/genre/${genre.id}`}
                className="flex-shrink-0 group"
              >
                <div
                  className={`w-[180px] sm:w-[200px] h-[100px] sm:h-[110px] rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-xl`}
                >
                  {/* Subtle pattern overlay */}
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
