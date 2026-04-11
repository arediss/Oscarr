import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Calendar, MapPin, Loader2, User } from 'lucide-react';
import api from '@/lib/api';
import MediaCard from '@/components/MediaCard';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import type { TmdbPerson, TmdbMedia } from '@/types';

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [person, setPerson] = useState<TmdbPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullBio, setShowFullBio] = useState(false);

  useEffect(() => {
    setLoading(true);
    setPerson(null);
    setShowFullBio(false);
    api.get(`/tmdb/person/${id}`).then(({ data }) => setPerson(data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const [showAllFilmo, setShowAllFilmo] = useState(false);
  const FILMO_INITIAL = 40;

  const allFilmography = useMemo(() =>
    person?.combined_credits?.cast
      ?.filter((c) => c.poster_path && (c.vote_count ?? 0) > 5)
      .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
      .map((c) => ({ ...c, media_type: c.media_type || (c.title ? 'movie' : 'tv') })) || [],
    [person],
  );

  const filmography = useMemo(
    () => showAllFilmo ? allFilmography : allFilmography.slice(0, FILMO_INITIAL),
    [showAllFilmo, allFilmography],
  );

  const statuses = useMediaStatus(filmography as TmdbMedia[]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-ndp-accent animate-spin" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ndp-text-muted">{t('media.not_found')}</p>
      </div>
    );
  }

  const age = person.birthday
    ? Math.floor((Date.now() - new Date(person.birthday).getTime()) / 31557600000)
    : null;

  const bioTruncated = person.biography && person.biography.length > 400 && !showFullBio;

  return (
    <div className="min-h-screen bg-ndp-bg">
      {/* Back button - same style as media detail */}
      <button onClick={() => navigate(-1)} className="fixed top-20 left-4 sm:left-8 z-20 p-2 glass rounded-xl hover:bg-white/10 transition-colors">
        <ArrowLeft className="w-5 h-5 text-white" />
      </button>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Profile section */}
        <div className="flex flex-col sm:flex-row gap-8">
          {/* Photo */}
          <div className="flex-shrink-0 w-48 mx-auto sm:mx-0">
            <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-ndp-surface-light shadow-2xl shadow-black/30">
              {person.profile_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w342${person.profile_path}`}
                  alt={person.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-ndp-surface-light to-ndp-bg">
                  <User className="w-16 h-16 text-ndp-text-dim/30" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-3xl font-bold text-ndp-text">{person.name}</h2>
            <p className="text-sm text-ndp-accent font-medium mt-1">{person.known_for_department}</p>

            <div className="flex flex-wrap gap-4 mt-4 text-sm text-ndp-text-muted">
              {person.birthday && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-ndp-text-dim" />
                  {new Date(person.birthday).toLocaleDateString()}
                  {age != null && !person.deathday && (
                    <span className="text-ndp-text-dim">({age} {t('person.years_old')})</span>
                  )}
                </span>
              )}
              {person.deathday && (
                <span className="flex items-center gap-1.5 text-ndp-text-dim">
                  † {new Date(person.deathday).toLocaleDateString()}
                </span>
              )}
              {person.place_of_birth && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-ndp-text-dim" />
                  {person.place_of_birth}
                </span>
              )}
            </div>

            {/* Biography */}
            {person.biography && (
              <div className="mt-6">
                <p className="text-sm text-ndp-text-muted leading-relaxed whitespace-pre-line">
                  {bioTruncated ? person.biography.slice(0, 400) + '...' : person.biography}
                </p>
                {person.biography.length > 400 && (
                  <button
                    onClick={() => setShowFullBio(!showFullBio)}
                    className="text-sm text-ndp-accent hover:text-ndp-accent/80 mt-2 transition-colors"
                  >
                    {showFullBio ? t('common.show_less') : t('common.show_more')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filmography */}
        {filmography.length > 0 && (
          <div className="mt-12">
            <h3 className="text-xl font-bold text-ndp-text mb-6">
              {t('person.filmography')}
              <span className="text-sm font-normal text-ndp-text-dim ml-2">({allFilmography.length})</span>
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {filmography.map((item, i) => {
                const type = item.media_type || (item.title ? 'movie' : 'tv');
                return (
                  <MediaCard
                    key={`${type}-${item.id}-${i}`}
                    media={item as TmdbMedia}
                    availability={getStatusForMedia(statuses, item.id, type)}
                    index={i}
                  />
                );
              })}
            </div>
            {!showAllFilmo && allFilmography.length > FILMO_INITIAL && (
              <button
                onClick={() => setShowAllFilmo(true)}
                className="mt-4 w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium text-ndp-text-muted hover:text-ndp-text transition-colors"
              >
                {t('common.show_more')} ({allFilmography.length - FILMO_INITIAL} {t('person.more_items')})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
