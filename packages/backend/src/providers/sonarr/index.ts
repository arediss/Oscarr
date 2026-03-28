import axios from 'axios';
import type { Provider } from '../types.js';

export const sonarrProvider: Provider = {
  service: {
    id: 'sonarr',
    label: 'Sonarr',
    icon: 'https://raw.githubusercontent.com/Sonarr/Sonarr/develop/Logo/128.png',
    category: 'arr',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:8989' },
      { key: 'apiKey', labelKey: 'common.api_key', type: 'password' },
    ],
    async test(config) {
      const { data } = await axios.get(`${config.url}/api/v3/system/status`, {
        params: { apikey: config.apiKey },
        timeout: 5000,
      });
      return { ok: true, version: data.version };
    },
  },
};
