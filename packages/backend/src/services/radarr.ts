import axios, { type AxiosInstance } from 'axios';
import { getServiceConfig } from '../utils/services.js';

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
  added: string;
  tags: number[];
  images: { coverType: string; remoteUrl: string }[];
  digitalRelease?: string;
  physicalRelease?: string;
  inCinemas?: string;
  releaseDate?: string;
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

  constructor(url: string, apiKey: string) {
    this.api = axios.create({
      baseURL: `${url}/api/v3`,
      params: { apikey: apiKey },
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
    tags?: number[];
    monitored?: boolean;
    searchForMovie?: boolean;
  }): Promise<RadarrMovie> {
    const { data } = await this.api.post('/movie', {
      title: options.title,
      tmdbId: options.tmdbId,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      tags: options.tags ?? [],
      monitored: options.monitored ?? true,
      addOptions: {
        searchForMovie: options.searchForMovie ?? true,
      },
    });
    return data;
  }

  async getTags(): Promise<{ id: number; label: string }[]> {
    const { data } = await this.api.get('/tag');
    return data;
  }

  async createTag(label: string): Promise<{ id: number; label: string }> {
    const { data } = await this.api.post('/tag', { label });
    return data;
  }

  async getOrCreateTag(username: string): Promise<number> {
    const label = `ndp-${username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const tags = await this.getTags();
    const existing = tags.find((t) => t.label === label);
    if (existing) return existing.id;
    const created = await this.createTag(label);
    return created.id;
  }

  async getCalendar(start: string, end: string): Promise<RadarrMovie[]> {
    const { data } = await this.api.get('/calendar', { params: { start, end } });
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

let _radarr: RadarrService | null = null;
let _radarrConfigKey: string | null = null;

export async function getRadarrAsync(): Promise<RadarrService> {
  const config = await getServiceConfig('radarr');
  const url = config?.url || process.env.RADARR_URL || '';
  const apiKey = config?.apiKey || process.env.RADARR_API_KEY || '';
  const configKey = `${url}|${apiKey}`;
  if (!_radarr || _radarrConfigKey !== configKey) {
    _radarr = new RadarrService(url, apiKey);
    _radarrConfigKey = configKey;
  }
  return _radarr;
}

export function getRadarr(): RadarrService {
  if (!_radarr) {
    _radarr = new RadarrService(
      process.env.RADARR_URL || '',
      process.env.RADARR_API_KEY || '',
    );
  }
  return _radarr;
}
