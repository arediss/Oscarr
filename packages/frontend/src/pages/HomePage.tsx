import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Info, Star } from 'lucide-react';
import api from '@/lib/api';
import { backdropUrl, posterUrl } from '@/lib/api';
import MediaRow from '@/components/MediaRow';
import GenreRow, { MOVIE_GENRES, TV_GENRES } from '@/components/GenreRow';
import type { TmdbMedia } from '@/types';

export default function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [trending, setTrending] = useState<TmdbMedia[]>([]);
  const [popularMovies, setPopularMovies] = useState<TmdbMedia[]>([]);
  const [popularTv, setPopularTv] = useState<TmdbMedia[]>([]);
  const [upcoming, setUpcoming] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const [trendingRes, moviesRes, tvRes, upcomingRes] = await Promise.all([
          api.get('/tmdb/trending'),
          api.get('/tmdb/movies/popular'),
          api.get('/tmdb/tv/popular'),
          api.get('/tmdb/movies/upcoming'),
        ]);
        setTrending(trendingRes.data.results);
        setPopularMovies(moviesRes.data.results);
        setPopularTv(tvRes.data.results);
        setUpcoming(upcomingRes.data.results);
      } catch (err) {
        console.error('Failed to fetch homepage data', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Auto-rotate hero
  useEffect(() => {
    if (trending.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(trending.length, 5));
    }, 8000);
    return () => clearInterval(interval);
  }, [trending]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const hero = trending[heroIndex];
  const heroTitle = hero?.title || hero?.name || '';
  const heroType = hero?.media_type || (hero?.title ? 'movie' : 'tv');

  return (
    <div className="min-h-screen">
      {/* Hero section */}
      {hero && (
        <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
          {/* Background image */}
          <div className="absolute inset-0">
            <img
              src={backdropUrl(hero.backdrop_path)}
              alt={heroTitle}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ndp-bg via-ndp-bg/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-ndp-bg via-transparent to-ndp-bg/30" />
          </div>

          {/* Hero content */}
          <div className="relative h-full flex flex-col justify-end pb-16 px-4 sm:px-8 max-w-3xl">
            {/* Search bar */}
            <form onSubmit={handleSearch} className="mb-8 max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ndp-text-dim" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un film, une série..."
                  className="w-full pl-12 pr-4 py-3.5 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-white placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/50 focus:border-ndp-accent transition-all text-sm"
                />
              </div>
            </form>

            <div className="animate-fade-in">
              <span className="text-ndp-accent text-xs font-semibold uppercase tracking-widest mb-2 block">
                {heroType === 'movie' ? 'Film' : 'Série'} tendance
              </span>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-3 leading-tight">
                {heroTitle}
              </h1>
              <div className="flex items-center gap-3 mb-4">
                {hero.vote_average > 0 && (
                  <span className="flex items-center gap-1 text-ndp-gold">
                    <Star className="w-4 h-4 fill-ndp-gold" />
                    <span className="font-semibold">{hero.vote_average.toFixed(1)}</span>
                  </span>
                )}
                <span className="text-ndp-text-muted text-sm">
                  {(hero.release_date || hero.first_air_date || '').slice(0, 4)}
                </span>
              </div>
              <p className="text-ndp-text-muted text-sm leading-relaxed line-clamp-3 max-w-lg mb-6">
                {hero.overview}
              </p>
              <div className="flex gap-3">
                <Link
                  to={`/${heroType}/${hero.id}`}
                  className="btn-primary flex items-center gap-2"
                >
                  <Info className="w-4 h-4" />
                  Plus d'infos
                </Link>
              </div>
            </div>

            {/* Hero dots */}
            <div className="flex gap-2 mt-6">
              {trending.slice(0, 5).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeroIndex(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === heroIndex ? 'bg-ndp-accent w-6' : 'bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content rows */}
      <div className="space-y-10 pb-16 -mt-8 relative z-10">
        <MediaRow title="Tendances de la semaine" media={trending} loading={loading} href="/category/trending" />
        <MediaRow title="Films populaires" media={popularMovies.map(m => ({ ...m, media_type: 'movie' }))} loading={loading} href="/category/movies-popular" />
        <GenreRow title="Genres Films" genres={MOVIE_GENRES} mediaType="movie" />
        <MediaRow title="Séries populaires" media={popularTv.map(m => ({ ...m, media_type: 'tv' }))} loading={loading} href="/category/tv-popular" />
        <GenreRow title="Genres Séries" genres={TV_GENRES} mediaType="tv" />
        <MediaRow title="Prochainement au cinéma" media={upcoming.map(m => ({ ...m, media_type: 'movie' }))} loading={loading} href="/category/movies-upcoming" />
      </div>
    </div>
  );
}
