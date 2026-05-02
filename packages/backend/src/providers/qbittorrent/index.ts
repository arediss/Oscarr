import axios from 'axios';
import type { Provider } from '../types.js';

export const qbittorrentProvider: Provider = {
  service: {
    id: 'qbittorrent',
    label: 'qBittorrent',
    icon: '/providers/qbittorrent.svg',
    category: 'download-client',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://localhost:8080' },
      { key: 'username', labelKey: 'common.username', type: 'text' },
      { key: 'password', labelKey: 'common.password', type: 'password' },
    ],
    async test(config) {
      const baseUrl = config.url?.replace(/\/+$/, '') ?? '';
      const username = config.username ?? '';
      const password = config.password ?? '';

      const loginRes = await axios.post(
        `${baseUrl}/api/v2/auth/login`,
        new URLSearchParams({ username, password }).toString(),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: baseUrl,
          },
          validateStatus: () => true,
        },
      );

      // qBit returns 403 on temp-IP-ban (too many failed attempts) — a distinct state from bad creds.
      if (loginRes.status === 403) throw new Error('AUTH_BANNED');
      if (loginRes.status !== 200 || loginRes.data !== 'Ok.') throw new Error('AUTH_FAILED');

      const setCookie = loginRes.headers['set-cookie'];
      const cookieHeader = Array.isArray(setCookie)
        ? setCookie.map((c) => c.split(';')[0]).join('; ')
        : '';
      if (!cookieHeader.includes('SID=')) throw new Error('AUTH_NO_SESSION');

      const versionRes = await axios.get<string>(`${baseUrl}/api/v2/app/version`, {
        timeout: 5000,
        headers: { Cookie: cookieHeader, Referer: baseUrl },
        responseType: 'text',
        transformResponse: [(data) => data],
      });

      return { ok: true, version: String(versionRes.data).trim().replace(/^v/i, '') };
    },
  },
};
