import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getTraces, getPageLoadTime, resetTraces, type ApiTrace } from '@/lib/api';
import { Activity, X, ChevronDown, ChevronUp } from 'lucide-react';

export function ApiProfiler() {
  const [traces, setTraces] = useState<ApiTrace[]>([]);
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const location = useLocation();

  const refresh = useCallback(() => setTraces([...getTraces()]), []);

  // Reset on navigation
  useEffect(() => {
    resetTraces();
    setTraces([]);
    const interval = setInterval(refresh, 300);
    return () => clearInterval(interval);
  }, [location.pathname, refresh]);

  if (traces.length === 0 && !visible) return null;

  const maxTime = Math.max(...traces.map(t => t.startedAt + t.duration), 1);
  const totalDuration = Date.now() - getPageLoadTime();

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 left-4 z-50 p-2 bg-black/80 border border-white/10 rounded-full text-white/60 hover:text-white transition-colors"
        title="API Profiler"
      >
        <Activity className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[500px] max-h-[400px] bg-black/90 border border-white/10 rounded-xl backdrop-blur-xl shadow-2xl text-xs font-mono overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-white/80">
          <Activity className="w-3.5 h-3.5" />
          <span>{traces.length} calls</span>
          <span className="text-white/40">|</span>
          <span>{totalDuration}ms total</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(!minimized)} className="p-1 text-white/40 hover:text-white">
            {minimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setVisible(false)} className="p-1 text-white/40 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="overflow-y-auto max-h-[340px] p-2 space-y-1">
          {traces.map((t, i) => {
            const left = (t.startedAt / maxTime) * 100;
            const width = Math.max((t.duration / maxTime) * 100, 2);
            const isError = t.status >= 400 || t.status === 0;
            const isSlow = t.duration > 1000;

            return (
              <div key={i} className="group">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`w-8 text-right font-bold ${isError ? 'text-red-400' : isSlow ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {t.status || 'ERR'}
                  </span>
                  <span className="text-white/40 w-7">{t.method}</span>
                  <span className="text-white/70 truncate flex-1" title={t.url}>{t.url}</span>
                  <span className={`w-14 text-right ${isSlow ? 'text-amber-400 font-bold' : 'text-white/50'}`}>
                    {t.duration}ms
                  </span>
                </div>
                {/* Timeline bar */}
                <div className="h-1.5 mt-0.5 bg-white/5 rounded-full overflow-hidden relative">
                  <div
                    className={`absolute h-full rounded-full ${isError ? 'bg-red-500/60' : isSlow ? 'bg-amber-500/60' : 'bg-emerald-500/40'}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
