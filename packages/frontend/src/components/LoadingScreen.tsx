import { useTranslation } from 'react-i18next';

export default function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-ndp-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-ndp-accent/30 border-t-ndp-accent rounded-full animate-spin" />
        <p className="text-ndp-text-muted text-sm">{t('common.loading')}</p>
      </div>
    </div>
  );
}
