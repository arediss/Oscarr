import axios from 'axios';
import type { Provider } from '../types.js';

export const tautulliProvider: Provider = {
  service: {
    id: 'tautulli',
    label: 'Tautulli',
    icon: 'https://raw.githubusercontent.com/Tautulli/Tautulli/master/data/interfaces/default/images/logo-tautulli.svg',
    category: 'monitoring',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:8181' },
      { key: 'apiKey', labelKey: 'common.api_key', type: 'password' },
    ],
    async test(config) {
      const { data } = await axios.get(`${config.url}/api/v2`, {
        params: { apikey: config.apiKey, cmd: 'arnold' },
        timeout: 5000,
      });
      return { ok: true, version: data?.response?.data?.version };
    },
  },
};
