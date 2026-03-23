import axios, { type AxiosInstance } from 'axios';
import { getServiceConfig } from '../utils/services.js';

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

class SonarrService {
  private api: AxiosInstance;

  constructor(url: string, apiKey: string) {
    this.api = axios.create({
      baseURL: `${url}/api/v3`,
      params: { apikey: apiKey },
    });
  }

  async getSeries(): Promise<SonarrSeries[]> {
    const { data } = await this.api.get('/series');
    return data;
  }

  async getSeriesById(id: number): Promise<SonarrSeries> {
    const { data } = await this.api.get(`/series/${id}`);
    return data;
  }

  async getSeriesByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    const { data } = await this.api.get('/series', { params: { tvdbId } });
    return data[0] ?? null;
  }

  async addSeries(options: {
    title: string;
    tvdbId: number;
    qualityProfileId: number;
    rootFolderPath: string;
    seasons: number[];
    seriesType?: 'standard' | 'anime' | 'daily';
    tags?: number[];
    monitored?: boolean;
    searchForMissingEpisodes?: boolean;
  }): Promise<SonarrSeries> {
    const lookupData = await this.lookupByTvdbId(options.tvdbId);
    if (!lookupData) throw new Error(`Series not found on TVDB: ${options.tvdbId}`);

    const seasons = lookupData.seasons.map((s: SonarrSeason) => ({
      seasonNumber: s.seasonNumber,
      monitored: options.seasons.includes(s.seasonNumber),
    }));

    const { data } = await this.api.post('/series', {
      ...lookupData,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      seriesType: options.seriesType ?? 'standard',
      tags: options.tags ?? [],
      monitored: options.monitored ?? true,
      seasons,
      addOptions: {
        searchForMissingEpisodes: options.searchForMissingEpisodes ?? true,
      },
    });
    return data;
  }

  async lookupByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    const { data } = await this.api.get('/series/lookup', { params: { term: `tvdb:${tvdbId}` } });
    return data[0] ?? null;
  }

  async getCalendar(start: string, end: string): Promise<{ seriesId: number; seasonNumber: number; episodeNumber: number; title: string; airDateUtc: string; series: { title: string; tvdbId: number; images: { coverType: string; remoteUrl: string }[] } }[]> {
    const { data } = await this.api.get('/calendar', { params: { start, end, includeSeries: true } });
    return data;
  }

  async getQueue(): Promise<{ records: SonarrQueueItem[] }> {
    const { data } = await this.api.get('/queue', {
      params: { pageSize: 50, includeSeries: true, includeEpisode: true },
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

  async getHistory(since?: Date | null): Promise<SonarrHistoryRecord[]> {
    if (since) {
      const { data } = await this.api.get('/history/since', { params: { date: since.toISOString() } });
      return (Array.isArray(data) ? data : data.records ?? [])
        .filter((r: SonarrHistoryRecord) => r.eventType === 'downloadFolderImported');
    }
    const all: SonarrHistoryRecord[] = [];
    let page = 1;
    while (true) {
      try {
        const { data } = await this.api.get('/history', {
          params: { pageSize: 500, page, sortKey: 'date', sortDirection: 'descending' },
        });
        const records: SonarrHistoryRecord[] = data.records ?? data;
        all.push(...records.filter(r => r.eventType === 'downloadFolderImported'));
        if (records.length < 500) break;
        page++;
      } catch {
        // Sonarr can crash on corrupted history entries — stop pagination gracefully
        console.warn(`[Sonarr] History pagination failed at page ${page}, using ${all.length} records collected so far`);
        break;
      }
    }
    return all;
  }
}

export interface SonarrHistoryRecord {
  seriesId: number;
  date: string;
  eventType: string;
}

const _serviceCache = new Map<number, { instance: SonarrService; configKey: string }>();

/** Create a SonarrService from a service config object */
export function createSonarrFromConfig(config: Record<string, string>): SonarrService {
  return new SonarrService(config.url || '', config.apiKey || '');
}

/** Get a cached SonarrService for a specific service ID */
export function getSonarrForService(serviceId: number, config: Record<string, string>): SonarrService {
  const configKey = `${config.url}|${config.apiKey}`;
  const cached = _serviceCache.get(serviceId);
  if (cached && cached.configKey === configKey) return cached.instance;
  const instance = createSonarrFromConfig(config);
  _serviceCache.set(serviceId, { instance, configKey });
  return instance;
}

let _sonarr: SonarrService | null = null;
let _sonarrConfigKey: string | null = null;

export async function getSonarrAsync(): Promise<SonarrService> {
  const config = await getServiceConfig('sonarr');
  const url = config?.url || process.env.SONARR_URL || '';
  const apiKey = config?.apiKey || process.env.SONARR_API_KEY || '';
  const configKey = `${url}|${apiKey}`;
  if (!_sonarr || _sonarrConfigKey !== configKey) {
    _sonarr = new SonarrService(url, apiKey);
    _sonarrConfigKey = configKey;
  }
  return _sonarr;
}

export function getSonarr(): SonarrService {
  if (!_sonarr) {
    _sonarr = new SonarrService(
      process.env.SONARR_URL || '',
      process.env.SONARR_API_KEY || '',
    );
  }
  return _sonarr;
}
