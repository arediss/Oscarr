import axios, { type AxiosInstance } from 'axios';

export interface RadarrMovie {
  id: number;
  title: string;
  tmdbId: number;
  imdbId: string;
  titleSlug: string;
  monitored: boolean;
  hasFile: boolean;
  isAvailable: boolean;
  status: string;
  sizeOnDisk: number;
  path: string;
  qualityProfileId: number;
  images: { coverType: string; remoteUrl: string }[];
}

export interface RadarrQueueItem {
  movieId: number;
  title: string;
  status: string;
  size: number;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string;
  downloadClient: string;
}

class RadarrService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: `${process.env.RADARR_URL}/api/v3`,
      params: { apikey: process.env.RADARR_API_KEY },
    });
  }

  async getMovies(): Promise<RadarrMovie[]> {
    const { data } = await this.api.get('/movie');
    return data;
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    const { data } = await this.api.get(`/movie/${id}`);
    return data;
  }

  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const { data } = await this.api.get('/movie', { params: { tmdbId } });
    return data[0] ?? null;
  }

  async addMovie(options: {
    title: string;
    tmdbId: number;
    qualityProfileId: number;
    rootFolderPath: string;
    monitored?: boolean;
    searchForMovie?: boolean;
  }): Promise<RadarrMovie> {
    const { data } = await this.api.post('/movie', {
      title: options.title,
      tmdbId: options.tmdbId,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      monitored: options.monitored ?? true,
      addOptions: {
        searchForMovie: options.searchForMovie ?? true,
      },
    });
    return data;
  }

  async getQueue(): Promise<{ records: RadarrQueueItem[] }> {
    const { data } = await this.api.get('/queue', {
      params: { pageSize: 50, includeMovie: true },
    });
    return data;
  }

  async getQualityProfiles(): Promise<{ id: number; name: string }[]> {
    const { data } = await this.api.get('/qualityprofile');
    return data;
  }

  async getRootFolders(): Promise<{ id: number; path: string; freeSpace: number }[]> {
    const { data } = await this.api.get('/rootfolder');
    return data;
  }

  async getSystemStatus(): Promise<{ version: string }> {
    const { data } = await this.api.get('/system/status');
    return data;
  }
}

export const radarr = new RadarrService();
