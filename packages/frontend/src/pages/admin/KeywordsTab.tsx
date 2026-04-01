import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Tag, X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';

interface Keyword {
  id: number;
  tmdbId: number;
  name: string;
  tag: string | null;
  mediaCount: number;
}

const TAG_OPTIONS = ['nsfw', 'anime'] as const;
const PAGE_SIZE = 50;

export function KeywordsTab() {
  const { t } = useTranslation();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Keyword[]>('/admin/keywords')
      .then(({ data }) => setKeywords(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Reset to page 0 when search changes
  useEffect(() => setPage(0), [search]);

  async function updateTag(tmdbId: number, tag: string | null) {
    try {
      await api.patch(`/admin/keywords/${tmdbId}`, { tag });
      setKeywords((prev) =>
        prev.map((k) => (k.tmdbId === tmdbId ? { ...k, tag } : k))
      );
    } catch {}
  }

  const filtered = keywords.filter((k) =>
    k.name.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: tagged first, then by media count desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.tag && !b.tag) return -1;
    if (!a.tag && b.tag) return 1;
    return b.mediaCount - a.mediaCount;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-ndp-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (keywords.length === 0) {
    return (
      <div className="text-center py-12 text-ndp-text-muted">
        <Tag className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>{t('admin.keywords.empty')}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-ndp-text-muted mb-4">{t('admin.keywords.description')}</p>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.keywords.search')}
          className="w-full pl-10 pr-4 py-2 bg-ndp-surface rounded-xl text-sm text-ndp-text placeholder:text-ndp-text-dim border border-white/5 focus:border-ndp-accent/30 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ndp-surface text-ndp-text-muted text-left">
              <th className="px-4 py-3 font-medium">{t('admin.keywords.name')}</th>
              <th className="px-4 py-3 font-medium text-right w-24">{t('admin.keywords.media_count')}</th>
              <th className="px-4 py-3 font-medium w-48">{t('admin.keywords.tag')}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((kw) => (
              <tr key={kw.tmdbId} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 text-ndp-text">{kw.name}</td>
                <td className="px-4 py-2.5 text-ndp-text-muted text-right">{kw.mediaCount}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {TAG_OPTIONS.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => updateTag(kw.tmdbId, kw.tag === tag ? null : tag)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          kw.tag === tag
                            ? tag === 'nsfw'
                              ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                              : 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
                            : 'bg-white/5 text-ndp-text-dim hover:bg-white/10'
                        }`}
                      >
                        {t(`admin.keywords.tag.${tag}`)}
                      </button>
                    ))}
                    {kw.tag && (
                      <button
                        onClick={() => updateTag(kw.tmdbId, null)}
                        className="p-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/10 transition-colors"
                        title={t('admin.keywords.tag.clear')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-ndp-text-dim">
          {filtered.length} / {keywords.length} keywords
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg text-ndp-text-muted hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-ndp-text-muted">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg text-ndp-text-muted hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
