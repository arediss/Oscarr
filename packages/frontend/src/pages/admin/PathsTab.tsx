import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Save, CheckCircle, Plus, Trash2, XCircle, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import type { QualityProfile, RootFolder } from '@/types';

interface FolderRule {
  id: number; name: string; priority: number; mediaType: string;
  conditions: string; folderPath: string; seriesType: string | null; serviceId: number | null;
}
interface RuleCondition { field: string; operator: string; value: string; }

const GENRE_KEYS = [
  'action','adventure','animation','comedy','crime','documentary','drama',
  'family','fantasy','history','horror','music','mystery',
  'romance','science_fiction','thriller','war','western',
];

export function PathsTab() {
  const { t } = useTranslation();
  const [radarrFolders, setRadarrFolders] = useState<RootFolder[]>([]);
  const [sonarrFolders, setSonarrFolders] = useState<RootFolder[]>([]);
  const [radarrProfiles, setRadarrProfiles] = useState<QualityProfile[]>([]);
  const [rules, setRules] = useState<FolderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [qualityProfile, setQualityProfile] = useState('');
  const [movieFolder, setMovieFolder] = useState('');
  const [tvFolder, setTvFolder] = useState('');
  const [animeFolder, setAnimeFolder] = useState('');

  // New rule form
  const [showNewRule, setShowNewRule] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMediaType, setNewMediaType] = useState('tv');
  const [newFolder, setNewFolder] = useState('');
  const [newSeriesType, setNewSeriesType] = useState('');
  const [newConditions, setNewConditions] = useState<RuleCondition[]>([{ field: 'genre', operator: 'contains', value: '' }]);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, rFolders, sFolders, rProfiles, rulesRes] = await Promise.all([
          api.get('/admin/settings'),
          api.get('/admin/radarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/sonarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/radarr/profiles').catch(() => ({ data: [] })),
          api.get('/admin/folder-rules').catch(() => ({ data: [] })),
        ]);
        const s = settingsRes.data;
        setQualityProfile(s.defaultQualityProfile?.toString() || '');
        setMovieFolder(s.defaultMovieFolder || '');
        setTvFolder(s.defaultTvFolder || '');
        setAnimeFolder(s.defaultAnimeFolder || '');
        setRadarrFolders(rFolders.data);
        setSonarrFolders(sFolders.data);
        setRadarrProfiles(rProfiles.data);
        setRules(rulesRes.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const saveDefaults = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/admin/settings', {
        defaultQualityProfile: qualityProfile ? parseInt(qualityProfile) : null,
        defaultMovieFolder: movieFolder || null,
        defaultTvFolder: tvFolder || null,
        defaultAnimeFolder: animeFolder || null,
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const addRule = async () => {
    if (!newName || !newFolder || newConditions.some(c => !c.value)) return;
    try {
      const { data } = await api.post('/admin/folder-rules', {
        name: newName, mediaType: newMediaType, folderPath: newFolder,
        seriesType: newSeriesType || null, priority: rules.length,
        conditions: newConditions,
      });
      setRules(prev => [...prev, data]);
      setShowNewRule(false); setNewName(''); setNewFolder(''); setNewSeriesType('');
      setNewConditions([{ field: 'genre', operator: 'contains', value: '' }]);
    } catch (err) { console.error(err); }
  };

  const deleteRule = async (id: number) => {
    try { await api.delete(`/admin/folder-rules/${id}`); setRules(prev => prev.filter(r => r.id !== id)); }
    catch (err) { console.error(err); }
  };

  const allFolders = [...new Map([...radarrFolders, ...sonarrFolders].map(f => [f.path, f])).values()];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-8">
      {/* Default paths — fallback section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ndp-text">{t('admin.paths.defaults_title')}</h2>
          <button onClick={saveDefaults} disabled={saving} className={clsx('flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all', saved ? 'bg-ndp-success/10 text-ndp-success' : 'btn-primary')}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? t('common.saved') : t('common.save')}
          </button>
        </div>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.paths.defaults_desc')}</p>

        <div className="space-y-3">
          <div className="card">
            <div className="flex items-center gap-4 p-4">
              <span className="text-sm font-medium text-ndp-text w-32 flex-shrink-0">{t('admin.paths.quality_profile')}</span>
              <select value={qualityProfile} onChange={(e) => setQualityProfile(e.target.value)} className="input flex-1 text-sm">
                <option value="">Auto</option>
                {radarrProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-4 p-4">
              <span className="text-sm font-medium text-ndp-text w-32 flex-shrink-0">{t('admin.paths.movies')}</span>
              <select value={movieFolder} onChange={(e) => setMovieFolder(e.target.value)} className="input flex-1 text-sm">
                <option value="">Auto</option>
                {radarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
              </select>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-4 p-4">
              <span className="text-sm font-medium text-ndp-text w-32 flex-shrink-0">{t('admin.paths.series')}</span>
              <select value={tvFolder} onChange={(e) => setTvFolder(e.target.value)} className="input flex-1 text-sm">
                <option value="">Auto</option>
                {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
              </select>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-4 p-4">
              <span className="text-sm font-medium text-ndp-text w-32 flex-shrink-0">{t('admin.paths.anime')}</span>
              <select value={animeFolder} onChange={(e) => setAnimeFolder(e.target.value)} className="input flex-1 text-sm">
                <option value="">Auto</option>
                {sonarrFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Routing rules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ndp-text">{t('admin.paths.routing_rules')} ({rules.length})</h2>
          <button onClick={() => setShowNewRule(!showNewRule)} className="btn-primary text-sm flex items-center gap-2 px-4 py-2">
            <Plus className="w-4 h-4" /> {t('admin.paths.new_rule')}
          </button>
        </div>
        <p className="text-xs text-ndp-text-dim mb-4">{t('admin.paths.rules_help')}</p>

        <div className="space-y-3">
          {/* System rule: anime detection */}
          <div className="card border-purple-500/20">
            <div className="flex items-center gap-4 p-4">
              <AlertTriangle className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ndp-text">{t('admin.paths.anime_rule')}</span>
                  <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">{t('admin.paths.system_tag')}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-ndp-text-dim">{t('admin.paths.genre_contains', { value: 'Animation' })} + {t('admin.paths.country_in', { value: 'JP, KR, CN, TW' })}</span>
                  <span className="text-xs text-ndp-text-dim">→ {animeFolder || <span className="italic">{t('admin.paths.configure_anime')}</span>}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Custom rules */}
          {rules.map((rule) => {
            let conds: RuleCondition[];
            try { conds = JSON.parse(rule.conditions); } catch { conds = []; }
            return (
              <div key={rule.id} className="card">
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ndp-text">{rule.name}</span>
                      <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-1.5 py-0.5 rounded">{rule.mediaType === 'movie' ? t('common.movie') : rule.mediaType === 'tv' ? t('common.series') : t('common.all')}</span>
                      {rule.seriesType && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">{rule.seriesType}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {conds.map((c, i) => (
                        <span key={i} className="text-xs text-ndp-text-dim">
                          {c.field} {c.operator} <strong>{c.value}</strong>{i < conds.length - 1 && ' +'}
                        </span>
                      ))}
                      <span className="text-xs text-ndp-text-dim">→ {rule.folderPath}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteRule(rule.id)} className="p-1.5 text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 rounded-lg transition-colors flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* New rule form */}
        {showNewRule && (
          <div className="card p-5 mt-4 border border-ndp-accent/20 space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">{t('common.name')}</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('admin.paths.rule_name_placeholder')} className="input text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">{t('common.type')}</label>
                <select value={newMediaType} onChange={(e) => setNewMediaType(e.target.value)} className="input text-sm w-full">
                  <option value="tv">{t('common.series')}</option><option value="movie">{t('common.movie')}</option><option value="all">{t('common.all')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.paths.sonarr_type')}</label>
                <select value={newSeriesType} onChange={(e) => setNewSeriesType(e.target.value)} className="input text-sm w-full">
                  <option value="">{t('admin.paths.standard')}</option><option value="anime">{t('admin.paths.anime_rule')}</option><option value="daily">{t('admin.paths.daily')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.paths.target_folder')}</label>
              <select value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="input text-sm w-full">
                <option value="">{t('common.choose')}</option>
                {allFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
              </select>
            </div>

            {/* Conditions */}
            <div>
              <label className="text-xs text-ndp-text-dim block mb-2">{t('admin.paths.conditions_help')}</label>
              <div className="space-y-2">
                {newConditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={cond.field} onChange={(e) => { const c = [...newConditions]; c[i].field = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 w-32">
                      <option value="genre">{t('admin.paths.genre')}</option>
                      <option value="language">{t('admin.paths.language')}</option>
                      <option value="country">{t('admin.paths.country')}</option>
                    </select>
                    <select value={cond.operator} onChange={(e) => { const c = [...newConditions]; c[i].operator = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 w-32">
                      <option value="contains">{t('admin.paths.contains')}</option>
                      <option value="is">{t('admin.paths.is')}</option>
                      <option value="in">{t('admin.paths.in')}</option>
                    </select>
                    {cond.field === 'genre' ? (
                      <select value={cond.value} onChange={(e) => { const c = [...newConditions]; c[i].value = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 flex-1">
                        <option value="">{t('common.choose')}</option>
                        {GENRE_KEYS.map(g => <option key={g} value={t(`genre.${g}`)}>{t(`genre.${g}`)}</option>)}
                      </select>
                    ) : (
                      <input value={cond.value} onChange={(e) => { const c = [...newConditions]; c[i].value = e.target.value; setNewConditions(c); }}
                        placeholder={cond.field === 'language' ? 'ja, ko, zh' : 'JP, KR, CN'}
                        className="input text-sm py-1.5 flex-1" />
                    )}
                    {newConditions.length > 1 && (
                      <button onClick={() => setNewConditions(prev => prev.filter((_, j) => j !== i))} className="text-ndp-text-dim hover:text-ndp-danger"><XCircle className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setNewConditions(prev => [...prev, { field: 'genre', operator: 'contains', value: '' }])} className="text-xs text-ndp-accent hover:text-ndp-accent-hover mt-2 flex items-center gap-1">
                <Plus className="w-3 h-3" /> {t('admin.paths.add_condition')}
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={addRule} disabled={!newName || !newFolder || newConditions.some(c => !c.value)} className="btn-primary text-sm">{t('admin.paths.create_rule')}</button>
              <button onClick={() => setShowNewRule(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
