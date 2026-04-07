import axios, { type AxiosInstance } from 'axios';
import type { ArrClient, ArrTag, ArrQualityProfile, ArrRootFolder } from '../types.js';
import type { SonarrSeries, SonarrSeason, SonarrQueueItem, SonarrEpisode, SonarrEpisodeFile, SonarrHistoryRecord } from './types.js';

export class SonarrClient implements ArrClient {
  private api: AxiosInstance;

  constructor(url: string, apiKey: string) {
    this.api = axios.create({
      baseURL: `${url}/api/v3`,
      params: { apikey: apiKey },
      timeout: 5000,
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

  async getQualityProfiles(): Promise<ArrQualityProfile[]> {
    const { data } = await this.api.get('/qualityprofile');
    return data;
  }

  async getRootFolders(): Promise<ArrRootFolder[]> {
    const { data } = await this.api.get('/rootfolder');
    return data;
  }

  async getSystemStatus(): Promise<{ version: string }> {
    const { data } = await this.api.get('/system/status');
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

  async getEpisodes(seriesId: number, seasonNumber?: number): Promise<SonarrEpisode[]> {
    const params: Record<string, unknown> = { seriesId };
    if (seasonNumber !== undefined) params.seasonNumber = seasonNumber;
    const { data } = await this.api.get('/episode', { params });
    return data;
  }

  async getEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
    const { data } = await this.api.get('/episodefile', { params: { seriesId } });
    return data;
  }

  async searchMissingEpisodes(seriesId: number): Promise<void> {
    await this.api.post('/command', { name: 'MissingEpisodeSearch', seriesId });
  }

  async getHistory(since?: Date | null): Promise<SonarrHistoryRecord[]> {
    if (since) {
      const { data } = await this.api.get('/history/since', { params: { date: since.toISOString(), includeEpisode: true } });
      return (Array.isArray(data) ? data : data.records ?? [])
        .filter((r: SonarrHistoryRecord) => r.eventType === 'downloadFolderImported');
    }
    const all: SonarrHistoryRecord[] = [];
    let page = 1;
    while (true) {
      try {
        const { data } = await this.api.get('/history', {
          params: { pageSize: 500, page, sortKey: 'date', sortDirection: 'descending', includeEpisode: true },
        });
        const records: SonarrHistoryRecord[] = data.records ?? data;
        all.push(...records.filter(r => r.eventType === 'downloadFolderImported'));
        if (records.length < 500) break;
        page++;
      } catch (err) {
        // Sonarr can crash on corrupted history entries — log details for debugging
        const statusCode = (err as { response?: { status?: number } })?.response?.status;
        const errorBody = (err as { response?: { data?: unknown } })?.response?.data;
        console.warn(`[Sonarr] History pagination failed at page ${page} (records ${(page - 1) * 500}-${page * 500}), HTTP ${statusCode || 'unknown'}`);
        if (errorBody) console.warn(`[Sonarr] Error details:`, typeof errorBody === 'string' ? errorBody.slice(0, 500) : JSON.stringify(errorBody).slice(0, 500));
        console.warn(`[Sonarr] Using ${all.length} records collected so far`);
        break;
      }
    }
    return all;
  }
}
