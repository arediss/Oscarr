import type { FastifyInstance } from 'fastify';
import { getRadarr } from '../services/radarr.js';
import { getSonarr } from '../services/sonarr.js';

export async function radarrSonarrRoutes(app: FastifyInstance) {
  // Radarr status
  app.get('/radarr/status', { preHandler: [app.authenticate] }, async (_request, reply) => {
    try {
      const status = await getRadarr().getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Sonarr status
  app.get('/sonarr/status', { preHandler: [app.authenticate] }, async (_request, reply) => {
    try {
      const status = await getSonarr().getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Radarr queue (download status)
  app.get('/radarr/queue', { preHandler: [app.authenticate] }, async () => {
    const queue = await getRadarr().getQueue();
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
  app.get('/sonarr/queue', { preHandler: [app.authenticate] }, async () => {
    const queue = await getSonarr().getQueue();
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
  app.get('/downloads', { preHandler: [app.authenticate] }, async () => {
    try {
      const [radarrQueue, sonarrQueue] = await Promise.all([
        getRadarr().getQueue().catch(() => ({ records: [] })),
        getSonarr().getQueue().catch(() => ({ records: [] })),
      ]);

      const downloads: {
        tmdbId: number; mediaType: string; title: string;
        progress: number; timeLeft: string; estimatedCompletion: string;
        size: number; sizeLeft: number; status: string;
        episode?: { seasonNumber: number; episodeNumber: number; title: string };
      }[] = [];

      for (const item of radarrQueue.records) {
        const movie = (item as Record<string, unknown>).movie as { tmdbId?: number } | undefined;
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
        const series = (item as Record<string, unknown>).series as { tvdbId?: number } | undefined;
        if (!series?.tvdbId) continue;
        // Look up tmdbId from our DB via tvdbId
        const { prisma } = await import('../utils/prisma.js');
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
  app.get('/stats', { preHandler: [app.authenticate] }, async () => {
    try {
      const [movies, series] = await Promise.all([
        getRadarr().getMovies(),
        getSonarr().getSeries(),
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
  app.get('/calendar', { preHandler: [app.authenticate] }, async (request) => {
    const { days } = request.query as { days?: string };
    const numDays = Math.min(parseInt(days || '30', 10) || 30, 90);
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + numDays * 86400000).toISOString().slice(0, 10);

    try {
      const [movies, episodes] = await Promise.all([
        getRadarr().getCalendar(start, end),
        getSonarr().getCalendar(start, end),
      ]);

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
          poster: e.series?.images?.find((i: { coverType: string }) => i.coverType === 'poster')?.remoteUrl || null,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return items;
    } catch (err) {
      return [];
    }
  });
}
