import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Info, Star } from 'lucide-react';
import { backdropUrl } from '@/lib/api';
import MediaRow from '@/components/MediaRow';
import { PluginSlot } from '@/plugins/PluginSlot';
import GenreRow from '@/components/GenreRow';
import type { TmdbMedia } from '@/types';
import { dbMediaToTmdbShape } from '@/utils/mediaMapper';
import { useTmdbList } from '@/hooks/useTmdbList';
import { useHomepageLayout, type HomepageSection } from '@/hooks/useHomepageLayout';

/* ------------------------------------------------------------------ */
/*  Mapping builtinKey → endpoint + extra props                       */
/* ------------------------------------------------------------------ */

const BUILTIN_ENDPOINTS: Record<string, string> = {
  recently_added: '/media/recent?limit=20',
  trending: '/tmdb/trending',
  popular_movies: '/tmdb/movies/popular',
  popular_tv: '/tmdb/tv/popular',
  trending_anime: '/tmdb/tv/trending-anime',
  upcoming: '/tmdb/movies/upcoming',
};

const BUILTIN_HREF: Record<string, string> = {
  trending: '/category/trending',
  popular_movies: '/category/movies-popular',
  popular_tv: '/category/tv-popular',
  trending_anime: '/category/anime-trending',
  upcoming: '/category/movies-upcoming',
};

/* Force media_type for rows that need it */
const BUILTIN_MEDIA_TYPE: Record<string, string> = {
  popular_movies: 'movie',
  popular_tv: 'tv',
  trending_anime: 'tv',
  upcoming: 'movie',
};

const BUILTIN_TITLE_KEY: Record<string, string> = {
  recently_added: 'home.recently_added',
  trending: 'home.trending_week',
  popular_movies: 'home.popular_movies',
  popular_tv: 'home.popular_series',
  trending_anime: 'home.trending_anime',
  upcoming: 'home.coming_soon',
};

/* ------------------------------------------------------------------ */
/*  Sub-components for dynamic sections                               */
/* ------------------------------------------------------------------ */

function BuiltinSection({ builtinKey, title, size }: { builtinKey: string; title: string; size?: 'default' | 'large' }) {
  const { t } = useTranslation();
  const isRecent = builtinKey === 'recently_added';
  const endpoint = BUILTIN_ENDPOINTS[builtinKey] ?? null;

  const { data, loading } = useTmdbList<TmdbMedia>(endpoint, '', isRecent ? {
    transform: (d: any) => (d || []).map(dbMediaToTmdbShape),
  } : undefined);

  const displayTitle = title || t(BUILTIN_TITLE_KEY[builtinKey] ?? builtinKey);
  const href = BUILTIN_HREF[builtinKey];
  const mediaType = BUILTIN_MEDIA_TYPE[builtinKey];

  const items = mediaType ? data.map(m => ({ ...m, media_type: mediaType })) : data;

  /* recently_added: hide when empty & loaded (matches original behaviour) */
  if (isRecent && !loading && items.length === 0) return null;

  return (
    <MediaRow
      title={displayTitle}
      media={items}
      loading={loading}
      href={href}
      size={size ?? (builtinKey === 'trending' ? 'large' : 'default')}
    />
  );
}

function buildDiscoverUrl(query: NonNullable<HomepageSection['query']>): string {
  const params = new URLSearchParams();
  if (query.genres?.length) params.set('with_genres', query.genres.join(','));

  const dateGteField = query.mediaType === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte';
  const dateLteField = query.mediaType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte';

  if (query.releasedWithin) {
    const now = new Date();
    const lte = now.toISOString().split('T')[0];
    let gte: string;
    switch (query.releasedWithin) {
      case 'last_30d': gte = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]; break;
      case 'last_90d': gte = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0]; break;
      case 'last_6m': gte = new Date(now.getTime() - 180 * 86400000).toISOString().split('T')[0]; break;
      case 'last_1y': gte = new Date(now.getTime() - 365 * 86400000).toISOString().split('T')[0]; break;
      default: gte = lte;
    }
    params.set(dateGteField, gte);
    params.set(dateLteField, lte);
  } else {
    if (query.yearGte) params.set(dateGteField, `${query.yearGte}-01-01`);
    if (query.yearLte) params.set(dateLteField, `${query.yearLte}-12-31`);
  }

  if (query.voteAverageGte) params.set('vote_average.gte', String(query.voteAverageGte));
  if (query.voteCountGte) params.set('vote_count.gte', String(query.voteCountGte));
  if (query.sortBy) params.set('sort_by', query.sortBy);
  if (query.language) params.set('with_original_language', query.language);
  const qs = params.toString();
  return `/tmdb/discover/${query.mediaType}${qs ? `?${qs}` : ''}`;
}

