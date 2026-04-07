import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Loader2, Save, CheckCircle, RotateCcw } from 'lucide-react';

interface FloatingSaveBarProps {
  show: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onReset?: () => void;
}

export function FloatingSaveBar({ show, saving, saved, onSave, onReset }: FloatingSaveBarProps) {
  const { t } = useTranslation();

  return (
    <div className={clsx(
      'fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-out',
      show || saved ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none',
    )}>
      <div className="max-w-4xl mx-auto px-4 pb-4">
        <div className={clsx(
          'flex items-center justify-between gap-4 px-5 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl transition-colors duration-300',
          saved ? 'bg-ndp-success/10 border-ndp-success/30' : 'bg-ndp-surface/95 border-white/10',
        )}>
          <span className={clsx('text-sm font-medium', saved ? 'text-ndp-success' : 'text-ndp-text-muted')}>
            {saved ? t('admin.save_bar.saved') : t('admin.save_bar.unsaved')}
          </span>
          <div className="flex items-center gap-2">
            {onReset && !saved && (
              <button
                onClick={onReset}
                disabled={saving}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('admin.save_bar.reset')}
              </button>
            )}
            {!saved && (
              <button
                onClick={onSave}
                disabled={saving}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {t('admin.save_bar.save')}
              </button>
            )}
            {saved && (
              <CheckCircle className="w-4 h-4 text-ndp-success" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
