import { useState, useEffect } from 'react';
import api from '@/lib/api';

export function useChangelogNotification() {
  const [hasNew, setHasNew] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    api.get('/app/version').then(({ data }) => {
      const version = data.current;
      setCurrentVersion(version);
      const lastSeen = localStorage.getItem('oscarr-last-seen-version');
      if (lastSeen && lastSeen !== version) {
        setHasNew(true);
      } else if (!lastSeen) {
        localStorage.setItem('oscarr-last-seen-version', version);
      }
    }).catch(() => {});
  }, []);

  const dismiss = () => {
    if (currentVersion) localStorage.setItem('oscarr-last-seen-version', currentVersion);
    setHasNew(false);
  };

  return { hasNew, dismiss, currentVersion };
}
