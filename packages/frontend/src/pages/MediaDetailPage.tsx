import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Star,
  Calendar,
  Clock,
  Plus,
  Check,
  Loader2,
  ArrowLeft,
  Tv,
  Film,
  Play,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { posterUrl, backdropUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import MediaRow from '@/components/MediaRow';
import { useDownloadForMedia, useOnDownloadComplete } from '@/hooks/useDownloads';
import { invalidateMediaStatus } from '@/hooks/useMediaStatus';
import type { TmdbMedia, Media } from '@/types';

interface Props {
  type: 'movie' | 'tv';
}

export default function MediaDetailPage({ type }: Props) {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [media, setMedia] = useState<TmdbMedia | null>(null);
  const [dbMedia, setDbMedia] = useState<Media | null>(null);
  const [sonarrSeasons, setSonarrSeasons] = useState<{ seasonNumber: number; episodeFileCount: number; episodeCount: number; totalEpisodeCount: number }[]>([]);
  const [inLibrary, setInLibrary] = useState(false);
  const [recommendations, setRecommendations] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [scrollOpacity, setScrollOpacity] = useState(0);
  const [qualityOptions, setQualityOptions] = useState<{ id: number; label: string; position: number }[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null);

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const fadeStart = 70;
    const fadeEnd = 375;
    const opacity = Math.min(1, Math.max(0, (scrollY - fadeStart) / (fadeEnd - fadeStart)));
    setScrollOpacity(opacity);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const applyDbData = useCallback((data: Record<string, unknown>) => {
    if (data.id) setDbMedia(data as unknown as Media);
    if (data.sonarrSeasons) setSonarrSeasons(data.sonarrSeasons as typeof sonarrSeasons);
    if (data.inLibrary) setInLibrary(true);
    if (data.status === 'available' && !data.id) setInLibrary(true);
  }, []);

  useEffect(() => {
    api.get('/support/quality-options').then(({ data }) => setQualityOptions(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setMedia(null);
    setDbMedia(null);
    setSonarrSeasons([]);
    setInLibrary(false);
    setSelectedSeasons([]);
    setSelectedQuality(null);

    async function fetchData() {
      try {
        const [detailRes, recoRes] = await Promise.all([
          api.get(`/tmdb/${type}/${id}`),
          api.get(`/tmdb/${type}/${id}/recommendations`),
        ]);
        setMedia(detailRes.data);
        setRecommendations(recoRes.data.results?.map((r: TmdbMedia) => ({ ...r, media_type: type })) || []);

        // Check DB + live Radarr/Sonarr status
        try {
          const { data } = await api.get(`/media/tmdb/${id}/${type}`);
          applyDbData(data);
        } catch { /* not in DB yet */ }
      } catch (err) {
        console.error('Failed to fetch media details:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, type, applyDbData]);

  const handleRequest = async () => {
    if (!media) return;
    setRequesting(true);
    try {
      const body: Record<string, unknown> = { tmdbId: media.id, mediaType: type };
      if (type === 'tv' && selectedSeasons.length > 0) {
        body.seasons = selectedSeasons;
      }
      if (selectedQuality) {
        body.qualityOptionId = selectedQuality;
      }
      await api.post('/requests', body);
      // Invalidate badge cache so homepage updates without F5
      invalidateMediaStatus(media.id, type);
      // Refresh DB media state
      const { data } = await api.get(`/media/tmdb/${id}/${type}`);
      applyDbData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.error');
      console.error('Request failed:', message);
    } finally {
      setRequesting(false);
    }
  };

  const download = useDownloadForMedia(media?.id, type);

  // Auto-refresh when download completes (disappears from queue)
  useOnDownloadComplete(media?.id, () => {
    if (!id || !media) return;
    invalidateMediaStatus(media.id, type);
    api.get(`/media/tmdb/${id}/${type}`).then(({ data }) => applyDbData(data)).catch(() => {});
  });

  const isAvailable = dbMedia?.status === 'available' || inLibrary;
  const isPartiallyAvailable = !isAvailable && dbMedia?.status === 'processing' && type === 'tv';
  const isUpcoming = dbMedia?.status === 'upcoming';
  const isSearching = dbMedia?.status === 'searching';
  const isDownloading = !!download;
  const userHasRequest = dbMedia?.requests?.some(
    (r) => r.user?.id === user?.id && ['pending', 'approved', 'processing'].includes(r.status)
  );

  const formatTimeLeft = (tl: string) => {
    if (!tl) return '';
    const m = tl.match(/(\d+):(\d+):(\d+)/);
    if (!m) return tl;
    const [, h, min] = m;
    if (parseInt(h) > 0) return `~${parseInt(h)}h${min}min`;
    return `~${parseInt(min)}min`;
  };

  const getStatusBadge = () => {
    if (isAvailable) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-ndp-success/10 text-ndp-success">{t('status.available')}</span>;
    }
    if (isDownloading) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('status.downloading', { progress: download.progress })}
          {download.timeLeft && <span className="opacity-70">· {formatTimeLeft(download.timeLeft)}</span>}
        </span>
      );
    }
    if (isUpcoming) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400">{t('status.upcoming')}</span>;
    }
    if (isSearching) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-ndp-accent/10 text-ndp-accent">{t('status.searching_long')}</span>;
    }
    if (isPartiallyAvailable) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-ndp-accent/10 text-ndp-accent">{t('status.partially_available')}</span>;
    }
    if (!dbMedia?.requests?.length) return null;
    const latestRequest = dbMedia.requests[0];
    const statusMap: Record<string, { color: string }> = {
      pending: { color: 'bg-ndp-warning/10 text-ndp-warning' },
      approved: { color: 'bg-ndp-accent/10 text-ndp-accent' },
      declined: { color: 'bg-ndp-danger/10 text-ndp-danger' },
      processing: { color: 'bg-blue-500/10 text-blue-400' },
      available: { color: 'bg-ndp-success/10 text-ndp-success' },
      failed: { color: 'bg-ndp-danger/10 text-ndp-danger' },
    };
    const s = statusMap[latestRequest.status] || { color: 'bg-white/10 text-white' };
    return <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold', s.color)}>{t(`status.${latestRequest.status}`)}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-ndp-accent animate-spin" />
      </div>
    );
  }

  if (!media) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ndp-text-muted">{t('media.not_found')}</p>
      </div>
    );
  }

  const title = media.title || media.name || '';
  const year = (media.release_date || media.first_air_date || '').slice(0, 4);
  const genres = media.genres?.map((g) => g.name).join(', ');
  const trailer = media.videos?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
  const cast = media.credits?.cast?.slice(0, 12) || [];
  const director = media.credits?.crew?.find((c) => c.job === 'Director');

  return (
    <div className="min-h-screen">
      {/* Fixed backdrop */}
      <div className="fixed inset-0 h-screen z-0">
        {media.backdrop_path ? (
          <img src={backdropUrl(media.backdrop_path)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-ndp-surface" />
        )}
        {/* Base gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-ndp-bg via-ndp-bg/40 to-ndp-bg/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-ndp-bg/70 to-transparent" />
        {/* Scroll-driven fade to bg color */}
        <div
          className="absolute inset-0 bg-ndp-bg transition-none"
          style={{ opacity: scrollOpacity }}
        />
      </div>

      {/* Back button - fixed */}
      <Link to="/" className="fixed top-20 left-4 sm:left-8 z-20 p-2 glass rounded-xl hover:bg-white/10 transition-colors">
        <ArrowLeft className="w-5 h-5 text-white" />
      </Link>

      {/* Scrollable content */}
      <div className="relative z-10 pt-[35vh] min-h-screen">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="flex-shrink-0 w-48 sm:w-56 mx-auto md:mx-0">
            <div className="aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <img
                src={posterUrl(media.poster_path)}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white">{title}</h1>
              {getStatusBadge()}
            </div>

            {media.tagline && (
              <p className="text-ndp-text-muted italic mt-2">{media.tagline}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-ndp-text-muted">
              {year && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {year}
                </span>
              )}
              {media.runtime && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {Math.floor(media.runtime / 60)}h{String(media.runtime % 60).padStart(2, '0')}
                </span>
              )}
              {media.vote_average > 0 && (
                <span className="flex items-center gap-1.5 text-ndp-gold">
                  <Star className="w-4 h-4 fill-ndp-gold" />
                  {media.vote_average.toFixed(1)} ({media.vote_count} {t('media.votes')})
                </span>
              )}
              {type === 'tv' && media.number_of_seasons && (
                <span className="flex items-center gap-1.5">
                  <Tv className="w-4 h-4" />
                  {t('media.season', { count: media.number_of_seasons })}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Film className="w-4 h-4" />
                {type === 'movie' ? t('common.movie') : t('common.series')}
              </span>
            </div>

            {genres && (
              <div className="flex flex-wrap gap-2 mt-4">
                {genres.split(', ').map((g) => (
                  <span key={g} className="px-3 py-1 bg-white/5 rounded-full text-xs font-medium text-ndp-text-muted">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Synopsis */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-2">{t('media.synopsis')}</h3>
              <p className="text-ndp-text leading-relaxed">{media.overview || t('media.no_description')}</p>
            </div>

            {/* Director */}
            {director && (
              <p className="mt-4 text-sm text-ndp-text-muted">
                {t('media.directed_by', { name: director.name })}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 mt-8">
              {trailer && (
                <a
                  href={`https://www.youtube.com/watch?v=${trailer.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {t('media.trailer')}
                </a>
              )}

              {isAvailable ? (
                <button disabled className="btn-success flex items-center gap-2 cursor-default">
                  <Check className="w-4 h-4" />
                  {t('status.available')}
                </button>
              ) : isDownloading ? (
                <div className="flex items-center gap-3">
                  <button disabled className="btn-secondary flex items-center gap-2 cursor-default">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('status.downloading_long')}
                  </button>
                  <div className="flex-1 min-w-[120px] max-w-[200px]">
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${download.progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : isUpcoming ? (
                <button disabled className="btn-secondary flex items-center gap-2 cursor-default opacity-60">
                  <Clock className="w-4 h-4" />
                  {t('status.upcoming')}
                </button>
              ) : isSearching ? (
                <button disabled className="btn-secondary flex items-center gap-2 cursor-default opacity-60">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('status.searching_long')}
                </button>
              ) : userHasRequest ? (
                <button disabled className="btn-success flex items-center gap-2 cursor-default">
                  <Check className="w-4 h-4" />
                  {t('status.already_requested')}
                </button>
              ) : (
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  className="btn-primary flex items-center gap-2"
                >
                  {requesting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {isPartiallyAvailable ? t('media.request_rest') : t('media.request')}
                </button>
              )}
            </div>

            {/* Quality selection */}
            {qualityOptions.length > 0 && !isAvailable && !userHasRequest && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('media.quality')}</h3>
                <div className="flex flex-wrap gap-2">
                  {qualityOptions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setSelectedQuality(prev => prev === q.id ? null : q.id)}
                      className={clsx(
                        'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                        selectedQuality === q.id
                          ? 'bg-ndp-accent text-white'
                          : 'bg-white/5 text-ndp-text-muted hover:bg-white/10'
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seasons */}
            {type === 'tv' && media.seasons && media.seasons.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">
                  {sonarrSeasons.length > 0 ? t('media.seasons') : t('media.seasons_to_request')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {/* All seasons button (only if can request) */}
                  {!isAvailable && !userHasRequest && (
                    <button
                      onClick={() => {
                        const allNums = media.seasons!.filter(s => s.season_number > 0).map(s => s.season_number);
                        setSelectedSeasons(prev =>
                          prev.length === allNums.length ? [] : allNums
                        );
                      }}
                      className={clsx(
                        'px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                        selectedSeasons.length === media.seasons.filter(s => s.season_number > 0).length
                          ? 'bg-ndp-accent text-white'
                          : 'bg-white/5 text-ndp-text-muted hover:bg-white/10 border border-dashed border-white/10'
                      )}
                    >
                      {t('media.all_seasons')}
                    </button>
                  )}
                  {media.seasons
                    .filter((s) => s.season_number > 0)
                    .map((season) => {
                      const sonarrSeason = sonarrSeasons.find((ss) => ss.seasonNumber === season.season_number);
                      const hasStats = !!sonarrSeason;
                      const fileCount = sonarrSeason?.episodeFileCount ?? 0;
                      const totalCount = sonarrSeason?.totalEpisodeCount ?? season.episode_count;
                      const isFull = hasStats && fileCount >= totalCount && totalCount > 0;
                      const isPartial = hasStats && fileCount > 0 && fileCount < totalCount;
                      const isEmpty = !hasStats || fileCount === 0;
                      const canSelect = !isFull && !userHasRequest;

                      return (
                        <button
                          key={season.season_number}
                          onClick={() => canSelect && setSelectedSeasons((prev) =>
                            prev.includes(season.season_number)
                              ? prev.filter((s) => s !== season.season_number)
                              : [...prev, season.season_number]
                          )}
                          className={clsx(
                            'px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2',
                            selectedSeasons.includes(season.season_number)
                              ? 'bg-ndp-accent text-white'
                              : isFull
                                ? 'bg-ndp-success/10 text-ndp-success border border-ndp-success/20 cursor-default'
                                : isPartial
                                  ? 'bg-ndp-warning/10 text-ndp-warning border border-ndp-warning/20 hover:bg-ndp-warning/20'
                                  : 'bg-white/5 text-ndp-text-muted hover:bg-white/10'
                          )}
                        >
                          S{String(season.season_number).padStart(2, '0')}
                          <span className="text-xs opacity-60">
                            {hasStats ? `${fileCount}/${totalCount}` : `${season.episode_count} ${t('media.episodes_short')}`}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Collection */}
        {type === 'movie' && media.belongs_to_collection && (
          <CollectionSection collection={media.belongs_to_collection} />
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-bold text-ndp-text mb-4">{t('media.casting')}</h3>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {cast.map((person) => (
                <div key={person.id} className="flex-shrink-0 w-28 text-center">
                  <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-ndp-surface-light mb-2">
                    {person.profile_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                        alt={person.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ndp-text-dim text-xl">
                        {person.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-ndp-text truncate">{person.name}</p>
                  <p className="text-[10px] text-ndp-text-dim truncate">{person.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mt-12 pb-16">
            <MediaRow title={t('media.recommendations')} media={recommendations} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function CollectionSection({ collection }: { collection: { id: number; name: string; poster_path: string | null } }) {
  const { t } = useTranslation();
  const [parts, setParts] = useState<TmdbMedia[]>([]);
  const [statuses, setStatuses] = useState<Record<string, { status: string; requestStatus?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [result, setResult] = useState<{ requested: number; skipped: number; total: number } | null>(null);

  useEffect(() => {
    api.get(`/tmdb/collection/${collection.id}`)
      .then(async ({ data }) => {
        const movies = data.parts?.map((p: TmdbMedia) => ({ ...p, media_type: 'movie' })) || [];
        setParts(movies);
        // Batch check availability
        if (movies.length > 0) {
          try {
            const { data: statusData } = await api.post('/media/batch-status', {
              ids: movies.map((m: TmdbMedia) => ({ tmdbId: m.id, mediaType: 'movie' })),
            });
            setStatuses(statusData);
          } catch { /* ignore */ }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [collection.id]);

  const requestAll = async () => {
    setRequesting(true);
    try {
      const { data } = await api.post('/requests/collection', { collectionId: collection.id });
      setResult(data);
    } catch (err) { console.error(err); }
    finally { setRequesting(false); }
  };

  const availableCount = parts.filter((p) => statuses[`movie:${p.id}`]?.status === 'available').length;
  const totalCount = parts.length;
  const allAvailable = totalCount > 0 && availableCount === totalCount;
  const someAvailable = availableCount > 0 && availableCount < totalCount;

  const buttonLabel = result
    ? t('media.requested_count', { requested: result.requested, skipped: result.skipped })
    : allAvailable
    ? t('media.collection_complete')
    : someAvailable
    ? t('media.complete_collection', { count: totalCount - availableCount })
    : t('media.request_collection');

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-bold text-ndp-text truncate">{collection.name}</h3>
          {!loading && (
            <span className="text-xs text-ndp-text-dim flex-shrink-0">{availableCount}/{totalCount}</span>
          )}
        </div>
        {!allAvailable && (
          <button onClick={requestAll} disabled={requesting || !!result || allAvailable}
            className={clsx('text-sm flex items-center gap-2 flex-shrink-0',
              result ? 'btn-success cursor-default' : someAvailable ? 'btn-secondary' : 'btn-primary'
            )}>
            {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : result ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {buttonLabel}
          </button>
        )}
        {allAvailable && (
          <span className="btn-success cursor-default text-sm flex items-center gap-2 flex-shrink-0">
            <Check className="w-4 h-4" /> {t('media.collection_complete')}
          </span>
        )}
      </div>
      {!loading && parts.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {parts.map((movie) => {
            const status = statuses[`movie:${movie.id}`];
            const isAvail = status?.status === 'available';
            return (
              <Link key={movie.id} to={`/movie/${movie.id}`} className="flex-shrink-0 w-[120px] group">
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-ndp-surface-light mb-1.5 relative">
                  {movie.poster_path ? (
                    <img src={posterUrl(movie.poster_path, 'w185')} alt="" className={clsx('w-full h-full object-cover group-hover:scale-105 transition-transform', !isAvail && status && 'opacity-50')} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-ndp-text-dim" /></div>
                  )}
                  {isAvail && (
                    <div className="absolute top-1.5 right-1.5 bg-ndp-success/80 rounded-full p-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {status && !isAvail && status.status !== 'unknown' && (
                    <div className="absolute top-1.5 right-1.5 bg-ndp-warning/80 rounded-full p-0.5">
                      <Plus className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-ndp-text-muted truncate">{movie.title}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
