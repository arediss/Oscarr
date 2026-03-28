import axios from 'axios';
import type { Provider } from '../types.js';

export const radarrProvider: Provider = {
  service: {
    id: 'radarr',
    label: 'Radarr',
    icon: 'https://raw.githubusercontent.com/Radarr/Radarr/develop/Logo/128.png',
    category: 'arr',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:7878' },
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
