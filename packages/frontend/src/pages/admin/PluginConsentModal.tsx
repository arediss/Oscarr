import { X, Server, Shield, HelpCircle } from 'lucide-react';
import type { PluginInfo } from '@/plugins/types';

interface Props {
  plugin: PluginInfo;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const CAPABILITY_META: Record<string, { label: string; description: string; risk: 'low' | 'medium' | 'high' }> = {
  'users:read':      { label: 'Read user profiles', description: 'Look up user emails, display names, roles, and linked providers.',  risk: 'medium' },
  'users:write':     { label: 'Modify users',       description: 'Change roles, disable accounts, and mint auth tokens.',             risk: 'high' },
  'settings:plugin': { label: 'Plugin storage',     description: 'Read and write files in the plugin\'s own data folder.',            risk: 'low' },
  'settings:app':    { label: 'Read app settings',  description: 'Read Oscarr-wide settings (site name, feature flags, …).',          risk: 'low' },
  'notifications':   { label: 'Send notifications', description: 'Send notifications to users through the Oscarr registry.',          risk: 'medium' },
  'permissions':     { label: 'Declare permissions',description: 'Register RBAC permissions and route-level access rules.',           risk: 'medium' },
  'events':          { label: 'Event bus',          description: 'Publish to and subscribe on the cross-plugin event bus.',           risk: 'low' },
};

const RISK_DOT: Record<'low' | 'medium' | 'high', string> = {
  low:    'bg-ndp-text-dim',
  medium: 'bg-amber-400',
  high:   'bg-ndp-danger',
};

const RISK_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low:    'Low risk',
  medium: 'Medium risk',
  high:   'High risk — grants sensitive access',
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
      <div className="card w-full max-w-lg flex flex-col shadow-2xl shadow-black/50">
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

        <div className="px-6 pb-2">
          {nothingToShow && (
            <p className="text-sm text-ndp-text-muted">
              This plugin declares no services or capabilities. It can still add routes and UI
              contributions, but doesn't request direct access to user data, services, or Oscarr internals.
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

          {/* Always render the Capabilities section when the plugin declares anything at all,
              so a plugin with only services doesn't land a blank gap between Services and the
              footer — we show a positive "nothing else" note instead. */}
          {(capabilities.length > 0 || services.length > 0) && (
            <section>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ndp-text-dim mb-2">
                <Shield className="w-3 h-3" />
                Capabilities
              </div>
              {capabilities.length > 0 ? (
                <div className="space-y-1.5">
                  {capabilities.map((cap) => {
                    const meta = CAPABILITY_META[cap];
                    const risk = meta?.risk ?? 'low';
                    const reason = reasons[cap];
                    return (
                      <CapabilityRow
                        key={cap}
                        label={meta?.label ?? cap}
                        description={meta?.description}
                        reason={reason}
                        risk={risk}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-ndp-text-muted">
                  No additional capabilities — this plugin won't touch users, notifications, or Oscarr internals.
                </p>
              )}
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

function CapabilityRow({
  label,
  description,
  reason,
  risk,
}: {
  label: string;
  description?: string;
  reason?: string;
  risk: 'low' | 'medium' | 'high';
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03]">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${RISK_DOT[risk]}`}
        title={RISK_LABEL[risk]}
        aria-label={RISK_LABEL[risk]}
      />
      <span className="text-sm text-ndp-text flex-1 min-w-0 truncate">{label}</span>
      {(description || reason) && (
        <div className="group relative flex-shrink-0">
          <HelpCircle className="w-3.5 h-3.5 text-ndp-text-dim hover:text-ndp-text transition-colors cursor-help" />
          <div
            role="tooltip"
            className="
              absolute right-0 top-full mt-2 w-72 p-3
              rounded-xl border border-white/10 bg-ndp-surface shadow-xl shadow-black/40
              text-xs leading-relaxed
              opacity-0 pointer-events-none
              group-hover:opacity-100 group-hover:pointer-events-auto
              transition-opacity duration-150
              z-20
            "
          >
            {description && <p className="text-ndp-text">{description}</p>}
            {reason && (
              <p className={description ? 'mt-2 text-ndp-text-muted' : 'text-ndp-text-muted'}>
                <span className="text-ndp-text-dim">Why: </span>
                {reason}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
