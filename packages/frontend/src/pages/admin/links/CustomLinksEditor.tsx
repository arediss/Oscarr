import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, Save, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { showToast } from '@/utils/toast';
import { useFeatures } from '@/context/FeaturesContext';
import { IconPicker } from '@/pages/admin/dashboard/IconPicker';
import { LinkIcon } from '@/icons/LinkIcon';

interface CustomLink {
  id: string;
  label: string;
  url: string;
  icon: string;
  position: 'left' | 'right';
  order: number;
}

const HTTPS_RE = /^https:\/\/\S+$/;

function newDraft(position: 'left' | 'right'): CustomLink {
  return {
    id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    url: '',
    icon: 'ExternalLink',
    position,
    order: 0,
  };
}

export function CustomLinksEditor() {
  const { t } = useTranslation();
  const { refreshFeatures } = useFeatures();
  const [links, setLinks] = useState<CustomLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/custom-links');
      setLinks(Array.isArray(data) ? data : []);
      setDirty(false);
    } catch (err) {
      console.error('CustomLinks load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { leftLinks, rightLinks } = useMemo(() => ({
    leftLinks: links.filter((l) => l.position === 'left'),
    rightLinks: links.filter((l) => l.position === 'right'),
  }), [links]);

  const update = (id: string, patch: Partial<CustomLink>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const remove = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setDirty(true);
  };

  /** Move within the link's column. The full `links` array stays the source of truth — we swap
   *  the two entries' positions in that array. */
  const move = (id: string, direction: -1 | 1) => {
    setLinks((prev) => {
      const link = prev.find((l) => l.id === id);
      if (!link) return prev;
      const sameSide = prev.filter((l) => l.position === link.position);
      const idxInSide = sameSide.findIndex((l) => l.id === id);
      const target = sameSide[idxInSide + direction];
      if (!target) return prev;
      const a = prev.indexOf(link);
      const b = prev.indexOf(target);
      const swapped = [...prev];
      [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
      return swapped;
    });
    setDirty(true);
  };

  const add = (position: 'left' | 'right') => {
    setLinks((prev) => [...prev, newDraft(position)]);
    setDirty(true);
  };

  const allValid = links.every((l) => l.label.trim().length > 0 && l.label.trim().length <= 50 && HTTPS_RE.test(l.url));

  const save = async () => {
    if (!allValid || saving) return;
    setSaving(true);
    try {
      const { data } = await api.put('/admin/custom-links', {
        links: links.map((l, i) => ({
          ...(l.id.startsWith('tmp-') ? {} : { id: l.id }),
          label: l.label.trim(),
          url: l.url.trim(),
          icon: l.icon,
          position: l.position,
          order: i,
        })),
      });
      setLinks(data.links);
      setDirty(false);
      refreshFeatures();
      showToast(t('admin.custom_links.saved', 'Liens enregistrés'), 'success');
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? t('admin.custom_links.save_failed', 'Échec de la sauvegarde');
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ndp-text-dim" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ndp-text">{t('admin.custom_links.title', 'Liens rapides')}</h2>
        <p className="text-sm text-ndp-text-dim mt-1">
          {t('admin.custom_links.help', 'Raccourcis affichés dans la barre du haut, à gauche ou à droite de la recherche.')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Column
          label={t('admin.custom_links.column_left', 'À gauche de la recherche')}
          links={leftLinks}
          onUpdate={update}
          onRemove={remove}
          onMove={move}
          onAdd={() => add('left')}
        />
        <Column
          label={t('admin.custom_links.column_right', 'À droite de la recherche')}
          links={rightLinks}
          onUpdate={update}
          onRemove={remove}
          onMove={move}
          onAdd={() => add('right')}
        />
      </div>

      {!allValid && links.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ndp-warning/10 text-ndp-warning text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {t('admin.custom_links.invalid_warning', 'Chaque lien doit avoir un label et une URL https://')}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <button
            onClick={load}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {t('common.cancel', 'Annuler')}
          </button>
        )}
        <button
          onClick={save}
          disabled={!dirty || !allValid || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-ndp-accent text-white hover:bg-ndp-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('common.save', 'Sauvegarder')}
        </button>
      </div>
    </div>
  );
}

interface ColumnProps {
  label: string;
  links: CustomLink[];
  onUpdate: (id: string, patch: Partial<CustomLink>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onAdd: () => void;
}

function Column({ label, links, onUpdate, onRemove, onMove, onAdd }: Readonly<ColumnProps>) {
  const { t } = useTranslation();
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-ndp-text-dim">{label}</p>
        <span className={clsx(
          'text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums',
          links.length > 0 ? 'bg-ndp-accent/10 text-ndp-accent' : 'bg-white/5 text-ndp-text-dim',
        )}>
          {links.length}
        </span>
      </div>

      {links.length === 0 ? (
        <div className="py-6 text-center text-xs text-ndp-text-dim border border-dashed border-white/10 rounded-lg">
          {t('admin.custom_links.empty_column', 'Aucun lien')}
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link, idx) => (
            <LinkRow
              key={link.id}
              link={link}
              isFirst={idx === 0}
              isLast={idx === links.length - 1}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onMove={onMove}
            />
          ))}
        </div>
      )}

      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/10 hover:border-ndp-accent/40 hover:bg-ndp-accent/[0.04] text-xs font-medium text-ndp-text-dim hover:text-ndp-accent transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {t('admin.custom_links.add', 'Ajouter un lien')}
      </button>
    </div>
  );
}

