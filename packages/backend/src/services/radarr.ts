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
  movieFile?: { dateAdded: string };
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

  async getHistory(since?: Date | null): Promise<RadarrHistoryRecord[]> {
    if (since) {
      const { data } = await this.api.get('/history/since', { params: { date: since.toISOString() } });
      return (Array.isArray(data) ? data : data.records ?? [])
        .filter((r: RadarrHistoryRecord) => r.eventType === 'downloadFolderImported');
    }
    // Paginated fetch — get enough records to cover the library
    const all: RadarrHistoryRecord[] = [];
    let page = 1;
    while (true) {
      try {
        const { data } = await this.api.get('/history', {
          params: { pageSize: 1000, page, sortKey: 'date', sortDirection: 'descending' },
        });
        const records: RadarrHistoryRecord[] = data.records ?? data;
        all.push(...records.filter(r => r.eventType === 'downloadFolderImported'));
        if (records.length < 1000) break;
        page++;
      } catch {
        console.warn(`[Radarr] History pagination failed at page ${page}, using ${all.length} records collected so far`);
        break;
      }
    }
    return all;
  }

  async getSystemStatus(): Promise<{ version: string }> {
    const { data } = await this.api.get('/system/status');
    return data;
  }
}

export interface RadarrHistoryRecord {
  movieId: number;
  date: string;
  eventType: string;
}

const _serviceCache = new Map<number, { instance: RadarrService; configKey: string }>();

/** Create a RadarrService from a service config object */
export function createRadarrFromConfig(config: Record<string, string>): RadarrService {
  return new RadarrService(config.url || '', config.apiKey || '');
}

/** Get a cached RadarrService for a specific service ID */
export function getRadarrForService(serviceId: number, config: Record<string, string>): RadarrService {
  const configKey = `${config.url}|${config.apiKey}`;
  const cached = _serviceCache.get(serviceId);
  if (cached && cached.configKey === configKey) return cached.instance;
  const instance = createRadarrFromConfig(config);
  _serviceCache.set(serviceId, { instance, configKey });
  return instance;
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
