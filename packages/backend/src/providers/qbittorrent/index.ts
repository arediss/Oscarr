import axios from 'axios';
import type { Provider } from '../types.js';

export const qbittorrentProvider: Provider = {
  service: {
    id: 'qbittorrent',
    label: 'qBittorrent',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/6/66/New_qBittorrent_Logo.svg',
    category: 'download-client',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:8080' },
      { key: 'username', labelKey: 'common.username', type: 'text' },
      { key: 'password', labelKey: 'common.password', type: 'password' },
    ],
    async test(config) {
      await axios.get(`${config.url}/api/v2/app/version`, { timeout: 5000 });
      return { ok: true };
    },
  },
};
