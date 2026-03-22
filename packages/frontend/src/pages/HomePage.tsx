import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Info, Star } from 'lucide-react';
import api from '@/lib/api';
import { backdropUrl } from '@/lib/api';
import MediaRow from '@/components/MediaRow';
import GenreRow from '@/components/GenreRow';
import type { TmdbMedia } from '@/types';

export default function HomePage() {
  const [recentlyAdded, setRecentlyAdded] = useState<TmdbMedia[]>([]);
  const [trending, setTrending] = useState<TmdbMedia[]>([]);
  const [popularMovies, setPopularMovies] = useState<TmdbMedia[]>([]);
  const [popularTv, setPopularTv] = useState<TmdbMedia[]>([]);
  const [upcoming, setUpcoming] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const prevHeroRef = useRef(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const [recentRes, trendingRes, moviesRes, tvRes, upcomingRes] = await Promise.all([
          api.get('/media/recent?limit=20'),
          api.get('/tmdb/trending'),
          api.get('/tmdb/movies/popular'),
          api.get('/tmdb/tv/popular'),
          api.get('/tmdb/movies/upcoming'),
        ]);
        // Map DB media to TmdbMedia shape for MediaRow
        setRecentlyAdded(recentRes.data.map((m: { tmdbId: number; mediaType: string; title: string; posterPath: string | null; backdropPath: string | null; releaseDate: string | null; voteAverage: number | null }) => ({
          id: m.tmdbId > 0 ? m.tmdbId : 0,
          title: m.mediaType === 'movie' ? m.title : undefined,
          name: m.mediaType === 'tv' ? m.title : undefined,
          poster_path: m.posterPath,
          backdrop_path: m.backdropPath,
          release_date: m.mediaType === 'movie' ? m.releaseDate : undefined,
          first_air_date: m.mediaType === 'tv' ? m.releaseDate : undefined,
          vote_average: m.voteAverage ?? 0,
          vote_count: 0,
          overview: '',
          media_type: m.mediaType,
        })));
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

  // Auto-rotate hero with crossfade
  useEffect(() => {
    if (trending.length === 0) return;
    const interval = setInterval(() => {
      setHeroVisible(false);
      setTimeout(() => {
        setHeroIndex((prev) => {
          prevHeroRef.current = prev;
          return (prev + 1) % Math.min(trending.length, 5);
        });
        setHeroVisible(true);
      }, 500);
    }, 8000);
    return () => clearInterval(interval);
  }, [trending]);

  const changeHero = (i: number) => {
    if (i === heroIndex) return;
    setHeroVisible(false);
    setTimeout(() => {
      prevHeroRef.current = heroIndex;
      setHeroIndex(i);
      setHeroVisible(true);
    }, 400);
  };

  const hero = trending[heroIndex];
  const heroTitle = hero?.title || hero?.name || '';
  const heroType = hero?.media_type || (hero?.title ? 'movie' : 'tv');

  return (
    <div className="min-h-screen">
      {/* Hero skeleton */}
      {loading && (
        <div className="relative h-[70vh] min-h-[500px] bg-ndp-surface">
          <div className="absolute inset-0 bg-gradient-to-r from-ndp-bg via-ndp-bg/80 to-transparent" />
          <div className="relative h-full flex flex-col justify-end pb-12 px-4 sm:px-8 max-w-3xl">
            <div className="skeleton w-20 h-4 mb-3 rounded" />
            <div className="skeleton w-96 h-10 mb-3 rounded" />
            <div className="skeleton w-32 h-4 mb-4 rounded" />
            <div className="skeleton w-full max-w-lg h-12 mb-6 rounded" />
            <div className="skeleton w-32 h-10 rounded-xl" />
          </div>
        </div>
      )}

      {/* Hero section */}
      {!loading && hero && (
        <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
          {/* Background image with crossfade */}
          <div className="absolute inset-0">
            <div
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              style={{ opacity: heroVisible ? 1 : 0 }}
            >
              <img
                src={backdropUrl(hero.backdrop_path)}
                alt={heroTitle}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-ndp-bg via-ndp-bg/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-ndp-bg via-transparent to-ndp-bg/30" />
          </div>

          {/* Hero content */}
          <div className="relative h-full flex flex-col justify-end pb-12 px-4 sm:px-8 max-w-3xl">
            <div
              className="transition-all duration-500 ease-out"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(16px)',
              }}
            >
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
                  onClick={() => changeHero(i)}
                  className={`h-2 rounded-full transition-all duration-500 ${
                    i === heroIndex ? 'bg-ndp-accent w-6' : 'bg-white/30 hover:bg-white/50 w-2'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content rows */}
      <div className="space-y-10 pb-16 -mt-8 relative z-10">
        {recentlyAdded.length > 0 && (
          <MediaRow title="Récemment ajoutés" media={recentlyAdded} />
        )}
        <MediaRow title="Tendances de la semaine" media={trending} loading={loading} href="/category/trending" />
        <MediaRow title="Films populaires" media={popularMovies.map(m => ({ ...m, media_type: 'movie' }))} loading={loading} href="/category/movies-popular" />
        <MediaRow title="Séries populaires" media={popularTv.map(m => ({ ...m, media_type: 'tv' }))} loading={loading} href="/category/tv-popular" />
        <GenreRow />
        <MediaRow title="Prochainement au cinéma" media={upcoming.map(m => ({ ...m, media_type: 'movie' }))} loading={loading} href="/category/movies-upcoming" />
      </div>
    </div>
  );
}
