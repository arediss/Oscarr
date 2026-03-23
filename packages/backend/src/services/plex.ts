import axios from 'axios';

const PLEX_TV_BASE = 'https://plex.tv';

export interface PlexUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  title: string;
  thumb: string;
  authToken: string;
}

export async function getPlexUser(authToken: string): Promise<PlexUser> {
  const { data } = await axios.get(`${PLEX_TV_BASE}/users/account.json`, {
    headers: {
      'X-Plex-Token': authToken,
      Accept: 'application/json',
    },
  });

  const user = data.user;
  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    username: user.username,
    title: user.title,
    thumb: user.thumb,
    authToken: user.authToken,
  };
}

export function getPlexOAuthUrl(clientId: string, forwardUrl: string): string {
  const params = new URLSearchParams({
    'X-Plex-Product': 'Oscarr',
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Version': '1.0.0',
    clientID: clientId,
    forwardUrl,
    context: 'home',
    'code': '',
  });

  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export async function createPlexPin(clientId: string): Promise<{ id: number; code: string }> {
  const { data } = await axios.post(
    'https://plex.tv/api/v2/pins',
    null,
    {
      params: { strong: true },
      headers: {
        Accept: 'application/json',
        'X-Plex-Product': 'Oscarr',
        'X-Plex-Client-Identifier': clientId,
        'X-Plex-Version': '1.0.0',
      },
    }
  );
  return { id: data.id, code: data.code };
}

export async function checkPlexPin(pinId: number, clientId: string): Promise<string | null> {
  const { data } = await axios.get(`https://plex.tv/api/v2/pins/${encodeURIComponent(String(pinId))}`, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Client-Identifier': clientId,
    },
  });
  return data.authToken || null;
}

export interface PlexSharedUser {
  id: number;
  uuid: string;
  title: string;
  username: string;
  email: string;
  thumb: string;
}

/**
 * Get users who have access to a specific Plex server (shared with them).
 * Uses the admin token to query shared_servers for the given machineId.
 */
export async function getSharedServerUsers(adminToken: string, machineId: string): Promise<PlexSharedUser[]> {
  // Use legacy XML endpoint — more reliable than v2 for shared_servers
  const { data } = await axios.get(`https://plex.tv/api/servers/${encodeURIComponent(machineId)}/shared_servers`, {
    headers: {
      'X-Plex-Token': adminToken,
      'X-Plex-Client-Identifier': 'oscarr-client',
      'X-Plex-Product': 'Oscarr',
      'X-Plex-Version': '1.0.0',
      Accept: 'application/xml',
    },
  });

  // Parse XML response: extract <SharedServer> elements
  const xml = typeof data === 'string' ? data : String(data);
  const users: PlexSharedUser[] = [];
  const seen = new Set<number>();
  const regex = /<SharedServer\s[^>]*?>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const tag = match[0];
    const attr = (name: string) => {
      const m = tag.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : '';
    };

    const userId = parseInt(attr('userID'), 10);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);

    users.push({
      id: userId,
      uuid: '',
      title: attr('username'),
      username: attr('username'),
      email: attr('email'),
      thumb: '',
    });
  }

  return users;
}

/**
 * Check if a user has access to a specific Plex server.
 */
export async function checkPlexServerAccess(
  userPlexToken: string,
  serverMachineId?: string | null
): Promise<boolean> {
  if (!serverMachineId) return true; // No server configured, skip check

  try {
    const { data } = await axios.get('https://plex.tv/api/v2/resources', {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': userPlexToken,
        'X-Plex-Client-Identifier': 'oscarr-client',
      },
      params: { includeHttps: 1, includeRelay: 1 },
    });

    // Check if user has access to the server with this machine ID
    return Array.isArray(data) && data.some(
      (resource: { clientIdentifier: string; provides: string }) =>
        resource.clientIdentifier === serverMachineId && resource.provides?.includes('server')
    );
  } catch {
    return false;
  }
}
