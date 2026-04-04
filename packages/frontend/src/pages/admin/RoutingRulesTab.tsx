import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { Spinner } from './Spinner';
import type { RootFolder } from '@/types';

interface FolderRule {
  id: number; name: string; priority: number; mediaType: string;
  conditions: string; folderPath: string; seriesType: string | null; serviceId: number | null;
}
interface RuleCondition { field: string; operator: string; value: string; }
interface UserOption { id: number; displayName: string | null; email: string; }
interface RoleOption { id: number; name: string; }
interface ServiceOption { id: number; name: string; type: string; }

const GENRE_KEYS = [
  'action','adventure','animation','comedy','crime','documentary','drama',
  'family','fantasy','history','horror','music','mystery',
  'romance','science_fiction','thriller','war','western',
];

const CONDITION_FIELDS = ['genre', 'language', 'country', 'user', 'role', 'tag'] as const;

export function RoutingRulesTab() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<FolderRule[]>([]);
  const [radarrFolders, setRadarrFolders] = useState<RootFolder[]>([]);
  const [sonarrFolders, setSonarrFolders] = useState<RootFolder[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [defaultAnimeFolder, setDefaultAnimeFolder] = useState('');
  const [defaultMovieFolder, setDefaultMovieFolder] = useState('');
  const [defaultTvFolder, setDefaultTvFolder] = useState('');
  const [loading, setLoading] = useState(true);

  // New rule form
  const [showNewRule, setShowNewRule] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMediaType, setNewMediaType] = useState('tv');
  const [newFolder, setNewFolder] = useState('');
  const [newSeriesType, setNewSeriesType] = useState('');
  const [newServiceId, setNewServiceId] = useState('');
  const [newConditions, setNewConditions] = useState<RuleCondition[]>([{ field: 'genre', operator: 'contains', value: '' }]);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, rFolders, sFolders, rulesRes, usersRes, rolesRes, keywordsRes, servicesRes] = await Promise.all([
          api.get('/admin/settings'),
          api.get('/admin/radarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/sonarr/rootfolders').catch(() => ({ data: [] })),
          api.get('/admin/folder-rules').catch(() => ({ data: [] })),
          api.get('/admin/users').catch(() => ({ data: [] })),
          api.get('/admin/roles').catch(() => ({ data: [] })),
          api.get('/admin/keywords').catch(() => ({ data: [] })),
          api.get('/admin/services').catch(() => ({ data: [] })),
        ]);
        setDefaultAnimeFolder(settingsRes.data.defaultAnimeFolder || '');
        setDefaultMovieFolder(settingsRes.data.defaultMovieFolder || '');
        setDefaultTvFolder(settingsRes.data.defaultTvFolder || '');
        setRadarrFolders(rFolders.data);
        setSonarrFolders(sFolders.data);
        setRules(rulesRes.data);
        setUsers(usersRes.data);
        setRoles(rolesRes.data);
        // Extract unique tags from keywords
        const uniqueTags = [...new Set(
          (keywordsRes.data as { tag: string | null }[])
            .map(k => k.tag)
            .filter((t): t is string => !!t)
        )];
        setTags(uniqueTags);
        setServices(servicesRes.data.filter((s: ServiceOption) => s.type === 'radarr' || s.type === 'sonarr'));
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const addRule = async () => {
    if (!newName || !newFolder || newConditions.some(c => !c.value)) return;
    try {
      const { data } = await api.post('/admin/folder-rules', {
        name: newName, mediaType: newMediaType, folderPath: newFolder,
        seriesType: newSeriesType || null, priority: rules.length,
        serviceId: newServiceId ? parseInt(newServiceId) : null,
        conditions: newConditions,
      });
      setRules(prev => [...prev, data]);
      setShowNewRule(false); setNewName(''); setNewFolder(''); setNewSeriesType(''); setNewServiceId('');
      setNewConditions([{ field: 'genre', operator: 'contains', value: '' }]);
    } catch (err) { console.error(err); }
  };

  const deleteRule = async (id: number) => {
    try { await api.delete(`/admin/folder-rules/${id}`); setRules(prev => prev.filter(r => r.id !== id)); }
    catch (err) { console.error(err); }
  };

  const updateConditionField = (index: number, field: string) => {
    const c = [...newConditions];
    c[index] = { field, operator: getDefaultOperator(field), value: '' };
    setNewConditions(c);
  };

  // Label folders with their service instance name
  const labeledFolders: { path: string; label: string }[] = [];
  const radarrService = services.find(s => s.type === 'radarr');
  const sonarrService = services.find(s => s.type === 'sonarr');
  for (const f of radarrFolders) {
    labeledFolders.push({ path: f.path, label: `${f.path} (${radarrService?.name || 'Radarr'})` });
  }
  for (const f of sonarrFolders) {
    if (!labeledFolders.some(lf => lf.path === f.path)) {
      labeledFolders.push({ path: f.path, label: `${f.path} (${sonarrService?.name || 'Sonarr'})` });
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ndp-text">{t('admin.paths.routing_rules')} ({rules.length})</h2>
        <button onClick={() => setShowNewRule(!showNewRule)} className="btn-primary text-sm flex items-center gap-2 px-4 py-2">
          <Plus className="w-4 h-4" /> {t('admin.paths.new_rule')}
        </button>
      </div>
      <p className="text-xs text-ndp-text-dim mb-4">{t('admin.paths.rules_help')}</p>

      <div className="space-y-3">
        {/* Rules */}
        {rules.map((rule) => {
          let conds: RuleCondition[];
          try { conds = JSON.parse(rule.conditions); } catch { conds = []; }
          const service = services.find(s => s.id === rule.serviceId);
          return (
            <div key={rule.id} className="card">
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ndp-text">{rule.name}</span>
                    <span className="text-[10px] bg-ndp-accent/10 text-ndp-accent px-1.5 py-0.5 rounded">{rule.mediaType === 'movie' ? t('common.movie') : rule.mediaType === 'tv' ? t('common.series') : t('common.all')}</span>
                    {rule.seriesType && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">{rule.seriesType}</span>}
                    {service && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">{service.name}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {conds.map((c, i) => (
                      <span key={i} className="text-xs text-ndp-text-dim">
                        {formatConditionLabel(c, users, roles)} {i < conds.length - 1 && ' +'}
                      </span>
                    ))}
                    <span className="text-xs text-ndp-text-dim">→ {rule.folderPath || (rule.seriesType === 'anime' ? defaultAnimeFolder : rule.mediaType === 'tv' ? defaultTvFolder : defaultMovieFolder) || <span className="italic">{t('admin.paths.defaults_title')}</span>}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.paths.target_folder')}</label>
              <select value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="input text-sm w-full">
                <option value="">{t('common.choose')}</option>
                {labeledFolders.map(f => <option key={f.path} value={f.path}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-ndp-text-dim block mb-1">{t('admin.paths.service')}</label>
              <select value={newServiceId} onChange={(e) => setNewServiceId(e.target.value)} className="input text-sm w-full">
                <option value="">{t('admin.paths.select_service')}</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
              </select>
            </div>
          </div>

          {/* Conditions */}
          <div>
            <label className="text-xs text-ndp-text-dim block mb-2">{t('admin.paths.conditions_help')}</label>
            <div className="space-y-2">
              {newConditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={cond.field} onChange={(e) => updateConditionField(i, e.target.value)} className="input text-sm py-1.5 w-36">
                    {CONDITION_FIELDS.map(f => (
                      <option key={f} value={f}>{t(`admin.paths.${f}`)}</option>
                    ))}
                  </select>
                  <select value={cond.operator} onChange={(e) => { const c = [...newConditions]; c[i].operator = e.target.value; setNewConditions(c); }} className="input text-sm py-1.5 w-32">
                    {getOperatorsForField(cond.field).map(op => (
                      <option key={op} value={op}>{t(`admin.paths.${op}`)}</option>
                    ))}
                  </select>
                  {renderValueInput(cond, i)}
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
  );

  function renderValueInput(cond: RuleCondition, i: number) {
    const setValue = (val: string) => {
      const c = [...newConditions]; c[i].value = val; setNewConditions(c);
    };

    switch (cond.field) {
      case 'genre':
        return (
          <select value={cond.value} onChange={(e) => setValue(e.target.value)} className="input text-sm py-1.5 flex-1">
            <option value="">{t('common.choose')}</option>
            {GENRE_KEYS.map(g => <option key={g} value={t(`genre.${g}`)}>{t(`genre.${g}`)}</option>)}
          </select>
        );
      case 'user':
        return (
          <select value={cond.value} onChange={(e) => setValue(e.target.value)} className="input text-sm py-1.5 flex-1">
            <option value="">{t('admin.paths.select_user')}</option>
            {users.map(u => <option key={u.id} value={u.id.toString()}>{u.displayName || u.email}</option>)}
          </select>
        );
      case 'role':
        return (
          <select value={cond.value} onChange={(e) => setValue(e.target.value)} className="input text-sm py-1.5 flex-1">
            <option value="">{t('admin.paths.select_role')}</option>
            {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
        );
      case 'tag':
        return (
          <select value={cond.value} onChange={(e) => setValue(e.target.value)} className="input text-sm py-1.5 flex-1">
            <option value="">{t('admin.paths.select_tag')}</option>
            {tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        );
      default:
        return (
          <input value={cond.value} onChange={(e) => setValue(e.target.value)}
            placeholder={cond.field === 'language' ? 'ja, ko, zh' : 'JP, KR, CN'}
            className="input text-sm py-1.5 flex-1" />
        );
    }
  }
}

function getDefaultOperator(field: string): string {
  switch (field) {
    case 'genre': case 'tag': return 'contains';
    case 'user': case 'role': case 'language': return 'is';
    case 'country': return 'in';
    default: return 'contains';
  }
}

function getOperatorsForField(field: string): string[] {
  switch (field) {
    case 'genre': case 'tag': return ['contains'];
    case 'user': return ['is', 'in'];
    case 'role': return ['is'];
    case 'language': return ['is', 'in'];
    case 'country': return ['contains', 'in'];
    default: return ['contains', 'is', 'in'];
  }
}

function formatConditionLabel(
  c: RuleCondition,
  users: UserOption[],
  roles: RoleOption[],
): string {
  let displayValue = c.value;
  if (c.field === 'user') {
    const user = users.find(u => u.id.toString() === c.value);
    if (user) displayValue = user.displayName || user.email;
  } else if (c.field === 'role') {
    const role = roles.find(r => r.name === c.value);
    if (role) displayValue = role.name;
  }
  return `${c.field} ${c.operator} ${displayValue}`;
}
