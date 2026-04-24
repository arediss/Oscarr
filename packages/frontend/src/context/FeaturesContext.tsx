import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import i18n from 'i18next';
import api from '@/lib/api';

interface Features {
  requestsEnabled: boolean;
  supportEnabled: boolean;
  calendarEnabled: boolean;
  siteName: string;
  instanceLanguage?: string;
  [key: string]: boolean | string | undefined;
}

interface FeaturesContextType {
  features: Features;
  loading: boolean;
  refreshFeatures: () => Promise<void>;
}

const defaultFeatures: Features = {
  requestsEnabled: true,
  supportEnabled: true,
  calendarEnabled: true,
  siteName: 'Oscarr',
};

const FeaturesContext = createContext<FeaturesContextType | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<Features>(defaultFeatures);
  const [loading, setLoading] = useState(true);

  const refreshFeatures = useCallback(async () => {
    try {
      const { data } = await api.get('/app/features');
      setFeatures(data);
    } catch {
      // Keep current state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFeatures();
  }, [refreshFeatures]);

  // Update page title when siteName changes
  useEffect(() => {
    document.title = features.siteName;
  }, [features.siteName]);

  // Sync the UI locale to the instance's setting in prod. In dev we leave whatever the
  // developer has selected from the (dev-only) language switcher — otherwise hot-swapping
  // locales while working on i18n would fight with every backend refetch.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const target = features.instanceLanguage;
    if (target && i18n.language.split('-')[0] !== target) {
      i18n.changeLanguage(target);
    }
  }, [features.instanceLanguage]);

  return (
    <FeaturesContext.Provider value={{ features, loading, refreshFeatures }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures() {
  const ctx = useContext(FeaturesContext);
  if (!ctx) throw new Error('useFeatures must be used within FeaturesProvider');
  return ctx;
}
