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

const PAGE_SIZE = 50;

// Tag colors — nsfw gets red, others cycle through these
const TAG_COLORS: Record<string, string> = {
  nsfw: 'bg-red-500/20 text-red-400 ring-red-500/30',
};
const DEFAULT_TAG_COLORS = [
  'bg-violet-500/20 text-violet-400 ring-violet-500/30',
  'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30',
  'bg-amber-500/20 text-amber-400 ring-amber-500/30',
  'bg-cyan-500/20 text-cyan-400 ring-cyan-500/30',
  'bg-pink-500/20 text-pink-400 ring-pink-500/30',
  'bg-blue-500/20 text-blue-400 ring-blue-500/30',
];

function getTagColor(tag: string, index: number): string {
  return TAG_COLORS[tag] || DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length];
}

/** Inline autocomplete tag input for a single keyword row */
function TagCell({ keyword, allTags, onUpdate }: { keyword: Keyword; allTags: string[]; onUpdate: (tmdbId: number, tag: string | null) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const suggestions = input.trim()
    ? allTags.filter((t) => t.toLowerCase().includes(input.toLowerCase()) && t !== keyword.tag)
    : allTags.filter((t) => t !== keyword.tag);

  function handleSelect(tag: string) {
    onUpdate(keyword.tmdbId, tag);
    setEditing(false);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      handleSelect(input.trim().toLowerCase());
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setInput('');
    }
  }

  if (keyword.tag && !editing) {
    const tagIndex = allTags.indexOf(keyword.tag);
    return (
      <div className="flex items-center gap-1.5">
        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ring-1 ${getTagColor(keyword.tag, tagIndex)}`}>
          {keyword.tag}
        </span>
        <button
          onClick={() => onUpdate(keyword.tmdbId, null)}
          className="p-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/10 transition-colors"
          title={t('admin.keywords.tag.clear')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => { setEditing(false); setInput(''); }, 150)}
          placeholder={t('admin.keywords.tag.placeholder')}
          autoFocus
          className="w-full px-2.5 py-1 bg-ndp-surface rounded-lg text-xs text-ndp-text border border-ndp-accent/30 focus:outline-none"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-ndp-surface border border-white/10 rounded-lg shadow-xl z-10 max-h-32 overflow-y-auto">
            {suggestions.map((tag, i) => (
              <button
                key={tag}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(tag); }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-ndp-text hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <span className={`w-2 h-2 rounded-full ring-1 ${getTagColor(tag, i)}`} />
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="px-2.5 py-1 rounded-lg text-xs text-ndp-text-dim bg-white/5 hover:bg-white/10 transition-colors"
    >
      + {t('admin.keywords.tag')}
    </button>
  );
}

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

  useEffect(() => setPage(0), [search]);

  // Derive available tags from current keywords
  const allTags = [...new Set(keywords.map((k) => k.tag).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b));

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

      {/* Active tags summary */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allTags.map((tag, i) => {
            const count = keywords.filter((k) => k.tag === tag).length;
            return (
              <span key={tag} className={`px-2.5 py-1 rounded-lg text-xs font-medium ring-1 ${getTagColor(tag, i)}`}>
                {tag} ({count})
              </span>
            );
          })}
        </div>
      )}

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
                  <TagCell keyword={kw} allTags={allTags} onUpdate={updateTag} />
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