function CustomSection({ query, title, size }: { query: NonNullable<HomepageSection['query']>; title: string; size?: 'default' | 'large' }) {
  const url = buildDiscoverUrl(query);
  const { data, loading } = useTmdbList<TmdbMedia>(url);
  return <MediaRow title={title} media={data} loading={loading} size={size} />;
}

function EndpointSection({ endpoint, title, size }: { endpoint: string; title: string; size?: 'default' | 'large' }) {
  const { data, loading } = useTmdbList<TmdbMedia>(endpoint);
  return <MediaRow title={title} media={data} loading={loading} size={size} />;
}

/* ------------------------------------------------------------------ */
/*  Hero carousel — identical rendering to original                   */
/* ------------------------------------------------------------------ */

function HeroCarousel({ trending, loading }: { trending: TmdbMedia[]; loading: boolean }) {
  const { t } = useTranslation();
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const prevHeroRef = useRef(0);
  const scrollFadeRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const fadeStart = 100;
    const fadeEnd = 500;
    const opacity = Math.min(1, Math.max(0, (scrollY - fadeStart) / (fadeEnd - fadeStart)));
    if (scrollFadeRef.current) scrollFadeRef.current.style.opacity = String(opacity);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const advanceHero = useCallback(() => {
    setHeroIndex((prev) => {
      prevHeroRef.current = prev;
      return (prev + 1) % Math.min(trending.length, 5);
    });
    setHeroVisible(true);
  }, [trending.length]);

  useEffect(() => {
    if (trending.length === 0) return;
    const interval = setInterval(() => {
      setHeroVisible(false);
      setTimeout(advanceHero, 500);
    }, 8000);
    return () => clearInterval(interval);
  }, [trending, advanceHero]);

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
    <>
      {/* Fixed hero backdrop */}
      <div className="fixed inset-0 h-screen z-0">
        {loading && <div className="w-full h-full bg-ndp-surface" />}
        {!loading && hero && (
          <>
            <div
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              style={{ opacity: heroVisible ? 1 : 0 }}
            >
              <img
                src={backdropUrl(hero.backdrop_path)}
                alt={heroTitle}
                className="w-full h-full object-cover object-top"
              />
            </div>
            {/* Base gradients */}
            <div className="absolute inset-0 bg-gradient-to-r from-ndp-bg via-ndp-bg/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-ndp-bg via-transparent to-ndp-bg/30" />
          </>
        )}
        {/* Scroll-driven fade to bg color */}
        <div
          ref={scrollFadeRef}
          className="absolute inset-0 bg-ndp-bg transition-none"
          style={{ opacity: 0 }}
        />
      </div>

      {/* Hero content area */}
      <div className="h-[70vh] min-h-[500px] flex flex-col justify-end pb-12 px-4 sm:px-8">
        {loading && (
          <div className="max-w-3xl">
            <div className="skeleton w-20 h-4 mb-3 rounded" />
            <div className="skeleton w-96 h-10 mb-3 rounded" />
            <div className="skeleton w-32 h-4 mb-4 rounded" />
            <div className="skeleton w-full max-w-lg h-12 mb-6 rounded" />
            <div className="skeleton w-32 h-10 rounded-xl" />
          </div>
        )}
        {!loading && hero && (
          <div className="max-w-3xl">
            <div
              className="transition-all duration-500 ease-out"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(16px)',
              }}
            >
              <span className="text-ndp-accent text-xs font-semibold uppercase tracking-widest mb-2 block">
                {t('home.trending_type', { type: heroType === 'movie' ? t('common.movie') : t('common.series') })}
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
                  {t('home.more_info')}
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
        )}
      </div>
    </>
  );
}

/* Hero section that owns its own data fetching */
function HeroSection() {
  const { data: trending, loading } = useTmdbList<TmdbMedia>('/tmdb/trending');
  return <HeroCarousel trending={trending} loading={loading} />;
}

/* ------------------------------------------------------------------ */
/*  Dynamic layout renderer                                           */
/* ------------------------------------------------------------------ */

