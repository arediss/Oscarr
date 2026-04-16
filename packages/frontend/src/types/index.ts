export interface UserProviderInfo {
  provider: string;
  username?: string | null;
  email?: string | null;
}

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  avatar: string | null;
  /** Role name — 'admin'/'user' are the built-in system roles; admins can create custom roles at runtime. */
  role: string;
  disabled?: boolean;
  providers?: UserProviderInfo[];
  createdAt?: string;
}

export interface AdminUser extends User {
  requestCount?: number;
}

export interface AuthProviderConfig {
  id: string;
  label: string;
  type: 'oauth' | 'credentials';
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface QualityProfile {
  id: number;
  name: string;
}

export interface TmdbCollectionRef {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbMedia {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  media_type?: string;
  lastEpisodeInfo?: { season: number; episode: number; title: string } | null;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  tagline?: string;
  belongs_to_collection?: TmdbCollectionRef | null;
  seasons?: TmdbSeason[];
  credits?: { cast: TmdbCast[]; crew: TmdbCrew[] };
  external_ids?: { imdb_id: string; tvdb_id: number };
  videos?: { results: TmdbVideo[] };
}

export interface TmdbSeason {
  id: number;
  season_number: number;
  episode_count: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string;
}

export interface TmdbCast {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrew {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbPerson {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  combined_credits: {
    cast: (TmdbMedia & { character: string; release_date?: string; first_air_date?: string })[];
  };
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  name: string;
}

export interface Media {
  id: number;
  tmdbId: number;
  tvdbId: number | null;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  genres: string | null;
  status: string;
  radarrId: number | null;
  sonarrId: number | null;
  contentRating: string | null;
  requests?: MediaRequest[];
  seasons?: Season[];
}

export interface Season {
  id: number;
  mediaId: number;
  seasonNumber: number;
  episodeCount: number;
  status: string;
}

export interface MediaRequest {
  id: number;
  mediaId: number;
  userId: number;
  status: 'pending' | 'approved' | 'declined' | 'processing' | 'available' | 'failed';
  mediaType: 'movie' | 'tv';
  seasons: string | null;
  rootFolder: string | null;
  qualityOptionId: number | null;
  approvedById: number | null;
  createdAt: string;
  updatedAt: string;
  media?: Media;
  user?: Pick<User, 'id' | 'displayName' | 'avatar'>;
  approvedBy?: Pick<User, 'id' | 'displayName'>;
  qualityOption?: { id: number; label: string } | null;
}

export interface QueueItem {
  movieId?: number;
  seriesId?: number;
  title: string;
  status: string;
  size: number;
  sizeLeft: number;
  timeLeft: string;
  estimatedCompletion: string;
  progress: number;
  episode?: {
    seasonNumber: number;
    episodeNumber: number;
    title: string;
  };
}
