import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Film,
  Search,
  CalendarClock,
  LayoutGrid,
  Hourglass,
  ThumbsUp,
  CircleCheck,
  Cog,
  Ban,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { posterUrl, backdropUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useDownloadForMedia } from '@/hooks/useDownloads';
import { localizedDate } from '@/i18n/formatters';
import type { MediaRequest } from '@/types';

const STATUS_CONFIG: Record<string, { labelKey: string; icon: typeof Clock; color: string; bg: string }> = {
  pending: { labelKey: 'pending', icon: Clock, color: 'text-ndp-warning', bg: 'bg-ndp-warning' },
  approved: { labelKey: 'approved', icon: CheckCircle, color: 'text-ndp-accent', bg: 'bg-ndp-accent' },
  declined: { labelKey: 'declined', icon: XCircle, color: 'text-ndp-danger', bg: 'bg-ndp-danger' },
  processing: { labelKey: 'processing', icon: Loader2, color: 'text-blue-400', bg: 'bg-ndp-accent' },
  available: { labelKey: 'available', icon: CheckCircle, color: 'text-ndp-success', bg: 'bg-ndp-success' },
  searching: { labelKey: 'searching', icon: Search, color: 'text-ndp-accent', bg: 'bg-ndp-accent' },
  upcoming: { labelKey: 'upcoming', icon: CalendarClock, color: 'text-purple-400', bg: 'bg-purple-500' },
  failed: { labelKey: 'failed', icon: AlertCircle, color: 'text-ndp-danger', bg: 'bg-ndp-danger' },
};

interface RequestStats {
  total: number;
  pending: number;
  approved: number;
  available: number;
  declined: number;
  processing: number;
}

