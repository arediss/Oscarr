import axios from 'axios';
import type { Provider } from '../types.js';
import { RadarrClient } from './client.js';

export const radarrProvider: Provider = {
  service: {
    id: 'radarr',
    label: 'Radarr',
    icon: 'https://raw.githubusercontent.com/NX211/homer-icons/b005204c18b7bf2c4cdbc1009b6d98dab65b7517/svg/radarr.svg',
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
    createClient(config) {
      return new RadarrClient(config.url || '', config.apiKey || '');
    },
  },
};

export { RadarrClient } from './client.js';
export type { RadarrMovie, RadarrQueueItem, RadarrHistoryRecord } from './types.js';
