import { X, Server, Users, Settings, Bell, Shield, Activity, Database } from 'lucide-react';
import type { PluginInfo } from '@/plugins/types';

interface Props {
  plugin: PluginInfo;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const CAPABILITY_META: Record<string, { label: string; description: string; icon: typeof Users; risk: 'low' | 'medium' | 'high' }> = {
  'users:read':       { label: 'Read user profiles',       description: 'Look up user emails, display names, roles and linked providers.', icon: Users,    risk: 'medium' },
  'users:write':      { label: 'Modify users',             description: 'Change roles, disable accounts and mint auth tokens.',            icon: Users,    risk: 'high' },
  'settings:plugin':  { label: 'Plugin storage',           description: 'Read and write files in the plugin\'s data folder.',              icon: Database, risk: 'low' },
  'settings:app':     { label: 'Read app settings',        description: 'Read Oscarr-wide settings (site name, feature flags, etc.).',     icon: Settings, risk: 'low' },
  'notifications':    { label: 'Send notifications',       description: 'Send notifications to users through the registry.',                icon: Bell,     risk: 'medium' },
  'permissions':      { label: 'Declare permissions',      description: 'Register RBAC permissions and route-level rules.',                 icon: Shield,   risk: 'medium' },
  'events':           { label: 'Event bus',                description: 'Publish and subscribe to the cross-plugin event bus.',             icon: Activity, risk: 'low' },
};

const RISK_DOT: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-ndp-text-dim',
  medium: 'bg-amber-400',
  high: 'bg-ndp-danger',
};

const RISK_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'low',
  medium: 'medium',
  high: 'high risk',
};

export function PluginConsentModal({ plugin, open, busy, onCancel, onConfirm }: Props) {
  if (!open) return null;

  const services = plugin.services ?? [];
  const capabilities = plugin.capabilities ?? [];
  const reasons = plugin.capabilityReasons ?? {};
  const nothingToShow = services.length === 0 && capabilities.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="card w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ndp-text truncate">
              Enable &quot;{plugin.name}&quot;?
            </h2>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              v{plugin.version}{plugin.author ? ` · ${plugin.author}` : ''}
            </p>
          </div>
          <button
            onClick={() => !busy && onCancel()}
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {nothingToShow && (
            <p className="text-sm text-ndp-text-muted">
              This plugin declares no services or capabilities. It can still add routes and UI contributions,
              but doesn't request direct access to user data, services, or Oscarr internals.
            </p>
          )}

          {services.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ndp-text-dim mb-2">
                <Server className="w-3 h-3" />
                Services
              </div>
              <p className="text-sm text-ndp-text-muted mb-2">
                Reads the config (URL, API key, tokens) of:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-ndp-accent/10 text-ndp-accent">
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {capabilities.length > 0 && (
            <section>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ndp-text-dim mb-2">
                <Shield className="w-3 h-3" />
                Capabilities
              </div>
              <ul className="divide-y divide-white/5">
                {capabilities.map((cap) => {
                  const meta = CAPABILITY_META[cap];
                  const Icon = meta?.icon ?? Shield;
                  const risk = meta?.risk ?? 'low';
                  const reason = reasons[cap];
                  return (
                    <li key={cap} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-3">
                        <Icon className="w-4 h-4 text-ndp-text-muted flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-ndp-text">{meta?.label ?? cap}</span>
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${RISK_DOT[risk]}`}
                              title={RISK_LABEL[risk]}
                              aria-label={RISK_LABEL[risk]}
                            />
                          </div>
                          {meta?.description && (
                            <p className="text-xs text-ndp-text-dim mt-0.5 leading-relaxed">
                              {meta.description}
                            </p>
                          )}
                          {reason && (
                            <p className="text-xs text-ndp-text-muted mt-1.5">
                              <span className="text-ndp-text-dim">Why: </span>
                              {reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-6 flex-shrink-0">
          <p className="text-[11px] text-ndp-text-dim leading-relaxed">
            Enforced at runtime. Disable the plugin anytime to revoke.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => !busy && onCancel()}
              disabled={busy}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? 'Enabling…' : 'Enable'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
