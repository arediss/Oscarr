export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId: number;
  tmdbId?: number;
  imdbId: string;
  titleSlug: string;
  monitored: boolean;
  status: string;
  path: string;
  qualityProfileId: number;
  seasonFolder: boolean;
  added?: string;
  tags: number[];
  seasons: SonarrSeason[];
  images: { coverType: string; remoteUrl: string }[];
  statistics: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrQueueItem {
  seriesId: number;
  episodeId: number;
  title: string;
  status: string;
  size: number;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string;
  downloadClient: string;
  episode?: {
    seasonNumber: number;
    episodeNumber: number;
    title: string;
  };
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc: string | null;
  hasFile: boolean;
  monitored: boolean;
  episodeFile?: {
    quality: { quality: { name: string } };
    size: number;
    languages?: { id: number; name: string }[];
  } | null;
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  languages?: { id: number; name: string }[];
  quality: { quality: { name: string } };
  size: number;
  mediaInfo?: {
    audioLanguages?: string;  // e.g. "Japanese / English" or "jpn"
    subtitles?: string;       // e.g. "French / English" or "fre"
  };
}

export interface SonarrHistoryRecord {
  seriesId: number;
  episodeId: number;
  date: string;
  eventType: string;
  episode?: {
    seasonNumber: number;
    episodeNumber: number;
    title: string;
  };
}
