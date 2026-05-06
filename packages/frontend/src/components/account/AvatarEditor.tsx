import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, Check, X, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { createAvatar, type Style } from '@dicebear/core';
import * as avataaars from '@dicebear/avataaars';

const avataaarsStyle = avataaars as unknown as Style<Record<string, unknown>>;
const schema = (avataaars as unknown as { schema: Record<string, unknown> }).schema as {
  properties: Record<string, { items?: { enum?: string[]; default?: string[] }; default?: string[] }>;
};

const ENUM = (key: string): string[] => schema.properties[key]?.items?.enum ?? [];
const PALETTE = (key: string): string[] => schema.properties[key]?.default ?? [];

const HAT_TOPS = new Set(['hat', 'hijab', 'turban', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04']);
const HAIR_TOPS = ENUM('top').filter((id) => !HAT_TOPS.has(id));
const HAT_TOP_LIST = ENUM('top').filter((id) => HAT_TOPS.has(id));

const BACKGROUND_PALETTE = [
  // Neutres clairs
  'ffffff', 'f5f5f4', 'e7e5e4', 'd6d3d1',
  // Neutres sombres
  '0f172a', '1c1917', '292524', '44403c',
  // Pastels
  'fce7f3', 'fef3c7', 'd1fae5', 'dbeafe', 'e0e7ff', 'fae8ff', 'ccfbf1',
  // Vifs (existants)
  '65c9ff', 'ff488e', 'ff5c5c', '8b5cf6',
  // Doux warm (existants)
  'ffdeb5', 'ffafb9', 'a7ffc4', 'ffffb1',
];

function prettify(id: string): string {
  return id
    .replaceAll(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replaceAll(/(\d+)/g, ' $1')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export interface AvatarOptions {
  topKind?: 'none' | 'hair' | 'hat';
  top?: string;
  hairColor?: string;
  hatColor?: string;
  accessories?: string;
  accessoriesColor?: string;
  clothing?: string;
  clothesColor?: string;
  clothingGraphic?: string;
  eyebrows?: string;
  eyes?: string;
  facialHair?: string;
  facialHairColor?: string;
  mouth?: string;
  skinColor?: string;
  backgroundColor?: string;
}

function toDiceBearOptions(opts: AvatarOptions, seed: string): Record<string, unknown> {
  const out: Record<string, unknown> = { seed, size: 96 };

  if (opts.topKind === 'none') {
    out.topProbability = 0;
  } else if (opts.top) {
    out.top = [opts.top];
    out.topProbability = 100;
  }
  if (opts.hairColor) out.hairColor = [opts.hairColor];
  if (opts.hatColor) out.hatColor = [opts.hatColor];

  if (opts.accessories === 'none') {
    out.accessoriesProbability = 0;
  } else if (opts.accessories) {
    out.accessories = [opts.accessories];
    out.accessoriesProbability = 100;
  }
  if (opts.accessoriesColor) out.accessoriesColor = [opts.accessoriesColor];

  if (opts.clothing) out.clothing = [opts.clothing];
  if (opts.clothesColor) out.clothesColor = [opts.clothesColor];
  if (opts.clothingGraphic) out.clothingGraphic = [opts.clothingGraphic];

  if (opts.eyebrows) out.eyebrows = [opts.eyebrows];
  if (opts.eyes) out.eyes = [opts.eyes];
  if (opts.mouth) out.mouth = [opts.mouth];

  if (opts.facialHair === 'none') {
    out.facialHairProbability = 0;
  } else if (opts.facialHair) {
    out.facialHair = [opts.facialHair];
    out.facialHairProbability = 100;
  }
  if (opts.facialHairColor) out.facialHairColor = [opts.facialHairColor];

  if (opts.skinColor) out.skinColor = [opts.skinColor];
  if (opts.backgroundColor) out.backgroundColor = [opts.backgroundColor];

  return out;
}

function renderDataUri(opts: AvatarOptions, seed: string): string {
  const svg = createAvatar(avataaarsStyle, toDiceBearOptions(opts, seed)).toString();
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/** Re-render a saved avatar config to a data URI without opening the editor. Used when the user
 *  toggles back to "Oscarr" after switching to another source — restores the previous look from
 *  the persisted config instead of forcing a re-edit. */
export function renderDicebearAvatar(seed: string, options: AvatarOptions): string {
  return renderDataUri(options, seed);
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Resolve every option into an explicit value derived from the seed — required so the selects
 *  can display a concrete current choice (without this, opts.eyes is undefined while DiceBear's
 *  internal pick is opaque, leaving the dropdown empty even though the avatar shows specific eyes).
 *  Algorithm matches DiceBear's xorshift PRNG style — the output won't be byte-identical to
 *  DiceBear's internal pick, but it's deterministic per seed and good enough as a starting point. */
function seededDefaults(seed: string): AvatarOptions {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const next = () => { h ^= h << 13; h ^= h >> 17; h ^= h << 5; return h; };
  const pick = <T,>(arr: T[]): T => arr[Math.abs(next()) % arr.length];
  const clothing = pick(ENUM('clothing'));
  return {
    skinColor: pick(PALETTE('skinColor')),
    eyes: pick(ENUM('eyes')),
    eyebrows: pick(ENUM('eyebrows')),
    mouth: pick(ENUM('mouth')),
    topKind: 'hair',
    top: pick(HAIR_TOPS),
    hairColor: pick(PALETTE('hairColor')),
    hatColor: pick(PALETTE('hatColor')),
    facialHair: 'none',
    facialHairColor: pick(PALETTE('facialHairColor')),
    accessories: 'none',
    accessoriesColor: pick(PALETTE('accessoriesColor')),
    clothing,
    clothesColor: pick(PALETTE('clothesColor')),
    clothingGraphic: clothing === 'graphicShirt' ? pick(ENUM('clothingGraphic')) : undefined,
    backgroundColor: pick(BACKGROUND_PALETTE),
  };
}

interface AvatarEditorProps {
  initialSeed?: string;
  initialOptions?: AvatarOptions;
  onCancel: () => void;
  onSave: (params: { seed: string; options: AvatarOptions; dataUri: string }) => Promise<void> | void;
  saving: boolean;
}

export default function AvatarEditor({ initialSeed, initialOptions, onCancel, onSave, saving }: Readonly<AvatarEditorProps>) {
  const { t } = useTranslation();
  const [seed, setSeedRaw] = useState(() => initialSeed ?? randomSeed());
  const [opts, setOpts] = useState<AvatarOptions>(() =>
    initialOptions && Object.keys(initialOptions).length > 0
      ? initialOptions
      : seededDefaults(initialSeed ?? seed),
  );

  const setOpt = <K extends keyof AvatarOptions>(key: K, value: AvatarOptions[K]) => {
    setOpts((prev) => ({ ...prev, [key]: value }));
  };

  const mainPreview = useMemo(() => renderDataUri(opts, seed), [opts, seed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [onCancel, saving]);

  const shuffle = () => {
    const newSeed = randomSeed();
    setSeedRaw(newSeed);
    setOpts(seededDefaults(newSeed));
  };

  const noneLabel = t('account.avatar.editor.kind.none', 'Aucun');

  return (
    <div className="rounded-2xl border border-ndp-accent/20 bg-ndp-accent/5 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-ndp-text">
            {t('account.avatar.editor.title', 'Personnalise ton avatar')}
          </h3>
          <p className="text-xs text-ndp-text-dim mt-0.5">
            {t('account.avatar.editor.hint', 'Choisis chaque trait — preview en direct, save quand t’es satisfait.')}
          </p>
        </div>
        <button
          onClick={onCancel}
          disabled={saving}
          className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors disabled:opacity-50"
          aria-label={t('common.close', 'Close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="border-t border-white/5 flex flex-col md:flex-row max-h-[60vh]">
        {/* Column A — preview + identity (skin / background) + shuffle */}
        <div className="md:w-64 md:border-r border-white/5 p-5 space-y-4 flex-shrink-0">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
            <img src={mainPreview} alt="" className="w-full h-full p-1.5 object-contain" />
          </div>

          <button
            onClick={shuffle}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-ndp-text-muted hover:text-ndp-text transition-colors disabled:opacity-50 text-xs font-medium"
          >
            <Dices className="w-4 h-4" />
            {t('account.avatar.editor.shuffle', 'Aléatoire')}
          </button>

          <div className="flex items-center gap-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ndp-text-dim flex-1">
              {t('account.avatar.editor.section.skin', 'Peau')}
            </p>
            <ColorPicker palette={PALETTE('skinColor')} value={opts.skinColor} onChange={(c) => setOpt('skinColor', c)} saving={saving} />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ndp-text-dim flex-1">
              {t('account.avatar.editor.section.background', 'Fond')}
            </p>
            <ColorPicker palette={BACKGROUND_PALETTE} value={opts.backgroundColor} onChange={(c) => setOpt('backgroundColor', c)} saving={saving} />
          </div>
        </div>

        {/* Column B — every trait select with its color picker */}
        <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-4">
        <Row label={t('account.avatar.editor.section.eyes', 'Yeux')}>
          <Select options={ENUM('eyes')} value={opts.eyes} onChange={(v) => setOpt('eyes', v)} saving={saving} />
        </Row>

        <Row label={t('account.avatar.editor.section.eyebrows', 'Sourcils')}>
          <Select options={ENUM('eyebrows')} value={opts.eyebrows} onChange={(v) => setOpt('eyebrows', v)} saving={saving} />
        </Row>

        <Row label={t('account.avatar.editor.section.mouth', 'Bouche')}>
          <Select options={ENUM('mouth')} value={opts.mouth} onChange={(v) => setOpt('mouth', v)} saving={saving} />
        </Row>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ndp-text-dim">
            {t('account.avatar.editor.section.hair', 'Cheveux')}
          </p>
          <KindToggle
            current={opts.topKind}
            saving={saving}
            options={[
              { id: 'none', label: noneLabel },
              { id: 'hair', label: t('account.avatar.editor.kind.hair', 'Cheveux') },
              { id: 'hat', label: t('account.avatar.editor.kind.hat', 'Chapeau') },
            ]}
            onPick={(k) => {
              if (k === 'none') setOpts((p) => ({ ...p, topKind: 'none', top: undefined }));
              else if (k === 'hair') setOpts((p) => ({ ...p, topKind: 'hair', top: HAIR_TOPS[0] }));
              else setOpts((p) => ({ ...p, topKind: 'hat', top: HAT_TOP_LIST[0] }));
            }}
          />
          {opts.topKind && opts.topKind !== 'none' && (
            <div className="flex items-center gap-2">
              <Select
                className="flex-1"
                options={opts.topKind === 'hat' ? HAT_TOP_LIST : HAIR_TOPS}
                value={opts.top}
                onChange={(v) => setOpt('top', v)}
                saving={saving}
              />
              <ColorPicker
                palette={opts.topKind === 'hat' ? PALETTE('hatColor') : PALETTE('hairColor')}
                value={opts.topKind === 'hat' ? opts.hatColor : opts.hairColor}
                onChange={(c) => setOpt(opts.topKind === 'hat' ? 'hatColor' : 'hairColor', c)}
                saving={saving}
              />
            </div>
          )}
        </div>

        <Row label={t('account.avatar.editor.section.facial_hair', 'Pilosité')}>
          <Select
            className="flex-1"
            options={['none', ...ENUM('facialHair')]}
            value={opts.facialHair ?? 'none'}
            onChange={(v) => setOpt('facialHair', v)}
            saving={saving}
            labelMap={{ none: noneLabel }}
          />
          {opts.facialHair && opts.facialHair !== 'none' && (
            <ColorPicker palette={PALETTE('facialHairColor')} value={opts.facialHairColor} onChange={(c) => setOpt('facialHairColor', c)} saving={saving} />
          )}
        </Row>

        <Row label={t('account.avatar.editor.section.accessories', 'Lunettes')}>
          <Select
            className="flex-1"
            options={['none', ...ENUM('accessories')]}
            value={opts.accessories ?? 'none'}
            onChange={(v) => setOpt('accessories', v)}
            saving={saving}
            labelMap={{ none: noneLabel }}
          />
          {opts.accessories && opts.accessories !== 'none' && (
            <ColorPicker palette={PALETTE('accessoriesColor')} value={opts.accessoriesColor} onChange={(c) => setOpt('accessoriesColor', c)} saving={saving} />
          )}
        </Row>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ndp-text-dim">
            {t('account.avatar.editor.section.clothing', 'Vêtements')}
          </p>
          <div className="flex items-center gap-2">
            <Select
              className="flex-1"
              options={ENUM('clothing')}
              value={opts.clothing}
              onChange={(v) => setOpt('clothing', v)}
              saving={saving}
            />
            <ColorPicker palette={PALETTE('clothesColor')} value={opts.clothesColor} onChange={(c) => setOpt('clothesColor', c)} saving={saving} />
          </div>
          {opts.clothing === 'graphicShirt' && (
            <Select
              options={ENUM('clothingGraphic')}
              value={opts.clothingGraphic}
              onChange={(v) => setOpt('clothingGraphic', v)}
              saving={saving}
            />
          )}
        </div>
        </div>
      </div>

      <div className="border-t border-white/5 px-5 py-3 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-sm text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {t('common.cancel', 'Annuler')}
        </button>
        <button
          onClick={() => onSave({ seed, options: opts, dataUri: mainPreview })}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-ndp-accent text-white hover:bg-ndp-accent/90 transition-colors disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          {t('common.save', 'Sauvegarder')}
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ndp-text-dim w-24 flex-shrink-0">{label}</p>
      <div className="flex-1 flex items-center gap-2">{children}</div>
    </div>
  );
}

interface KindToggleProps {
  current: string | undefined;
  options: { id: string; label: string }[];
  onPick: (id: 'none' | 'hair' | 'hat') => void;
  saving: boolean;
}

function KindToggle({ current, options, onPick, saving }: Readonly<KindToggleProps>) {
  return (
    <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-white/5">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onPick(opt.id as 'none' | 'hair' | 'hat')}
          disabled={saving}
          className={clsx(
            'px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50',
            current === opt.id
              ? 'bg-ndp-accent text-white'
              : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SelectProps {
  options: string[];
  value?: string;
  onChange: (value: string) => void;
  saving: boolean;
  labelMap?: Record<string, string>;
  className?: string;
}

function Select({ options, value, onChange, saving, labelMap, className }: Readonly<SelectProps>) {
  return (
    <div className={clsx('relative', className ?? 'flex-1')}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        className="w-full appearance-none px-3 py-2 pr-9 rounded-lg bg-white/5 border border-white/10 text-sm text-ndp-text focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 disabled:opacity-50 cursor-pointer"
      >
        {!value && <option value="" disabled>—</option>}
        {options.map((id) => (
          <option key={id} value={id}>{labelMap?.[id] ?? prettify(id)}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
    </div>
  );
}

interface ColorPickerProps {
  palette: string[];
  value?: string;
  onChange: (color: string) => void;
  saving: boolean;
}

function ColorPicker({ palette, value, onChange, saving }: Readonly<ColorPickerProps>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const display = value ?? palette[0] ?? '888888';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => !saving && setOpen((o) => !o)}
        disabled={saving}
        className="w-9 h-9 rounded-full border-2 border-white/20 hover:border-white/40 transition-all hover:scale-105 shadow-inner disabled:opacity-50"
        style={{ backgroundColor: `#${display}` }}
        aria-label="color"
      />
      {open && (
        <div className="absolute z-30 right-0 top-full mt-2 p-3 rounded-xl bg-ndp-surface border border-white/10 shadow-2xl shadow-black/50">
          <div className="grid grid-cols-5 gap-2 w-max">
            {palette.map((c) => {
              const isSel = value === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={clsx(
                    'w-7 h-7 rounded-full border-2 transition-transform hover:scale-110',
                    isSel ? 'border-ndp-accent scale-110' : 'border-white/15',
                  )}
                  style={{ backgroundColor: `#${c}` }}
                  title={`#${c}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
