import axios, { type AxiosInstance } from 'axios';
import type { ArrClient, ArrTag, ArrQualityProfile, ArrRootFolder, ArrMediaItem, ArrSeasonItem, ArrAvailabilityResult, ArrHistoryEntry, ArrAddMediaOptions, ArrEpisode, ArrWebhookEvent } from '../types.js';
import { extractImageFromArr } from '../types.js';
import type { SonarrSeries, SonarrSeason, SonarrQueueItem, SonarrEpisode, SonarrEpisodeFile, SonarrHistoryRecord } from './types.js';
import { logEvent } from '../../utils/logEvent.js';
import { attachAxiosRetry } from '../../utils/fetchWithRetry.js';

export class SonarrClient implements ArrClient {
  readonly mediaType = 'tv' as const;
  readonly serviceType = 'sonarr';
  readonly dbIdField = 'sonarrId' as const;
  readonly defaultRootFolder = '/tv';

  private api: AxiosInstance;

  constructor(url: string, apiKey: string) {
    this.api = attachAxiosRetry(axios.create({
      baseURL: `${url}/api/v3`,
      params: { apikey: apiKey },
      timeout: 5000,
    }), 'Sonarr');
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

    const monitorAll = !options.seasons || options.seasons.length === 0;
    const seasons = lookupData.seasons.map((s: SonarrSeason) => ({
      seasonNumber: s.seasonNumber,
      monitored: s.seasonNumber > 0 && (monitorAll || options.seasons.includes(s.seasonNumber)),
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
        logEvent('debug', 'Sonarr', `History pagination failed at page ${page} (records ${(page - 1) * 500}-${page * 500}), HTTP ${statusCode || 'unknown'}`);
        if (errorBody) logEvent('debug', 'Sonarr', `Error details: ${typeof errorBody === 'string' ? errorBody.slice(0, 500) : JSON.stringify(errorBody).slice(0, 500)}`);
        logEvent('debug', 'Sonarr', `Using ${all.length} records collected so far`);
        break;
      }
    }
    return all;
  }

  // ─── Normalized interface methods ─────────────────────────────────

  private getSeriesStatus(show: SonarrSeries): string {
    const stats = show.statistics;
    if (!stats) return 'unknown';
    if (stats.percentOfEpisodes >= 100) return 'available';
    if (stats.episodeFileCount > 0) return 'processing';
    if (show.monitored) return 'pending';
    return 'unknown';
  }

  private getSeasonStatus(season: { monitored: boolean; statistics?: { percentOfEpisodes: number; episodeFileCount: number } }): string {
    if (!season.statistics) return 'unknown';
    if (season.statistics.percentOfEpisodes >= 100) return 'available';
    if (season.statistics.episodeFileCount > 0) return 'processing';
    if (season.monitored) return 'pending';
    return 'unknown';
  }

  async getAllMedia(): Promise<ArrMediaItem[]> {
    const series = await this.getSeries();
    return series.map(show => ({
      serviceMediaId: show.id,
      externalId: show.tvdbId,
      tmdbId: show.tmdbId && show.tmdbId > 0 ? show.tmdbId : undefined,
      title: show.title,
      status: this.getSeriesStatus(show),
      posterPath: extractImageFromArr(show.images, 'poster'),
      backdropPath: extractImageFromArr(show.images, 'fanart'),
      qualityProfileId: show.qualityProfileId,
      addedDate: show.added || null,
      tags: show.tags || [],
      hasFile: (show.statistics?.percentOfEpisodes ?? 0) >= 100,
      seasons: show.seasons
        .filter(s => s.seasonNumber > 0)
        .map(s => ({
          seasonNumber: s.seasonNumber,
          monitored: s.monitored,
          episodeFileCount: s.statistics?.episodeFileCount ?? 0,
          totalEpisodeCount: s.statistics?.totalEpisodeCount ?? 0,
          percentComplete: s.statistics?.percentOfEpisodes ?? 0,
          status: this.getSeasonStatus(s),
        })),
    }));
  }

  async checkAvailability(tvdbId: number): Promise<ArrAvailabilityResult> {
    const series = await this.getSeriesByTvdbId(tvdbId);
    if (!series) {
      return { available: false, audioLanguages: null, subtitleLanguages: null };
    }

    const stats = series.statistics;
    const available = stats ? stats.percentOfEpisodes >= 100 : false;

    const seasonStats = series.seasons
      .filter(s => s.seasonNumber > 0)
      .map(s => ({
        seasonNumber: s.seasonNumber,
        episodeFileCount: s.statistics?.episodeFileCount ?? 0,
        episodeCount: s.statistics?.episodeCount ?? 0,
        totalEpisodeCount: s.statistics?.totalEpisodeCount ?? 0,
      }));

    let audioLanguages: string[] | null = null;
    let subtitleLanguages: string[] | null = null;

    if (stats?.episodeFileCount && stats.episodeFileCount > 0) {
      try {
        const files = await this.getEpisodeFiles(series.id);
        const audioCounts = new Map<string, number>();
        const subCounts = new Map<string, number>();
        for (const f of files) {
          if (f.mediaInfo?.audioLanguages) {
            const seen = new Set<string>();
            for (const l of f.mediaInfo.audioLanguages.split('/')) {
              const t = l.trim();
              if (t && !seen.has(t)) { seen.add(t); audioCounts.set(t, (audioCounts.get(t) || 0) + 1); }
            }
          }
          if (f.mediaInfo?.subtitles) {
            const seen = new Set<string>();
            for (const l of f.mediaInfo.subtitles.split('/')) {
              const t = l.trim();
              if (t && !seen.has(t)) { seen.add(t); subCounts.set(t, (subCounts.get(t) || 0) + 1); }
            }
          }
        }
        const threshold = Math.max(1, Math.floor(files.length * 0.5));
        const filteredAudio = [...audioCounts.entries()].filter(([, c]) => c >= threshold).map(([l]) => l);
        const filteredSubs = [...subCounts.entries()].filter(([, c]) => c >= threshold).map(([l]) => l);
        if (filteredAudio.length > 0) audioLanguages = filteredAudio;
        if (filteredSubs.length > 0) subtitleLanguages = filteredSubs;
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        logEvent('debug', 'Sonarr', `Failed to fetch episode files for series ${series.id} (HTTP ${status || 'unknown'}), skipping language data`);
      }
    }

    return { available, audioLanguages, subtitleLanguages, seasonStats };
  }

  async findByExternalId(tvdbId: number): Promise<{ id: number } | null> {
    const series = await this.getSeriesByTvdbId(tvdbId);
    return series ? { id: series.id } : null;
  }

  async addMedia(options: ArrAddMediaOptions): Promise<void> {
    await this.addSeries({
      title: options.title,
      tvdbId: options.externalId,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      seriesType: (options.seriesType as 'standard' | 'anime' | 'daily') || 'standard',
      seasons: options.seasons || [],
      tags: options.tags,
      searchForMissingEpisodes: true,
    });
  }

  async searchMedia(seriesId: number): Promise<void> {
    await this.searchMissingEpisodes(seriesId);
  }

  async deleteMedia(seriesId: number, deleteFiles = true): Promise<void> {
    await this.api.delete(`/series/${seriesId}`, { params: { deleteFiles } });
  }

  async getEpisodesNormalized(serviceMediaId: number, seasonNumber?: number): Promise<ArrEpisode[]> {
    const episodes = await this.getEpisodes(serviceMediaId, seasonNumber);
    return episodes.map(ep => ({
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      airDateUtc: ep.airDateUtc,
      hasFile: ep.hasFile,
      monitored: ep.monitored,
      quality: ep.episodeFile?.quality?.quality?.name || null,
      size: ep.episodeFile?.size || null,
    }));
  }

  async getHistoryEntries(since?: Date | null): Promise<ArrHistoryEntry[]> {
    const records = await this.getHistory(since);
    return records.map(r => ({
      serviceMediaId: r.seriesId,
      date: new Date(r.date),
      extraData: r.episode ? { episode: { season: r.episode.seasonNumber, episode: r.episode.episodeNumber, title: r.episode.title } } : undefined,
    }));
  }

  async registerWebhook(name: string, url: string, apiKey: string): Promise<number> {
    const { data } = await this.api.post('/notification', {
      name,
      implementation: 'Webhook',
      configContract: 'WebhookSettings',
      onDownload: true,
      onUpgrade: true,
      onImportComplete: true,
      onSeriesAdd: true,
      onSeriesDelete: true,
      includeHealthWarnings: false,
      fields: [
        { name: 'url', value: url },
        { name: 'method', value: 1 },
        { name: 'username', value: '' },
        { name: 'password', value: apiKey },
      ],
    });
    return data.id;
  }

  async removeWebhook(webhookId: number): Promise<void> {
    await this.api.delete(`/notification/${webhookId}`);
  }

  async checkWebhookExists(webhookId: number): Promise<boolean> {
    const { data } = await this.api.get('/notification');
    return Array.isArray(data) && data.some((n: { id: number }) => n.id === webhookId);
  }

  getWebhookEvents() {
    return [
      { key: 'Download', label: 'Import', description: 'When an episode file is imported' },
      { key: 'Upgrade', label: 'Upgrade', description: 'When an episode is upgraded to better quality' },
      { key: 'SeriesAdd', label: 'Series added', description: 'When a series is added to the library' },
      { key: 'SeriesDelete', label: 'Series deleted', description: 'When a series is removed from the library' },
    ];
  }

  parseWebhookPayload(body: unknown): ArrWebhookEvent | null {
    const payload = body as { eventType?: string; series?: { id?: number; tvdbId?: number; title?: string }; episodes?: { seasonNumber?: number; episodeNumber?: number }[] };
    if (!payload.eventType) return null;
    if (payload.eventType === 'Test') return { type: 'test', externalId: 0, title: 'Test' };
    if (!payload.series?.tvdbId) return null;
    const typeMap: Record<string, ArrWebhookEvent['type']> = { Download: 'download', Grab: 'grab', SeriesAdd: 'added', SeriesDelete: 'deleted' };
    const ep = payload.episodes?.[0];
    return {
      type: typeMap[payload.eventType] || 'unknown',
      externalId: payload.series.tvdbId,
      internalId: payload.series.id,
      title: payload.series.title || 'Unknown',
      seasonNumber: ep?.seasonNumber,
      episodeNumber: ep?.episodeNumber,
    };
  }
}
