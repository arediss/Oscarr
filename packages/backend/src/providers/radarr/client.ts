import axios, { type AxiosInstance } from 'axios';
import type { ArrClient, ArrTag, ArrQualityProfile, ArrRootFolder } from '../types.js';
import type { RadarrMovie, RadarrQueueItem, RadarrHistoryRecord } from './types.js';

export class RadarrClient implements ArrClient {
  private api: AxiosInstance;

  constructor(url: string, apiKey: string) {
    this.api = axios.create({
      baseURL: `${url}/api/v3`,
      params: { apikey: apiKey },
      timeout: 5000,
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

  async searchMovie(movieId: number): Promise<void> {
    await this.api.post('/command', { name: 'MoviesSearch', movieIds: [movieId] });
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

  async getTags(): Promise<ArrTag[]> {
    const { data } = await this.api.get('/tag');
    return data;
  }

  async createTag(label: string): Promise<ArrTag> {
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

  async getQualityProfiles(): Promise<ArrQualityProfile[]> {
    const { data } = await this.api.get('/qualityprofile');
    return data;
  }

  async getRootFolders(): Promise<ArrRootFolder[]> {
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
