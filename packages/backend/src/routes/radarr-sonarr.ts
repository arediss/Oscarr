import type { FastifyInstance } from 'fastify';
import { radarr } from '../services/radarr.js';
import { sonarr } from '../services/sonarr.js';

export async function radarrSonarrRoutes(app: FastifyInstance) {
  // Radarr status
  app.get('/radarr/status', { preHandler: [app.authenticate] }, async (_request, reply) => {
    try {
      const status = await radarr.getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Sonarr status
  app.get('/sonarr/status', { preHandler: [app.authenticate] }, async (_request, reply) => {
    try {
      const status = await sonarr.getSystemStatus();
      return { online: true, version: status.version };
    } catch {
      return reply.send({ online: false });
    }
  });

  // Radarr queue (download status)
  app.get('/radarr/queue', { preHandler: [app.authenticate] }, async () => {
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
  app.get('/sonarr/queue', { preHandler: [app.authenticate] }, async () => {
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

  // Library stats
  app.get('/stats', { preHandler: [app.authenticate] }, async () => {
    try {
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
}
