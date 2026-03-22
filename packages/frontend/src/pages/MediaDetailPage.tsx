import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import { FolderOpen } from 'lucide-react';
import type { TmdbMedia, Media, RootFolder } from '@/types';

interface Props {
  type: 'movie' | 'tv';
}

export default function MediaDetailPage({ type }: Props) {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [media, setMedia] = useState<TmdbMedia | null>(null);
  const [dbMedia, setDbMedia] = useState<Media | null>(null);
  const [recommendations, setRecommendations] = useState<TmdbMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
  const [selectedRootFolder, setSelectedRootFolder] = useState('');
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

  useEffect(() => {
    setLoading(true);
    setMedia(null);
    setDbMedia(null);
    setSelectedSeasons([]);
    setSelectedRootFolder('');

    // Fetch root folders for admins
    if (user?.role === 'admin') {
      const endpoint = type === 'movie' ? '/admin/radarr/rootfolders' : '/admin/sonarr/rootfolders';
      api.get(endpoint).then(({ data }) => setRootFolders(data)).catch(() => {});
    }

    async function fetchData() {
      try {
        const [detailRes, recoRes] = await Promise.all([
          api.get(`/tmdb/${type}/${id}`),
          api.get(`/tmdb/${type}/${id}/recommendations`),
        ]);
        setMedia(detailRes.data);
        setRecommendations(recoRes.data.results?.map((r: TmdbMedia) => ({ ...r, media_type: type })) || []);

        // Check if media exists in our DB
        try {
          const { data } = await api.get(`/media/tmdb/${id}/${type}`);
          if (data.id) setDbMedia(data);
        } catch { /* not in DB yet */ }
      } catch (err) {
        console.error('Failed to fetch media details:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, type]);

  const handleRequest = async () => {
    if (!media) return;
    setRequesting(true);
    try {
      const body: Record<string, unknown> = { tmdbId: media.id, mediaType: type };
      if (type === 'tv' && selectedSeasons.length > 0) {
        body.seasons = selectedSeasons;
      }
      if (selectedRootFolder) {
        body.rootFolder = selectedRootFolder;
      }
      await api.post('/requests', body);
      // Refresh DB media state
      const { data } = await api.get(`/media/tmdb/${id}/${type}`);
      if (data.id) setDbMedia(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur';
      console.error('Request failed:', message);
    } finally {
      setRequesting(false);
    }
  };

  const isAvailable = dbMedia?.status === 'available';
  const isPartiallyAvailable = dbMedia?.status === 'processing' && type === 'tv';
  const isUpcoming = dbMedia?.status === 'upcoming';
  const isSearching = dbMedia?.status === 'searching';
  const userHasRequest = dbMedia?.requests?.some(
    (r) => r.user?.id === user?.id && ['pending', 'approved', 'processing'].includes(r.status)
  );

  const getStatusBadge = () => {
    if (isAvailable) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-ndp-success/10 text-ndp-success">Disponible</span>;
    }
    if (isUpcoming) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400">Prochainement</span>;
    }
    if (isSearching) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-ndp-accent/10 text-ndp-accent">Recherche en cours</span>;
    }
    if (isPartiallyAvailable) {
      return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-ndp-accent/10 text-ndp-accent">Partiellement disponible</span>;
    }
    if (!dbMedia?.requests?.length) return null;
    const latestRequest = dbMedia.requests[0];
    const statusMap: Record<string, { label: string; color: string }> = {
      pending: { label: 'En attente', color: 'bg-ndp-warning/10 text-ndp-warning' },
      approved: { label: 'Approuvé', color: 'bg-ndp-accent/10 text-ndp-accent' },
      declined: { label: 'Refusé', color: 'bg-ndp-danger/10 text-ndp-danger' },
      processing: { label: 'En cours', color: 'bg-blue-500/10 text-blue-400' },
      available: { label: 'Disponible', color: 'bg-ndp-success/10 text-ndp-success' },
      failed: { label: 'Échec', color: 'bg-ndp-danger/10 text-ndp-danger' },
    };
    const s = statusMap[latestRequest.status] || { label: latestRequest.status, color: 'bg-white/10 text-white' };
    return <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold', s.color)}>{s.label}</span>;
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
        <p className="text-ndp-text-muted">Média introuvable</p>
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
                  {media.vote_average.toFixed(1)} ({media.vote_count} votes)
                </span>
              )}
              {type === 'tv' && media.number_of_seasons && (
                <span className="flex items-center gap-1.5">
                  <Tv className="w-4 h-4" />
                  {media.number_of_seasons} saison{media.number_of_seasons > 1 ? 's' : ''}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Film className="w-4 h-4" />
                {type === 'movie' ? 'Film' : 'Série'}
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
              <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-2">Synopsis</h3>
              <p className="text-ndp-text leading-relaxed">{media.overview || 'Aucune description disponible.'}</p>
            </div>

            {/* Director */}
            {director && (
              <p className="mt-4 text-sm text-ndp-text-muted">
                Réalisé par <span className="text-ndp-text font-medium">{director.name}</span>
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
                  Bande-annonce
                </a>
              )}

              {isAvailable ? (
                <button disabled className="btn-success flex items-center gap-2 cursor-default">
                  <Check className="w-4 h-4" />
                  Disponible
                </button>
              ) : isUpcoming ? (
                <button disabled className="btn-secondary flex items-center gap-2 cursor-default opacity-60">
                  <Clock className="w-4 h-4" />
                  Prochainement
                </button>
              ) : isSearching ? (
                <button disabled className="btn-secondary flex items-center gap-2 cursor-default opacity-60">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recherche en cours
                </button>
              ) : userHasRequest ? (
                <button disabled className="btn-success flex items-center gap-2 cursor-default">
                  <Check className="w-4 h-4" />
                  Déjà demandé
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
                  {isPartiallyAvailable ? 'Demander le reste' : 'Demander'}
                </button>
              )}
            </div>

            {/* Season selection for TV */}
            {type === 'tv' && media.seasons && media.seasons.length > 0 && !userHasRequest && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-3">
                  Saisons à demander
                </h3>
                <div className="flex flex-wrap gap-2">
                  {/* All seasons button */}
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
                    Toutes les saisons
                  </button>
                  {media.seasons
                    .filter((s) => s.season_number > 0)
                    .map((season) => (
                      <button
                        key={season.season_number}
                        onClick={() =>
                          setSelectedSeasons((prev) =>
                            prev.includes(season.season_number)
                              ? prev.filter((s) => s !== season.season_number)
                              : [...prev, season.season_number]
                          )
                        }
                        className={clsx(
                          'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                          selectedSeasons.includes(season.season_number)
                            ? 'bg-ndp-accent text-white'
                            : 'bg-white/5 text-ndp-text-muted hover:bg-white/10'
                        )}
                      >
                        S{String(season.season_number).padStart(2, '0')}
                        <span className="text-xs ml-1 opacity-60">({season.episode_count} ép.)</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Root folder selector (admin or if folders available) */}
            {rootFolders.length > 1 && !userHasRequest && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-ndp-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  Dossier de destination
                </h3>
                <select
                  value={selectedRootFolder}
                  onChange={(e) => setSelectedRootFolder(e.target.value)}
                  className="input text-sm"
                >
                  <option value="">Par défaut</option>
                  {rootFolders.map((f) => (
                    <option key={f.path} value={f.path}>{f.path}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Cast */}
        {cast.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-bold text-ndp-text mb-4">Distribution</h3>
            <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
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
            <MediaRow title="Recommandations" media={recommendations} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
