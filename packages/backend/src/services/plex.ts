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
    'X-Plex-Product': 'Netflix du Pauvre',
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
        'X-Plex-Product': 'Netflix du Pauvre',
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

export interface PlexFriend {
  id: number;
  uuid: string;
  title: string;
  username: string;
  email: string;
  thumb: string;
  status: string;
}

/**
 * Get all friends/shared users from Plex using the admin token.
 */
export async function getPlexFriends(adminToken: string): Promise<PlexFriend[]> {
  const { data } = await axios.get('https://plex.tv/api/v2/friends', {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': adminToken,
      'X-Plex-Client-Identifier': 'netflix-du-pauvre-client',
    },
  });
  return data.map((f: PlexFriend) => ({
    id: f.id,
    uuid: f.uuid,
    title: f.title,
    username: f.username || f.title,
    email: f.email,
    thumb: f.thumb,
    status: f.status,
  }));
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
        'X-Plex-Client-Identifier': 'netflix-du-pauvre-client',
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
