import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { toastApiError } from '@/utils/toast';
import type { ServiceData } from '@/hooks/useServiceSchemas';

export interface ServiceTestResult {
  ok: boolean;
  version?: string;
}

/**
 * Owns the ServicesTab data layer: list fetch + per-service probe + mutations (toggle, set
 * default, delete, explicit test). The UI consumes the returned state + handlers; nothing in
 * here touches React JSX so it's easy to test in isolation.
 */
export function useServicesTab() {
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, ServiceTestResult>>({});
  const [deleting, setDeleting] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/services');
      setServices(data);
      return data as ServiceData[];
    } catch (err) {
      toastApiError(err, t('admin.services.load_failed'));
      return [];
    } finally {
      setLoading(false);
    }
  }, [t]);

  const testAllServices = useCallback((serviceList: ServiceData[]) => {
    // Bulk probe on mount — one red badge per failing row is enough UX signal, no per-service
    // toast. But log so a timeout / 401 / DNS issue leaves a trail in devtools.
    serviceList.forEach(async (svc) => {
      if (!svc.enabled) return;
      try {
        const { data } = await api.post(`/admin/services/${svc.id}/test`);
        setTestResults((prev) => ({ ...prev, [svc.id]: { ok: true, version: data.version } }));
      } catch (err) {
        console.error(`Service test failed for #${svc.id} (${svc.type})`, err);
        setTestResults((prev) => ({ ...prev, [svc.id]: { ok: false } }));
      }
    });
  }, []);

  useEffect(() => {
    fetchServices().then((svcs) => {
      if (svcs.length) testAllServices(svcs);
    });
  }, [fetchServices, testAllServices]);

  const deleteService = useCallback(async (id: number): Promise<boolean> => {
    setDeleting(true);
    try {
      await api.delete(`/admin/services/${id}`);
      await fetchServices();
      return true;
    } catch (err) {
      toastApiError(err, t('admin.services.delete_failed'));
      return false;
    } finally {
      setDeleting(false);
    }
  }, [fetchServices, t]);

  const toggleService = useCallback(async (service: ServiceData) => {
    try {
      await api.put(`/admin/services/${service.id}`, { enabled: !service.enabled });
      await fetchServices();
    } catch (err) {
      toastApiError(err, t('admin.services.toggle_failed'));
    }
  }, [fetchServices, t]);

  const setDefaultService = useCallback(async (service: ServiceData) => {
    try {
      await api.put(`/admin/services/${service.id}`, { isDefault: true });
      await fetchServices();
    } catch (err) {
      toastApiError(err, t('admin.services.set_default_failed'));
    }
  }, [fetchServices, t]);

  const testService = useCallback(async (service: ServiceData) => {
    setTesting(service.id);
    try {
      const { data } = await api.post(`/admin/services/${service.id}/test`);
      setTestResults((prev) => ({ ...prev, [service.id]: { ok: true, version: data.version } }));
    } catch (err) {
      // Explicit user click — surface the backend error so the admin knows 401 / timeout / etc.
      toastApiError(err, t('admin.services.test_failed', { name: service.name }));
      setTestResults((prev) => ({ ...prev, [service.id]: { ok: false } }));
    } finally {
      setTesting(null);
    }
  }, [t]);

  return {
    services,
    loading,
    testing,
    testResults,
    deleting,
    fetchServices,
    deleteService,
    toggleService,
    setDefaultService,
    testService,
  };
}
