import { X, Server, Users, Settings, Bell, Shield, Activity, Database } from 'lucide-react';
import type { PluginInfo } from '@/plugins/types';

interface Props {
  plugin: PluginInfo;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Human-readable labels + icons per capability bucket. Keep in sync with
// ALL_CAPABILITIES in packages/backend/src/plugins/types.ts.
const CAPABILITY_META: Record<string, { label: string; description: string; icon: typeof Users; risk: 'low' | 'medium' | 'high' }> = {
  'users:read': { label: 'Read user profiles', description: 'Can look up user emails, display names, roles and linked providers.', icon: Users, risk: 'medium' },
  'users:write': { label: 'Modify users', description: 'Can change roles, disable accounts and mint auth tokens for users.', icon: Users, risk: 'high' },
  'settings:plugin': { label: 'Plugin storage', description: 'Can read/write its own settings and files in its dedicated data folder.', icon: Database, risk: 'low' },
  'settings:app': { label: 'Read app settings', description: 'Can read Oscarr-wide settings (site name, feature flags, etc.).', icon: Settings, risk: 'low' },
  'notifications': { label: 'Send notifications', description: 'Can send notifications to users through the notification registry.', icon: Bell, risk: 'medium' },
  'permissions': { label: 'Declare permissions', description: 'Can register RBAC permissions and route-level access rules.', icon: Shield, risk: 'medium' },
  'events': { label: 'Event bus', description: 'Can publish and subscribe to the cross-plugin event bus.', icon: Activity, risk: 'low' },
};

const RISK_STYLES: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-white/5 text-ndp-text-dim',
  medium: 'bg-amber-500/15 text-amber-300',
  high: 'bg-ndp-danger/15 text-ndp-danger',
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
      <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/5 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-ndp-text">Enable &quot;{plugin.name}&quot;?</h2>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              v{plugin.version}{plugin.author ? ` · by ${plugin.author}` : ''} — review what the plugin will be allowed to do.
            </p>
          </div>
          <button
            onClick={() => !busy && onCancel()}
            className="p-1.5 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {nothingToShow && (
            <div className="text-center py-4 text-sm text-ndp-text-dim">
              This plugin declares no services or capabilities. It can still add routes and UI contributions,
              but does not request direct access to user data or services.
            </div>
          )}

          {services.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Server className="w-3.5 h-3.5 text-ndp-text-dim" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ndp-text-dim">
                  Services
                </h3>
              </div>
              <div className="card bg-ndp-surface-light p-4">
                <p className="text-xs text-ndp-text-dim mb-2.5">
                  Will read the config (URL, API key, tokens) of these services:
                </p>
                <div className="flex flex-wrap gap-2">
                  {services.map((s) => (
                    <span key={s} className="text-xs px-2.5 py-1 rounded-lg bg-ndp-accent/15 text-ndp-accent font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {capabilities.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-3.5 h-3.5 text-ndp-text-dim" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ndp-text-dim">
                  Capabilities
                </h3>
              </div>
              <div className="space-y-2">
                {capabilities.map((cap) => {
                  const meta = CAPABILITY_META[cap];
                  const Icon = meta?.icon ?? Shield;
                  const risk = meta?.risk ?? 'low';
                  const reason = reasons[cap];
                  return (
                    <div key={cap} className="card bg-ndp-surface-light p-3.5">
                      <div className="flex items-start gap-3">
                        <Icon className="w-4 h-4 text-ndp-text-muted flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-ndp-text">
                              {meta?.label ?? cap}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${RISK_STYLES[risk]}`}>
                              {risk}
                            </span>
                          </div>
                          {meta?.description && (
                            <p className="text-xs text-ndp-text-dim mt-1">{meta.description}</p>
                          )}
                          {reason && (
                            <p className="text-xs text-ndp-text-muted mt-2 italic border-l-2 border-white/10 pl-2.5">
                              Plugin's reason: {reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="text-[11px] text-ndp-text-dim border-t border-white/5 pt-4">
            Oscarr enforces these declarations at runtime — the plugin cannot call a method outside
            its declared capabilities or access a service not in its list. You can disable the plugin
            at any time to revoke all of them.
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/5 flex-shrink-0">
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
            {busy ? 'Enabling…' : 'Enable plugin'}
          </button>
        </div>
      </div>
    </div>
  );
}