interface LinkRowProps {
  link: CustomLink;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (id: string, patch: Partial<CustomLink>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

function LinkRow({ link, isFirst, isLast, onUpdate, onRemove, onMove }: Readonly<LinkRowProps>) {
  const { t } = useTranslation();
  const labelOk = link.label.trim().length > 0 && link.label.trim().length <= 50;
  const urlOk = HTTPS_RE.test(link.url);
  const showReorder = !(isFirst && isLast);

  return (
    <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/5 hover:ring-white/10 transition-colors p-3">
      <div className="flex items-start gap-3">
        <IconPicker
          value={link.icon}
          onChange={(next) => onUpdate(link.id, { icon: next ?? 'ExternalLink' })}
          tabs={['lucide', 'brands', 'url']}
          trigger={
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/5 hover:ring-ndp-accent/30 transition-colors flex-shrink-0"
              title={t('admin.custom_links.icon_picker_hint', 'Changer l’icône')}
            >
              <LinkIcon value={link.icon} className="h-5 w-5 text-ndp-text-muted" />
            </button>
          }
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            type="text"
            value={link.label}
            onChange={(e) => onUpdate(link.id, { label: e.target.value })}
            placeholder={t('admin.custom_links.label_placeholder', 'Label (ex: Discord)')}
            maxLength={50}
            className={clsx(
              'w-full px-3 py-1.5 rounded-md bg-white/[0.04] border text-sm text-ndp-text placeholder:text-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 focus:border-transparent',
              labelOk ? 'border-white/5' : 'border-ndp-warning/40',
            )}
          />
          <input
            type="url"
            value={link.url}
            onChange={(e) => onUpdate(link.id, { url: e.target.value })}
            placeholder="https://..."
            className={clsx(
              'w-full px-3 py-1.5 rounded-md bg-white/[0.04] border text-xs text-ndp-text-muted placeholder:text-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 focus:border-transparent font-mono',
              urlOk ? 'border-white/5' : 'border-ndp-warning/40',
            )}
          />
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between gap-2">
        <PositionPicker value={link.position} onChange={(p) => onUpdate(link.id, { position: p })} />
        <div className="flex items-center gap-1">
          {showReorder && (
            <>
              <button
                onClick={() => onMove(link.id, -1)}
                disabled={isFirst}
                className="p-1 rounded text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={t('admin.custom_links.move_up', 'Monter')}
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onMove(link.id, 1)}
                disabled={isLast}
                className="p-1 rounded text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={t('admin.custom_links.move_down', 'Descendre')}
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <span className="w-px h-4 bg-white/10 mx-0.5" />
            </>
          )}
          <button
            onClick={() => onRemove(link.id)}
            className="p-1 rounded text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
            aria-label={t('common.delete', 'Supprimer')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PositionPicker({ value, onChange }: { value: 'left' | 'right'; onChange: (p: 'left' | 'right') => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex p-0.5 rounded-md bg-white/5">
      <button
        onClick={() => onChange('left')}
        className={clsx(
          'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
          value === 'left' ? 'bg-ndp-accent text-white' : 'text-ndp-text-dim hover:text-ndp-text',
        )}
      >
        ← {t('admin.custom_links.position_left_short', 'Gauche')}
      </button>
      <button
        onClick={() => onChange('right')}
        className={clsx(
          'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
          value === 'right' ? 'bg-ndp-accent text-white' : 'text-ndp-text-dim hover:text-ndp-text',
        )}
      >
        {t('admin.custom_links.position_right_short', 'Droite')} →
      </button>
    </div>
  );
}
