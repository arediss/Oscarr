import type { FastifyInstance } from 'fastify';
import { getRadarrAsync } from '../services/radarr.js';
import { getSonarrAsync } from '../services/sonarr.js';
import { prisma } from '../utils/prisma.js';

export async function radarrSonarrRoutes(app: FastifyInstance) {
  // Radarr status
  app.get('/radarr/status', async (_request, reply) => {
    try {
      const radarr = await getRadarrAsync();
      const status = await radarr.getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Sonarr status
  app.get('/sonarr/status', async (_request, reply) => {
    try {
      const sonarr = await getSonarrAsync();
      const status = await sonarr.getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Radarr queue (download status)
  app.get('/radarr/queue', async () => {
    const radarr = await getRadarrAsync();
    const queue = await radarr.getQueue();
    return queue.records.map(item => ({
      movieId: item.movieId,
      title: item.title,
      status: item.status,
      size: item.size,
      sizeLeft: item.sizeleft,
      timeLeft: item.timeleft,
      estimatedCompletion: item.estimatedCompletionTime,
      progress: item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0,
    }));
  });

  // Sonarr queue (download status)
  app.get('/sonarr/queue', async () => {
    const sonarr = await getSonarrAsync();
    const queue = await sonarr.getQueue();
    return queue.records.map(item => ({
      seriesId: item.seriesId,
      title: item.title,
      status: item.status,
      size: item.size,
      sizeLeft: item.sizeleft,
      timeLeft: item.timeleft,
      estimatedCompletion: item.estimatedCompletionTime,
      progress: item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0,
      episode: item.episode,
    }));
  });

  // Combined download queue mapped to tmdbId
  app.get('/downloads', async () => {
    try {
      const [radarr, sonarr] = await Promise.all([
        getRadarrAsync(),
        getSonarrAsync(),
      ]);
      const [radarrQueue, sonarrQueue] = await Promise.all([
        radarr.getQueue().catch(() => ({ records: [] })),
        sonarr.getQueue().catch(() => ({ records: [] })),
      ]);

      const downloads: {
        tmdbId: number; mediaType: string; title: string;
        progress: number; timeLeft: string; estimatedCompletion: string;
        size: number; sizeLeft: number; status: string;
        episode?: { seasonNumber: number; episodeNumber: number; title: string };
      }[] = [];

      for (const item of radarrQueue.records) {
        const movie = (item as unknown as Record<string, unknown>).movie as { tmdbId?: number } | undefined;
        if (!movie?.tmdbId) continue;
        downloads.push({
          tmdbId: movie.tmdbId,
          mediaType: 'movie',
          title: item.title,
          progress: item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0,
          timeLeft: item.timeleft,
          estimatedCompletion: item.estimatedCompletionTime,
          size: item.size,
          sizeLeft: item.sizeleft,
          status: item.status,
        });
      }

      for (const item of sonarrQueue.records) {
        const series = (item as unknown as Record<string, unknown>).series as { tvdbId?: number } | undefined;
        if (!series?.tvdbId) continue;
        // Look up tmdbId from our DB via tvdbId
        const media = await prisma.media.findFirst({ where: { tvdbId: series.tvdbId, mediaType: 'tv' }, select: { tmdbId: true } });
        if (!media) continue;
        downloads.push({
          tmdbId: media.tmdbId,
          mediaType: 'tv',
          title: item.title,
          progress: item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0,
          timeLeft: item.timeleft,
          estimatedCompletion: item.estimatedCompletionTime,
          size: item.size,
          sizeLeft: item.sizeleft,
          status: item.status,
          episode: item.episode ? { seasonNumber: item.episode.seasonNumber, episodeNumber: item.episode.episodeNumber, title: item.episode.title } : undefined,
        });
      }

      return downloads;
    } catch {
      return [];
    }
  });

  // Library stats
  app.get('/stats', async () => {
    try {
      const [radarr, sonarr] = await Promise.all([
        getRadarrAsync(),
        getSonarrAsync(),
      ]);
      const [movies, series] = await Promise.all([
        radarr.getMovies(),
        sonarr.getSeries(),
      ]);

      return {
        radarr: {
          totalMovies: movies.length,
          moviesWithFiles: movies.filter(m => m.hasFile).length,
          monitoredMovies: movies.filter(m => m.monitored).length,
          totalSizeOnDisk: movies.reduce((acc, m) => acc + m.sizeOnDisk, 0),
        },
        sonarr: {
          totalSeries: series.length,
          monitoredSeries: series.filter(s => s.monitored).length,
          totalEpisodes: series.reduce((acc, s) => acc + (s.statistics?.totalEpisodeCount ?? 0), 0),
          downloadedEpisodes: series.reduce((acc, s) => acc + (s.statistics?.episodeFileCount ?? 0), 0),
          totalSizeOnDisk: series.reduce((acc, s) => acc + (s.statistics?.sizeOnDisk ?? 0), 0),
        },
      };
    } catch (err) {
      return { error: 'Impossible de récupérer les statistiques' };
    }
  });

  // Calendar: upcoming releases
  app.get('/calendar', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'string', description: 'Number of days to look ahead (default 30, max 90)' },
        },
      },
    },

  }, async (request) => {
    const { days } = request.query as { days?: string };
    const numDays = Math.min(parseInt(days || '30', 10) || 30, 90);
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + numDays * 86400000).toISOString().slice(0, 10);

    try {
      const [radarr, sonarr] = await Promise.all([
        getRadarrAsync(),
        getSonarrAsync(),
      ]);
      const [movies, episodes] = await Promise.all([
        radarr.getCalendar(start, end),
        sonarr.getCalendar(start, end),
      ]);

      // Resolve tvdbId → tmdbId for episodes via DB
      const tvdbIds = [...new Set(episodes.map((e) => e.series?.tvdbId).filter(Boolean))] as number[];
      const tvdbToTmdb = new Map<number, number>();
      if (tvdbIds.length > 0) {
        const dbMedia = await prisma.media.findMany({
          where: { tvdbId: { in: tvdbIds }, mediaType: 'tv', tmdbId: { gt: 0 } },
          select: { tvdbId: true, tmdbId: true },
        });
        for (const m of dbMedia) {
          if (m.tvdbId) tvdbToTmdb.set(m.tvdbId, m.tmdbId);
        }
      }

      const items = [
        ...movies.map((m) => ({
          type: 'movie' as const,
          title: m.title,
          date: m.digitalRelease || m.physicalRelease || m.inCinemas || m.releaseDate || '',
          tmdbId: m.tmdbId,
          poster: m.images?.find((i) => i.coverType === 'poster')?.remoteUrl || null,
          hasFile: m.hasFile,
        })),
        ...episodes.map((e) => ({
          type: 'episode' as const,
          title: e.series?.title || 'Série inconnue',
          episodeTitle: e.title,
          season: e.seasonNumber,
          episode: e.episodeNumber,
          date: e.airDateUtc,
          tvdbId: e.series?.tvdbId,
          tmdbId: e.series?.tvdbId ? tvdbToTmdb.get(e.series.tvdbId) ?? undefined : undefined,
          poster: e.series?.images?.find((i: { coverType: string }) => i.coverType === 'poster')?.remoteUrl || null,
          hasFile: !!(e as unknown as { hasFile?: boolean }).hasFile,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return items;
    } catch (err) {
      return [];
    }
  });
}