function DynamicHomePage({ sections }: { sections: HomepageSection[] }) {
  const { t } = useTranslation();
  const enabledSections = sections.filter(s => s.enabled);

  return (
    <div className="min-h-screen">
      {/* Render hero if present (must be before scrollable content wrapper) */}
      {enabledSections.some(s => s.builtinKey === 'hero') && <HeroSection />}

      {/* Scrollable content */}
      <div className="relative z-10">
        {/* If hero is not enabled, add some top spacing */}
        {!enabledSections.some(s => s.builtinKey === 'hero') && <div className="h-8" />}

        {/* Content rows */}
        <div className="relative space-y-10 pb-16 pt-8">
          {enabledSections.map(section => {
            if (section.builtinKey === 'hero') return null; /* rendered above */
            if (section.builtinKey === 'genres') return <GenreRow key={section.id} />;
            if (section.type === 'custom' && section.endpoint) {
              return (
                <EndpointSection
                  key={section.id}
                  endpoint={section.endpoint}
                  title={t(section.title, section.title)}
                  size={section.size}
                />
              );
            }
            if (section.type === 'custom' && section.query) {
              return (
                <CustomSection
                  key={section.id}
                  query={section.query}
                  title={t(section.title, section.title)}
                  size={section.size}
                />
              );
            }
            if (section.builtinKey) {
              return (
                <BuiltinSection
                  key={section.id}
                  builtinKey={section.builtinKey}
                  title={t(section.title, section.title)}
                  size={section.size}
                />
              );
            }
            return null;
          })}
          {/* Plugin hook: home rows — always at the bottom */}
          <PluginSlot hookPoint="home.rows" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fallback: exact original hardcoded layout                         */
/* ------------------------------------------------------------------ */

function FallbackHomePage() {
  const { t } = useTranslation();
  const { data: recentlyAdded, loading: loadingRecent } = useTmdbList<TmdbMedia>('/media/recent?limit=20', '', {
    transform: (d) => (d || []).map(dbMediaToTmdbShape),
  });
  const { data: trending } = useTmdbList<TmdbMedia>('/tmdb/trending');
  const { data: popularMovies } = useTmdbList<TmdbMedia>('/tmdb/movies/popular');
  const { data: popularTv } = useTmdbList<TmdbMedia>('/tmdb/tv/popular');
  const { data: upcoming } = useTmdbList<TmdbMedia>('/tmdb/movies/upcoming');
  const { data: trendingAnime } = useTmdbList<TmdbMedia>('/tmdb/tv/trending-anime');
  const loading = loadingRecent;

  return (
    <div className="min-h-screen">
      <HeroCarousel trending={trending} loading={loading} />

      {/* Scrollable content */}
      <div className="relative z-10">
        {/* Content rows - passes over the hero */}
        <div className="relative space-y-10 pb-16 pt-8">
          {loading && (
            <MediaRow title={t('home.recently_added')} media={[]} loading={true} />
          )}
          {!loading && recentlyAdded.length > 0 && (
            <MediaRow title={t('home.recently_added')} media={recentlyAdded} />
          )}
          <MediaRow title={t('home.trending_week')} media={trending} loading={loading} href="/category/trending" size="large" />
          <MediaRow title={t('home.popular_movies')} media={popularMovies.map(m => ({ ...m, media_type: 'movie' }))} loading={loading} href="/category/movies-popular" />
          <MediaRow title={t('home.popular_series')} media={popularTv.map(m => ({ ...m, media_type: 'tv' }))} loading={loading} href="/category/tv-popular" />
          <MediaRow title={t('home.trending_anime')} media={trendingAnime.map(m => ({ ...m, media_type: 'tv' }))} loading={loading} href="/category/anime-trending" />
          <GenreRow />
          {/* Plugin hook: home rows */}
          <PluginSlot hookPoint="home.rows" />
          <MediaRow title={t('home.coming_soon')} media={upcoming.map(m => ({ ...m, media_type: 'movie' }))} loading={loading} href="/category/movies-upcoming" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const { sections, loading: layoutLoading } = useHomepageLayout();

  /* While fetching the layout config, show nothing (avoids flicker) */
  if (layoutLoading) {
    return (
      <div className="min-h-screen">
        <div className="fixed inset-0 h-screen z-0">
          <div className="w-full h-full bg-ndp-surface" />
        </div>
      </div>
    );
  }

  /* If layout config is unavailable, render exact original hardcoded layout */
  if (!sections) {
    return <FallbackHomePage />;
  }

  return <DynamicHomePage sections={sections} />;
}
