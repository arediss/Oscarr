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
  X,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { posterUrl, backdropUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNsfwFilter } from '@/hooks/useNsfwFilter';
import MediaRow from '@/components/MediaRow';
import CollectionSection from '@/components/CollectionSection';
import { PluginSlot } from '@/plugins/PluginSlot';
import { useMediaDetailData } from '@/hooks/useMediaDetailData';
import { useMediaRequestActions } from '@/hooks/useMediaRequestActions';
import { useEpisodeModal } from '@/hooks/useEpisodeModal';
import type { TmdbMedia, Media } from '@/types';
import { ACTIVE_REQUEST_STATUSES } from '@/utils/requestStatus';

interface Props {
  type: 'movie' | 'tv';
}

export default function MediaDetailPage({ type }: Props) {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isNsfw, disableBlur } = useNsfwFilter();
  const [revealed, setRevealed] = useState(false);
  const [showNsfwModal, setShowNsfwModal] = useState(false);
  const [scrollOpacity, setScrollOpacity] = useState(0);

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

  const {
    media, dbMedia, sonarrSeasons, inLibrary, recommendations,
    loading, qualityOptions, activeQualityOptionIds,
    audioLanguages, subtitleLanguages, download, refreshDbData,
  } = useMediaDetailData(id, type);

  const {
    requesting, justRequested, requestError,
    selectedSeasons, setSelectedSeasons,
    selectedQuality, setSelectedQuality,
    searchMissingState, searchMissingError,
    handleRequest, handleSearchMissing,
    resetOnNavigation,
  } = useMediaRequestActions(media, id, type, refreshDbData);

  const {
    episodeModalOpen, openEpisodeModal, closeEpisodeModal,
    episodeCache, expandedSeason, loadingSeason, toggleSeason,
  } = useEpisodeModal(media?.id);

  // Reset local UI state on navigation
  useEffect(() => {
    setRevealed(false);
    setShowNsfwModal(false);
    resetOnNavigation();
  }, [id, type]);

  const isAvailable = dbMedia?.status === 'available' || inLibrary;
  const isPartiallyAvailable = !isAvailable && dbMedia?.status === 'processing' && type === 'tv';
  const isUpcoming = dbMedia?.status === 'upcoming';
  const isSearching = dbMedia?.status === 'searching';
  const isDownloading = !!download;
  const activeRequests = dbMedia?.requests?.filter(
    (r) => (ACTIVE_REQUEST_STATUSES as readonly string[]).includes(r.status)
  ) || [];
  const takenQualityIds = new Set<number>([
    ...activeRequests.map(r => r.qualityOptionId).filter(Boolean) as number[],
    ...activeQualityOptionIds,
  ]);
  const userHasRequest = activeRequests.some(r => r.user?.id === user?.id);
  const canRequestNewQuality = selectedQuality != null && !takenQualityIds.has(selectedQuality);

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

  const nsfw = !revealed && isNsfw(media.id);

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
          <img src={backdropUrl(media.backdrop_path)} alt="" className={clsx('w-full h-full object-cover', nsfw && 'blur-3xl scale-110')} />
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
            <div className="aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/10 relative">
              <img
                src={posterUrl(media.poster_path)}
                alt={title}
                className={clsx('w-full h-full object-cover', nsfw && 'blur-xl scale-110')}
              />
              {nsfw && (
                <button
                  onClick={() => setShowNsfwModal(true)}
                  className="absolute inset-0 flex items-center justify-center cursor-pointer group/nsfw"
                >
                  <div className="p-3 rounded-full bg-black/30 backdrop-blur-sm shadow-lg shadow-black/30 group-hover/nsfw:bg-black/50 transition-colors">
                    <EyeOff className="w-6 h-6 text-white/80 group-hover/nsfw:text-white transition-colors" />
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white">{title}</h1>

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

              {/* Plugin hook: media detail info */}
              <PluginSlot hookPoint="media.detail.info" context={{ media, type, dbMedia }} />
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

              {isAvailable && !canRequestNewQuality ? (
                <button disabled className="btn-success flex items-center gap-2 cursor-default">
                  <Check className="w-4 h-4" />
                  {t('status.available')}
                </button>
              ) : isAvailable && canRequestNewQuality ? (
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  className="btn-primary flex items-center gap-2"
                >
                  {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('media.request')}
                </button>
              ) : isDownloading ? (
                <button disabled className="relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-medium text-white cursor-default min-w-[180px]">
                  <div
                    className="absolute inset-0 bg-ndp-accent/80 transition-all duration-1000 ease-out"
                    style={{ width: `${download.progress}%` }}
                  />
                  <div className="absolute inset-0 bg-white/5" />
                  <div className="relative flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{Math.round(download.progress)}%</span>
                    {download.timeLeft && download.timeLeft !== '00:00:00' && (
                      <span className="text-xs opacity-70">— {download.timeLeft.replace(/^0+:?/, '')}</span>
                    )}
                  </div>
                </button>
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
              ) : canRequestNewQuality ? (
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
                  {t('media.request')}
                </button>
              ) : userHasRequest && !canRequestNewQuality && !isPartiallyAvailable ? (
                <button disabled className="btn-success flex items-center gap-2 cursor-default">
                  <Check className="w-4 h-4" />
                  {justRequested ? t('status.request_sent') : t('status.already_requested')}
                </button>
              ) : isPartiallyAvailable ? (
                searchMissingState === 'searching' ? (
                  <button disabled className="btn-success flex items-center gap-2 cursor-default">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('media.search_missing_in_progress')}
                  </button>
                ) : searchMissingState === 'error' ? (
                  <button disabled className="btn-danger flex items-center gap-2 cursor-default text-sm">
                    {searchMissingError}
                  </button>
                ) : (
                  <button
                    onClick={handleSearchMissing}
                    disabled={requesting}
                    className="btn-primary flex items-center gap-2"
                  >
                    {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t('media.request_rest')}
                  </button>
                )
              ) : (
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  className="btn-primary flex items-center gap-2"
                >
                  {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('media.request')}
                </button>
              )}

              {/* Request error message */}
              {requestError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-ndp-danger/10 border border-ndp-danger/20 text-ndp-danger text-sm animate-fade-in">
                  {requestError}
                </div>
              )}

              {/* Plugin hook: media detail actions */}
              <PluginSlot hookPoint="media.detail.actions" context={{ media, type, isAvailable, dbMedia }} />
            </div>

            {/* Quality selection */}
            {qualityOptions.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('media.quality')}</h3>
                <div className="flex flex-wrap gap-2">
                  {qualityOptions.map((q) => {
                    const isRequested = takenQualityIds.has(q.id);
                    const isSelected = selectedQuality === q.id;
                    return (
                      <button
                        key={q.id}
                        onClick={() => !isRequested && setSelectedQuality(prev => prev === q.id ? null : q.id)}
                        className={clsx(
                          'px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5',
                          isRequested
                            ? 'bg-ndp-success/10 text-ndp-success border border-ndp-success/20 cursor-default'
                            : isSelected
                              ? 'bg-ndp-accent text-white'
                              : 'bg-white/5 text-ndp-text-muted hover:bg-white/10'
                        )}
                      >
                        {isRequested && <Check className="w-3.5 h-3.5" />}
                        {q.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Audio & subtitle languages */}
            {(audioLanguages.length > 0 || subtitleLanguages.length > 0) && (
              <div className="mt-6 flex flex-wrap gap-6">
                {audioLanguages.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('media.audio_languages')}</h3>
                    <div className="flex flex-wrap gap-2">
                      {audioLanguages.map((lang) => (
                        <span key={lang} className="px-3 py-1.5 bg-white/5 rounded-xl text-sm font-medium text-ndp-text border border-white/5">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {subtitleLanguages.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">{t('media.subtitle_languages')}</h3>
                    <div className="flex flex-wrap gap-2">
                      {subtitleLanguages.map((lang) => (
                        <span key={lang} className="px-3 py-1.5 bg-white/5 rounded-xl text-sm font-medium text-ndp-text border border-white/5">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Seasons */}
            {type === 'tv' && media.seasons && media.seasons.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider">
                    {sonarrSeasons.length > 0 ? t('media.seasons') : t('media.seasons_to_request')}
                  </h3>
                  {sonarrSeasons.length > 0 && (
                    <button
                      onClick={openEpisodeModal}
                      className="text-xs text-ndp-accent hover:text-ndp-accent/80 transition-colors"
                    >
                      {t('media.more_details')}
                    </button>
                  )}
                </div>
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

      {/* Episode details modal */}
      {episodeModalOpen && media && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={closeEpisodeModal}>
          <div className="bg-ndp-bg rounded-2xl w-full max-w-2xl max-h-[85vh] mx-4 shadow-2xl shadow-black/60 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Hero header with backdrop */}
            <div className="relative flex-shrink-0">
              {media.backdrop_path && (
                <img src={backdropUrl(media.backdrop_path, 'w780')} alt="" className={clsx('w-full h-36 object-cover', nsfw && 'blur-3xl scale-110')} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ndp-bg via-ndp-bg/60 to-transparent" />
              {/* Close button -- top right */}
              <button onClick={closeEpisodeModal} className="absolute top-3 right-3 p-2 text-white/60 hover:text-white rounded-xl hover:bg-black/20 backdrop-blur-sm transition-colors">
                <X className="w-5 h-5" />
              </button>
              {/* Title + availability */}
              <div className="absolute bottom-0 left-0 right-0 px-6 pb-4">
                <h2 className="text-lg font-bold text-white drop-shadow-lg">{media.title || media.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-white/60">{t('media.episodes_overview')}</p>
                  {(() => {
                    const totalFiles = sonarrSeasons.reduce((sum, s) => sum + s.episodeFileCount, 0);
                    const totalEps = sonarrSeasons.reduce((sum, s) => sum + s.totalEpisodeCount, 0);
                    if (totalEps === 0) return null;
                    const pct = Math.round((totalFiles / totalEps) * 100);
                    return (
                      <span className={clsx(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        pct === 100 ? 'bg-ndp-success/20 text-ndp-success' :
                        pct > 0 ? 'bg-ndp-warning/20 text-ndp-warning' :
                        'bg-white/10 text-white/50'
                      )}>
                        {pct}% {t('media.available_short')}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Seasons -- collapsible, lazy loaded */}
            <div className="overflow-y-auto flex-1">
              {(media.seasons || []).filter(s => s.season_number > 0).map((season) => {
                const sonarrSeason = sonarrSeasons.find(ss => ss.seasonNumber === season.season_number);
                const isExpanded = expandedSeason === season.season_number;
                const isLoading = loadingSeason === season.season_number;
                const episodes = episodeCache[season.season_number];
                const dlCount = sonarrSeason?.episodeFileCount ?? 0;
                const totalCount = sonarrSeason?.totalEpisodeCount ?? season.episode_count;
                const isFull = dlCount === totalCount && totalCount > 0;

                return (
                  <div key={season.season_number} className={clsx(isExpanded && 'bg-white/[0.02]')}>
                    <button
                      onClick={() => toggleSeason(season.season_number)}
                      className="w-full flex items-center justify-between px-6 py-3 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-ndp-text">
                          {t('media.season_label', { number: season.season_number })}
                        </span>
                        <span className={clsx(
                          'text-[10px] px-2 py-0.5 rounded-full font-medium',
                          isFull ? 'bg-ndp-success/10 text-ndp-success' :
                          dlCount > 0 ? 'bg-ndp-warning/10 text-ndp-warning' :
                          'bg-white/5 text-ndp-text-dim'
                        )}>
                          {dlCount}/{totalCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLoading && <Loader2 className="w-3.5 h-3.5 text-ndp-accent animate-spin" />}
                        <svg className={clsx('w-4 h-4 text-ndp-text-dim transition-transform duration-200', isExpanded && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    <div className={clsx(
                      'ml-8 mr-3 border-l-2 border-white/10 transition-all duration-200 ease-out overflow-hidden',
                      isExpanded ? 'max-h-[5000px] opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0'
                    )}>
                    {isExpanded && (
                      <div>
                        {isLoading && !episodes ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="w-5 h-5 text-ndp-accent animate-spin" />
                          </div>
                        ) : episodes && episodes.length === 0 ? (
                          <p className="text-sm text-ndp-text-dim text-center py-4">{t('media.no_episodes')}</p>
                        ) : episodes ? (
                          <div className="py-1">
                            {episodes.map((ep) => {
                              const aired = ep.airDateUtc ? new Date(ep.airDateUtc) <= new Date() : false;
                              return (
                                <div key={ep.episodeNumber} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.03] transition-colors">
                                  <span className={clsx(
                                    'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                                    ep.hasFile ? 'bg-ndp-success/10 text-ndp-success' :
                                    !aired ? 'bg-white/5 text-ndp-text-dim' :
                                    'bg-ndp-danger/10 text-ndp-danger'
                                  )}>
                                    {ep.episodeNumber}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className={clsx('text-sm truncate', ep.hasFile ? 'text-ndp-text' : 'text-ndp-text-muted')}>
                                      {ep.title}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {ep.airDateUtc && (
                                        <span className="text-[10px] text-ndp-text-dim">
                                          {new Date(ep.airDateUtc).toLocaleDateString()}
                                        </span>
                                      )}
                                      {ep.quality && (
                                        <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-1.5 py-0.5 rounded">
                                          {ep.quality}
                                        </span>
                                      )}
                                      {ep.size && (
                                        <span className="text-[10px] text-ndp-text-dim">
                                          {(ep.size / 1073741824).toFixed(1)} GB
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {ep.hasFile ? (
                                    <Check className="w-4 h-4 text-ndp-success flex-shrink-0" />
                                  ) : !aired ? (
                                    <Calendar className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                                  ) : (
                                    <X className="w-4 h-4 text-ndp-danger flex-shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* NSFW reveal modal */}
      {showNsfwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNsfwModal(false)}>
          <div className="bg-ndp-bg rounded-2xl w-full max-w-sm mx-4 shadow-2xl shadow-black/60 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-500/10 rounded-xl">
                <ShieldAlert className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-ndp-text">{t('nsfw.modal.title')}</h3>
            </div>
            <p className="text-sm text-ndp-text-muted mb-6">
              {t('nsfw.modal.description', { rating: dbMedia?.contentRating || '' })}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setRevealed(true); setShowNsfwModal(false); }}
                className="w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 text-ndp-text text-sm font-medium rounded-xl transition-colors"
              >
                {t('nsfw.modal.show_once')}
              </button>
              <button
                onClick={() => { disableBlur(); setShowNsfwModal(false); }}
                className="w-full px-4 py-2.5 bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 text-sm font-medium rounded-xl transition-colors"
              >
                {t('nsfw.modal.show_always')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

