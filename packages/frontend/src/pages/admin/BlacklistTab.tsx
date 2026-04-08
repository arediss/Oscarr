import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Trash2, ShieldBan, Search, Film, X } from 'lucide-react';
import api from '@/lib/api';
import { posterUrl } from '@/lib/api';
import { Spinner } from './Spinner';
import { AdminTabLayout } from './AdminTabLayout';

interface BlacklistEntry {
  id: number;
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  reason: string | null;
  createdAt: string;
  createdBy?: { id: number; displayName: string | null } | null;
}

interface TmdbResult {
  id: number;
  title?: string;
  name?: string;
  media_type: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

export function BlacklistTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRef = useRef<HTMLDivElement>(null);

  // Confirm modal
  const [confirmMedia, setConfirmMedia] = useState<TmdbResult | null>(null);
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchEntries = () => {
    api.get('/admin/blacklist').then(({ data }) => setEntries(data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchEntries(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    clearTimeout(searchTimeout.current);
    if (!value.trim()) { setResults([]); setShowResults(false); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/tmdb/search?q=${encodeURIComponent(value.trim())}`);
        setResults((data.results || []).filter((r: TmdbResult) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 6));
        setShowResults(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  };

  const handleAdd = async () => {
    if (!confirmMedia) return;
    setAdding(true);
    const mediaType = confirmMedia.media_type === 'tv' ? 'tv' : 'movie';
    const title = confirmMedia.title || confirmMedia.name || 'Unknown';
    try {
      await api.post('/admin/blacklist', { tmdbId: confirmMedia.id, mediaType, title, posterPath: confirmMedia.poster_path, reason: reason.trim() || undefined });
      setConfirmMedia(null);
      setReason('');
      setQuery('');
      setResults([]);
      fetchEntries();
    } catch { /* already blacklisted */ }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.delete(`/admin/blacklist/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch { /* error */ }
    finally { setDeleting(null); }
  };

  const isBlocked = (tmdbId: number, mediaType: string) =>
    entries.some(e => e.tmdbId === tmdbId && e.mediaType === mediaType);

  if (loading) return <Spinner />;

  return (
    <AdminTabLayout title={t('admin.blacklist.title')} count={entries.length}>

      {/* Search bar */}
      <div ref={searchRef} className="relative mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder={t('admin.blacklist.search_placeholder')}
            className="input w-full text-sm pl-10"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim animate-spin" />}
        </div>

        {/* Results dropdown */}
        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-ndp-surface border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
            {results.map(r => {
              const title = r.title || r.name || 'Unknown';
              const year = (r.release_date || r.first_air_date || '').slice(0, 4);
              const type = r.media_type === 'tv' ? 'tv' : 'movie';
              const blocked = isBlocked(r.id, type);
              return (
                <button
                  key={`${r.media_type}-${r.id}`}
                  onClick={() => {
                    if (blocked) return;
                    setConfirmMedia(r);
                    setReason('');
                    setShowResults(false);
                  }}
                  disabled={blocked}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    blocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-ndp-surface-light',
                  )}
                >
                  <div className="w-8 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-ndp-surface-light">
                    {r.poster_path ? (
                      <img src={posterUrl(r.poster_path, 'w92')} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Film className="w-3 h-3 text-ndp-text-dim" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ndp-text truncate">{title}</p>
                    <p className="text-xs text-ndp-text-dim">{type === 'tv' ? 'Series' : 'Movie'}{year && ` · ${year}`}</p>
                  </div>
                  {blocked && (
                    <ShieldBan className="w-4 h-4 text-ndp-danger flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmMedia && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setConfirmMedia(null)}>
          <div className="bg-ndp-surface border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-ndp-text flex items-center gap-2">
                <ShieldBan className="w-4 h-4 text-ndp-danger" />
                {t('admin.blacklist.confirm_title')}
              </h3>
              <button onClick={() => setConfirmMedia(null)} className="text-ndp-text-dim hover:text-ndp-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-ndp-surface-light">
              <div className="w-14 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-ndp-surface">
                {confirmMedia.poster_path ? (
                  <img src={posterUrl(confirmMedia.poster_path, 'w185')} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Film className="w-5 h-5 text-ndp-text-dim" /></div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-ndp-text">{confirmMedia.title || confirmMedia.name}</p>
                <p className="text-xs text-ndp-text-dim mt-0.5">
                  {confirmMedia.media_type === 'tv' ? 'Series' : 'Movie'}
                  {(confirmMedia.release_date || confirmMedia.first_air_date) && ` · ${(confirmMedia.release_date || confirmMedia.first_air_date || '').slice(0, 4)}`}
                </p>
              </div>
            </div>

            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('admin.blacklist.reason_placeholder')}
              className="input w-full text-sm mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmMedia(null)} className="btn-secondary text-sm">
                {t('common.cancel')}
              </button>
              <button onClick={handleAdd} disabled={adding} className="btn-danger text-sm flex items-center gap-1.5">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldBan className="w-3.5 h-3.5" />}
                {t('admin.blacklist.block')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* List */}
      {entries.length === 0 ? (
        <div className="text-center py-12">
          <ShieldBan className="w-12 h-12 text-ndp-text-dim mx-auto mb-3" />
          <p className="text-ndp-text-muted">{t('admin.blacklist.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {entries.map(entry => (
            <div key={entry.id} className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-ndp-surface-light">
              {entry.posterPath ? (
                <img src={posterUrl(entry.posterPath, 'w185')} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Film className="w-8 h-8 text-ndp-text-dim" /></div>
              )}

              {/* Fixed gradient */}
              <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

              {/* Text + button — text slides up on hover to make room */}
              <div className="absolute bottom-0 left-0 right-0 p-2.5 flex flex-col justify-end">
                <div className="transition-transform duration-300 ease-out group-hover:-translate-y-9">
                  <p className="text-xs font-semibold text-white line-clamp-2">{entry.title}</p>
                  {entry.reason && <p className="text-[10px] text-white/50 line-clamp-1 mt-0.5">{entry.reason}</p>}
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                <button
                  onClick={() => handleDelete(entry.id)}
                  disabled={deleting === entry.id}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-ndp-danger/90 hover:bg-ndp-danger text-white text-xs font-medium transition-colors backdrop-blur-sm"
                >
                  {deleting === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  {t('admin.blacklist.unblock')}
                </button>
              </div>

              {/* Ban icon — always visible */}
              <div className="absolute top-1.5 right-1.5 bg-ndp-danger/80 rounded-full p-1">
                <ShieldBan className="w-3 h-3 text-white" />
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminTabLayout>
  );
}
