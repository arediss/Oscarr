import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Filter,
  Film,
  Search,
  CalendarClock,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { posterUrl, backdropUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { MediaRequest } from '@/types';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  pending: { label: 'En attente', icon: Clock, color: 'text-ndp-warning', bg: 'bg-ndp-warning' },
  approved: { label: 'Approuvé', icon: CheckCircle, color: 'text-ndp-accent', bg: 'bg-ndp-accent' },
  declined: { label: 'Refusé', icon: XCircle, color: 'text-ndp-danger', bg: 'bg-ndp-danger' },
  processing: { label: 'En cours', icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500' },
  available: { label: 'Disponible', icon: CheckCircle, color: 'text-ndp-success', bg: 'bg-ndp-success' },
  searching: { label: 'Recherche', icon: Search, color: 'text-ndp-accent', bg: 'bg-ndp-accent' },
  upcoming: { label: 'Prochainement', icon: CalendarClock, color: 'text-purple-400', bg: 'bg-purple-500' },
  failed: { label: 'Échec', icon: AlertCircle, color: 'text-ndp-danger', bg: 'bg-ndp-danger' },
};

export default function RequestsPage() {
  const { isAdmin } = useAuth();
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      const { data } = await api.get(`/requests?${params}`);
      setRequests(data.results);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAction = async (id: number, action: 'approve' | 'decline') => {
    setActionLoading(id);
    try {
      await api.post(`/requests/${id}/${action}`);
      fetchRequests();
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
      fetchRequests();
    } catch (err) {
      console.error('Failed to delete request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-ndp-text">Demandes</h1>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-ndp-text-dim" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input text-sm py-2"
          >
            <option value="">Toutes</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvées</option>
            <option value="declined">Refusées</option>
            <option value="available">Disponibles</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-ndp-accent animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <Film className="w-16 h-16 text-ndp-text-dim mx-auto mb-4" />
          <p className="text-ndp-text-muted text-lg">Aucune demande</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2 mt-4">
            Rechercher un média
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
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
            {year && (
              <span className="text-xs text-white/60 font-medium">{year}</span>
            )}
            <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 mt-0.5">
              {req.media?.title || 'Média inconnu'}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              {req.user?.avatar ? (
                <img src={req.user.avatar} alt="" className="w-5 h-5 rounded-full ring-1 ring-white/20" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-ndp-accent/30 flex items-center justify-center text-[10px] text-white font-bold">
                  {(req.user?.plexUsername || '?')[0].toUpperCase()}
                </div>
              )}
              <span className="text-xs text-white/70">{req.user?.plexUsername}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-white/50">Status</span>
            <span className={clsx('px-2 py-0.5 rounded text-[11px] font-semibold text-white', status.bg)}>
              {status.label}
            </span>

            {/* Admin actions */}
            {isAdmin && req.status === 'pending' && (
              <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.preventDefault()}>
                <button
                  onClick={(e) => { e.preventDefault(); onAction(req.id, 'approve'); }}
                  disabled={actionLoading === req.id}
                  className="p-1.5 rounded-lg bg-ndp-success/20 text-ndp-success hover:bg-ndp-success/30 transition-colors"
                  title="Approuver"
                >
                  {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); onAction(req.id, 'decline'); }}
                  disabled={actionLoading === req.id}
                  className="p-1.5 rounded-lg bg-ndp-danger/20 text-ndp-danger hover:bg-ndp-danger/30 transition-colors"
                  title="Refuser"
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
                title="Annuler"
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
    </Link>
  );
}
