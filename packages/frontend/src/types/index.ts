export interface User {
  id: number;
  email: string;
  plexUsername: string | null;
  avatar: string | null;
  role: 'admin' | 'user';
  hasPlexServerAccess?: boolean;
  subscriptionActive?: boolean;
  subscriptionEndDate?: string | null;
  lastPaymentDate?: string | null;
  createdAt?: string;
}

export interface AdminUser extends User {
  lastPaymentAmount?: number | null;
  requestCount?: number;
}

export interface AppSettings {
  id: number;
  defaultQualityProfile: number | null;
  defaultRootFolder: string | null;
  subscriptionPrice: number;
  subscriptionDuration: number;
  plexMachineId: string | null;
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
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  tagline?: string;
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
  approvedById: number | null;
  createdAt: string;
  updatedAt: string;
  media?: Media;
  user?: Pick<User, 'id' | 'plexUsername' | 'avatar'>;
  approvedBy?: Pick<User, 'id' | 'plexUsername'>;
}

export interface Message {
  id: number;
  userId: number;
  content: string;
  type: 'general' | 'announcement' | 'system';
  createdAt: string;
  updatedAt: string;
  user: Pick<User, 'id' | 'plexUsername' | 'avatar'> & { role: string };
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
