import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  HardDrive,
  Film,
  Tv,
  Loader2,
  RefreshCw,
  Server,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import type { QueueItem } from '@/types';

interface ServiceStatus {
  online: boolean;
  version?: string;
}

interface LibraryStats {
  radarr: {
    totalMovies: number;
    moviesWithFiles: number;
    monitoredMovies: number;
    totalSizeOnDisk: number;
  };
  sonarr: {
    totalSeries: number;
    monitoredSeries: number;
    totalEpisodes: number;
    downloadedEpisodes: number;
    totalSizeOnDisk: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function DownloadsPage() {
  const [radarrQueue, setRadarrQueue] = useState<QueueItem[]>([]);
  const [sonarrQueue, setSonarrQueue] = useState<QueueItem[]>([]);
  const [radarrStatus, setRadarrStatus] = useState<ServiceStatus | null>(null);
  const [sonarrStatus, setSonarrStatus] = useState<ServiceStatus | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [rStatus, sStatus, rQueue, sQueue, statsRes] = await Promise.all([
        api.get('/services/radarr/status').catch(() => ({ data: { online: false } })),
        api.get('/services/sonarr/status').catch(() => ({ data: { online: false } })),
        api.get('/services/radarr/queue').catch(() => ({ data: [] })),
        api.get('/services/sonarr/queue').catch(() => ({ data: [] })),
        api.get('/services/stats').catch(() => ({ data: null })),
      ]);
      setRadarrStatus(rStatus.data);
      setSonarrStatus(sStatus.data);
      setRadarrQueue(rQueue.data);
      setSonarrQueue(sQueue.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch downloads:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-ndp-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-ndp-text">Téléchargements</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          Rafraîchir
        </button>
      </div>

      {/* Service status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatusCard
          icon={Film}
          label="Radarr"
          online={radarrStatus?.online ?? false}
          version={radarrStatus?.version}
          stat={stats ? `${stats.radarr.moviesWithFiles}/${stats.radarr.totalMovies} films` : undefined}
          size={stats ? formatBytes(stats.radarr.totalSizeOnDisk) : undefined}
        />
        <StatusCard
          icon={Tv}
          label="Sonarr"
          online={sonarrStatus?.online ?? false}
          version={sonarrStatus?.version}
          stat={stats ? `${stats.sonarr.downloadedEpisodes}/${stats.sonarr.totalEpisodes} ép.` : undefined}
          size={stats ? formatBytes(stats.sonarr.totalSizeOnDisk) : undefined}
        />
        <div className="card p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-ndp-accent/10">
              <Download className="w-5 h-5 text-ndp-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ndp-text">File d'attente</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-ndp-text">{radarrQueue.length + sonarrQueue.length}</p>
          <p className="text-xs text-ndp-text-dim mt-1">éléments en cours</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <HardDrive className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ndp-text">Espace total</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-ndp-text">
            {stats ? formatBytes(stats.radarr.totalSizeOnDisk + stats.sonarr.totalSizeOnDisk) : '...'}
          </p>
          <p className="text-xs text-ndp-text-dim mt-1">utilisé</p>
        </div>
      </div>

      {/* Queue */}
      {radarrQueue.length + sonarrQueue.length === 0 ? (
        <div className="text-center py-20">
          <Download className="w-16 h-16 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted text-lg">Aucun téléchargement en cours</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Radarr queue */}
          {radarrQueue.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-ndp-text flex items-center gap-2 mt-6 mb-3">
                <Film className="w-5 h-5 text-ndp-accent" />
                Films
              </h2>
              {radarrQueue.map((item, i) => (
                <QueueItemCard key={`r-${i}`} item={item} type="movie" />
              ))}
            </>
          )}

          {/* Sonarr queue */}
          {sonarrQueue.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-ndp-text flex items-center gap-2 mt-6 mb-3">
                <Tv className="w-5 h-5 text-ndp-accent" />
                Séries
              </h2>
              {sonarrQueue.map((item, i) => (
                <QueueItemCard key={`s-${i}`} item={item} type="tv" />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  online,
  version,
  stat,
  size,
}: {
  icon: typeof Film;
  label: string;
  online: boolean;
  version?: string;
  stat?: string;
  size?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-ndp-accent/10">
            <Icon className="w-5 h-5 text-ndp-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ndp-text">{label}</p>
            {version && <p className="text-[10px] text-ndp-text-dim">v{version}</p>}
          </div>
        </div>
        {online ? (
          <CheckCircle className="w-5 h-5 text-ndp-success" />
        ) : (
          <XCircle className="w-5 h-5 text-ndp-danger" />
        )}
      </div>
      {stat && <p className="text-sm text-ndp-text-muted">{stat}</p>}
      {size && <p className="text-xs text-ndp-text-dim">{size}</p>}
    </div>
  );
}

function QueueItemCard({ item, type }: { item: QueueItem; type: 'movie' | 'tv' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <div className="p-2 rounded-lg bg-white/5">
          {type === 'movie' ? <Film className="w-5 h-5 text-ndp-text-muted" /> : <Tv className="w-5 h-5 text-ndp-text-muted" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ndp-text truncate">{item.title}</p>
          {item.episode && (
            <p className="text-xs text-ndp-text-muted">
              S{String(item.episode.seasonNumber).padStart(2, '0')}E{String(item.episode.episodeNumber).padStart(2, '0')} - {item.episode.title}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-ndp-text-dim">
            <span>{formatBytes(item.size - item.sizeLeft)} / {formatBytes(item.size)}</span>
            {item.timeLeft && <span>Reste: {item.timeLeft}</span>}
          </div>
        </div>
        <div className="flex-shrink-0 w-20 text-right">
          <span className="text-lg font-bold text-ndp-accent">{item.progress}%</span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-ndp-accent to-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${item.progress}%` }}
        />
      </div>
    </div>
  );
}
