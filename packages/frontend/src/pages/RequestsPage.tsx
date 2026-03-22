import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { posterUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { MediaRequest } from '@/types';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: 'En attente', icon: Clock, color: 'text-ndp-warning' },
  approved: { label: 'Approuvé', icon: CheckCircle, color: 'text-ndp-accent' },
  declined: { label: 'Refusé', icon: XCircle, color: 'text-ndp-danger' },
  processing: { label: 'En cours', icon: Loader2, color: 'text-blue-400' },
  available: { label: 'Disponible', icon: CheckCircle, color: 'text-ndp-success' },
  failed: { label: 'Échec', icon: AlertCircle, color: 'text-ndp-danger' },
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
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-ndp-text">Demandes</h1>

        {/* Filter */}
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
          <Link to="/search" className="btn-primary inline-flex items-center gap-2 mt-4">
            Rechercher un média
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const status = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const StatusIcon = status.icon;
            const mediaLink = `/${req.mediaType}/${req.media?.tmdbId}`;

            return (
              <div
                key={req.id}
                className="card flex items-center gap-4 p-4 hover:bg-ndp-surface-light/50 transition-colors"
              >
                {/* Poster */}
                <Link to={mediaLink} className="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden bg-ndp-surface-light">
                  {req.media?.posterPath ? (
                    <img src={posterUrl(req.media.posterPath, 'w92')} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ndp-text-dim text-lg">🎬</div>
                  )}
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link to={mediaLink} className="text-ndp-text font-semibold hover:text-ndp-accent transition-colors truncate block">
                    {req.media?.title || 'Média inconnu'}
                  </Link>
                  <div className="flex items-center gap-3 mt-1 text-xs text-ndp-text-muted">
                    <span className="uppercase">{req.mediaType === 'movie' ? 'Film' : 'Série'}</span>
                    {req.seasons && (
                      <span>Saisons: {JSON.parse(req.seasons).join(', ')}</span>
                    )}
                    <span>{new Date(req.createdAt).toLocaleDateString('fr-FR')}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {req.user?.avatar && (
                      <img src={req.user.avatar} alt="" className="w-4 h-4 rounded-full" />
                    )}
                    <span className="text-xs text-ndp-text-dim">{req.user?.plexUsername}</span>
                  </div>
                </div>

                {/* Status */}
                <div className={clsx('flex items-center gap-1.5 text-sm font-medium', status.color)}>
                  <StatusIcon className={clsx('w-4 h-4', req.status === 'processing' && 'animate-spin')} />
                  <span className="hidden sm:inline">{status.label}</span>
                </div>

                {/* Admin actions */}
                {isAdmin && req.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(req.id, 'approve')}
                      disabled={actionLoading === req.id}
                      className="p-2 rounded-lg bg-ndp-success/10 text-ndp-success hover:bg-ndp-success/20 transition-colors"
                      title="Approuver"
                    >
                      {actionLoading === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'decline')}
                      disabled={actionLoading === req.id}
                      className="p-2 rounded-lg bg-ndp-danger/10 text-ndp-danger hover:bg-ndp-danger/20 transition-colors"
                      title="Refuser"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Delete for own pending requests */}
                {req.status === 'pending' && (
                  <button
                    onClick={() => handleDelete(req.id)}
                    disabled={actionLoading === req.id}
                    className="p-2 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                    title="Annuler"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Film(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" />
    </svg>
  );
}
