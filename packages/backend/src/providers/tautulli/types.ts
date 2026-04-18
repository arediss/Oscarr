/**
 * Tautulli API v2 response envelope.
 * All endpoints return `{ response: { result, message?, data } }` — `data` shape
 * varies per command.
 */
export interface TautulliResponse<T> {
  response: {
    result: 'success' | 'error';
    message?: string;
    data: T;
  };
}

export interface TautulliSession {
  session_id: string;
  session_key: string;
  user_id: number;
  user: string;
  username: string;
  friendly_name: string;
  media_type: string;
  title: string;
  full_title: string;
  grandparent_title?: string;
  parent_title?: string;
  parent_media_index?: string;
  media_index?: string;
  year?: number;
  rating_key: string;
  thumb?: string;
  art?: string;
  state: 'playing' | 'paused' | 'buffering' | string;
  progress_percent: string;
  view_offset: string;
  duration: string;
  player: string;
  platform: string;
  product: string;
  device: string;
  location: 'lan' | 'wan' | string;
  ip_address: string;
  bandwidth: string;
  quality_profile: string;
  stream_video_resolution?: string;
  transcode_decision: 'direct play' | 'copy' | 'transcode' | string;
}

export interface TautulliActivity {
  stream_count: string | number;
  stream_count_direct_play: string | number;
  stream_count_direct_stream: string | number;
  stream_count_transcode: string | number;
  total_bandwidth: string | number;
  wan_bandwidth: string | number;
  lan_bandwidth: string | number;
  sessions: TautulliSession[];
}

export interface TautulliUsersTableRow {
  row_id: number;
  user_id: number;
  user: string;
  username: string;
  friendly_name: string;
  email: string;
  user_thumb: string;
  is_active: number;
  plays: number;
  duration: number;
  last_played?: string;
  last_seen: number | null;
  ip_address?: string;
  platform?: string;
  player?: string;
}

export interface TautulliUsersTable {
  recordsFiltered: number;
  recordsTotal: number;
  data: TautulliUsersTableRow[];
  draw: number;
}

export interface TautulliHistoryEntry {
  row_id: number;
  reference_id: number;
  id: number;
  date: number;
  started: number;
  stopped: number;
  duration: number;
  play_duration: number;
  percent_complete: number;
  watched_status: 0 | 1 | 0.5;
  user_id: number;
  user: string;
  friendly_name: string;
  rating_key: string;
  parent_rating_key?: string;
  grandparent_rating_key?: string;
  full_title: string;
  title: string;
  year?: number;
  media_type: string;
  player: string;
  platform: string;
  product: string;
  location: string;
  ip_address: string;
  transcode_decision: string;
  group_count?: number;
  group_ids?: string;
}

export interface TautulliHistory {
  recordsFiltered: number;
  recordsTotal: number;
  data: TautulliHistoryEntry[];
  total_duration: string;
  filter_duration: string;
  draw: number;
}

/** Generic shape of one `get_home_stats` section — `rows` schema depends on `stat_id`. */
export interface TautulliHomeStat {
  stat_id: string;
  stat_type: string;
  stat_title: string;
  rows: Array<Record<string, unknown>>;
}

export interface TautulliUserWatchTime {
  query_days: number;
  total_time: number;
  total_plays: number;
}

export interface TautulliPlaysByDate {
  categories: string[];
  series: Array<{ name: string; data: number[] }>;
}
