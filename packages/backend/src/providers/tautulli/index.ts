import type { Provider } from '../types.js';
import { TautulliClient, createTautulliClient } from './client.js';

export { TautulliClient, createTautulliClient };
export * from './types.js';

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
      const client = createTautulliClient({ url: String(config.url), apiKey: String(config.apiKey) });
      const data = await client.ping();
      return { ok: true, version: data?.version };
    },
  },
};