export default function RequestsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [stats, setStats] = useState<RequestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get('/requests/stats').then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  const fetchRequests = useCallback(async (pageNum: number, append = false) => {
    if (!append) setFiltering(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      params.set('page', String(pageNum));
      const { data } = await api.get(`/requests?${params}`);
      if (append) {
        setRequests((prev) => [...prev, ...data.results]);
      } else {
        setRequests(data.results);
      }
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
      setFiltering(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests(1);
  }, [filter]);

  const loadMore = () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    fetchRequests(page + 1, true);
  };

  const handleAction = async (id: number, action: 'approve' | 'decline') => {
    setActionLoading(id);
    try {
      await api.post(`/requests/${id}/${action}`);
      fetchRequests(1);
    } catch (err) {
      console.error(`Failed to ${action} request:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: number) => {
    setActionLoading(id);
    try {
      await api.delete(`/requests/${id}`);
      fetchRequests(1);
    } catch (err) {
      console.error('Failed to delete request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <StatCard label={t('requests.total')} value={stats.total} icon={LayoutGrid} color="text-ndp-text" bg="bg-white/5" active={filter === ''} onClick={() => setFilter('')} />
          <StatCard label={t('status.pending')} value={stats.pending} icon={Hourglass} color="text-ndp-warning" bg="bg-ndp-warning/5" active={filter === 'pending'} onClick={() => setFilter(filter === 'pending' ? '' : 'pending')} />
          <StatCard label={t('requests.approved_plural')} value={stats.approved} icon={ThumbsUp} color="text-ndp-accent" bg="bg-ndp-accent/5" active={filter === 'approved'} onClick={() => setFilter(filter === 'approved' ? '' : 'approved')} />
          <StatCard label={t('requests.available_plural')} value={stats.available} icon={CircleCheck} color="text-ndp-success" bg="bg-ndp-success/5" active={filter === 'available'} onClick={() => setFilter(filter === 'available' ? '' : 'available')} />
          <StatCard label={t('requests.processing_plural')} value={stats.processing} icon={Cog} color="text-blue-400" bg="bg-ndp-accent/5" />
          <StatCard label={t('requests.declined_plural')} value={stats.declined} icon={Ban} color="text-ndp-danger" bg="bg-ndp-danger/5" active={filter === 'declined'} onClick={() => setFilter(filter === 'declined' ? '' : 'declined')} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-ndp-text">{t('requests.title')}</h1>
        {filter && (
          <button onClick={() => setFilter('')} className="text-xs text-ndp-text-dim hover:text-ndp-text bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            {t('requests.clear_filter')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-ndp-accent animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <Film className="w-16 h-16 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted text-lg">{t('requests.no_requests')}</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2 mt-4">
            {t('requests.search_media')}
          </Link>
        </div>
      ) : (
        <>
          <div
            className={clsx(
              'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 transition-opacity duration-300',
              filtering ? 'opacity-40' : 'opacity-100'
            )}
          >
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isAdmin={isAdmin}
                actionLoading={actionLoading}
                onAction={handleAction}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {page < totalPages && (
            <div className="flex justify-center mt-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-secondary flex items-center gap-2"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('requests.load_more', { current: requests.length, total })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RequestCard({
  request: req,
  isAdmin,
  actionLoading,
  onAction,
  onDelete,
}: {
  request: MediaRequest;
  isAdmin: boolean;
  actionLoading: number | null;
  onAction: (id: number, action: 'approve' | 'decline') => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useTranslation();
  const download = useDownloadForMedia(req.media?.tmdbId, req.mediaType);
  const status = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
  const mediaLink = `/${req.mediaType}/${req.media?.tmdbId}`;
  const year = req.media?.releaseDate?.slice(0, 4);
  const backdrop = req.media?.backdropPath;

  return (
    <Link
      to={mediaLink}
      className="group relative rounded-2xl overflow-hidden h-[180px] flex transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/40"
    >
      {/* Background: backdrop image */}
      <div className="absolute inset-0">
        {backdrop ? (
          <img
            src={backdropUrl(backdrop, 'w780')}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-ndp-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative flex w-full p-4">
        {/* Left: info */}
        <div className="flex-1 flex flex-col justify-between min-w-0 pr-4">
          <div>
            <div className="flex items-center gap-2">
              {year && <span className="text-xs text-white/60 font-medium">{year}</span>}
              <span className="text-xs text-white/40">
                {localizedDate(req.createdAt)}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 mt-0.5">
              {req.media?.title || t('requests.unknown_media')}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              {req.user?.avatar ? (
                <img src={req.user.avatar} alt="" className="w-5 h-5 rounded-full ring-1 ring-white/20" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-ndp-accent/30 flex items-center justify-center text-[10px] text-white font-bold">
                  {(req.user?.displayName || '?')[0].toUpperCase()}
                </div>
              )}
              <span className="text-xs text-white/70">{req.user?.displayName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-white/50">{t('requests.status')}</span>
            {download ? (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold text-white bg-ndp-accent flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('status.downloading', { progress: download.progress })}
              </span>
            ) : (
              <span className={clsx('px-2 py-0.5 rounded text-[11px] font-semibold text-white', status.bg)}>
                {t(`status.${status.labelKey}`)}
              </span>
            )}

            {/* Admin actions */}
            {isAdmin && req.status === 'pending' && (
              <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.preventDefault()}>
                <button
                  onClick={(e) => { e.preventDefault(); onAction(req.id, 'approve'); }}
                  disabled={actionLoading === req.id}
                  className="p-1.5 rounded-lg bg-ndp-success/20 text-ndp-success hover:bg-ndp-success/30 transition-colors"
                  title={t('status.approved')}
                >
                  {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); onAction(req.id, 'decline'); }}
                  disabled={actionLoading === req.id}
                  className="p-1.5 rounded-lg bg-ndp-danger/20 text-ndp-danger hover:bg-ndp-danger/30 transition-colors"
                  title={t('status.declined')}
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {req.status === 'pending' && !isAdmin && (
              <button
                onClick={(e) => { e.preventDefault(); onDelete(req.id); }}
                disabled={actionLoading === req.id}
                className="p-1.5 rounded-lg text-white/40 hover:text-ndp-danger hover:bg-ndp-danger/20 transition-colors ml-auto"
                title={t('common.cancel')}
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: poster */}
        <div className="flex-shrink-0 w-[90px] self-center">
          <div className="aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-lg">
            {req.media?.posterPath ? (
              <img
                src={posterUrl(req.media.posterPath, 'w185')}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-ndp-surface-light flex items-center justify-center">
                <Film className="w-6 h-6 text-ndp-text-dim" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Download progress bar */}
      {download && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div className="h-full bg-ndp-accent transition-all duration-1000" style={{ width: `${download.progress}%` }} />
        </div>
      )}
    </Link>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, active, onClick }: {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  bg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-xl p-4 border text-left transition-all duration-200',
        active ? 'border-white/20 ring-1 ring-white/10 scale-[1.02]' : 'border-white/5 hover:border-white/10',
        bg,
        onClick && 'cursor-pointer'
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <Icon className={clsx('w-4 h-4', color)} />
        <p className={clsx('text-2xl font-bold', color)}>{value}</p>
      </div>
      <p className="text-xs text-ndp-text-dim">{label}</p>
    </button>
  );
}
