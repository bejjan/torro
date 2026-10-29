export type TorrentState =
  | "Downloading"
  | "Seeding"
  | "Paused"
  | "Checking"
  | "Queued"
  | "Error"
  | "Allocating"
  | "Moving";

export interface TorrentStatus {
  queue: number;
  name: string;
  total_wanted: number;
  state: TorrentState;
  progress: number;
  is_finished?: boolean;
  num_seeds: number;
  total_seeds: number;
  num_peers: number;
  total_peers: number;
  download_payload_rate: number;
  upload_payload_rate: number;
  eta: number;
  ratio: number;
  distributed_copies: number;
  is_auto_managed: boolean;
  time_added: number;
  tracker_host: string;
  download_location: string;
  last_seen_complete: number;
  total_done: number;
  total_uploaded: number;
  max_download_speed: number;
  max_upload_speed: number;
  seeds_peers_ratio: number;
  total_remaining: number;
  completed_time: number;
  time_since_transfer: number;
  total_payload_download: number;
  total_payload_upload: number;
  next_announce: number;
  tracker_status: string;
  num_pieces: number;
  piece_length: number;
  active_time: number;
  seeding_time: number;
  seed_rank: number;
  owner: string;
  public: boolean;
  shared: boolean;
  total_size: number;
  num_files: number;
  message: string;
  comment: string;
  creator: string;
  max_connections: number;
  max_upload_slots: number;
  stop_at_ratio: boolean;
  stop_ratio: number;
  remove_at_ratio: boolean;
  private: boolean;
  prioritize_first_last: boolean;
  move_completed: boolean;
  move_completed_path: string;
  super_seeding: boolean;
  sequential_download: boolean;
  label?: string;
}

export interface SessionStats {
  max_download: number;
  max_upload: number;
  max_num_connections: number;
  num_connections: number;
  upload_rate: number;
  download_rate: number;
  download_protocol_rate: number;
  upload_protocol_rate: number;
  dht_nodes: number;
  has_incoming_connections: boolean;
  free_space: number;
  external_ip: string;
  /** Session payload downloaded (bytes), when the daemon reports it. */
  payload_download?: number;
  /** Session payload uploaded (bytes), when the daemon reports it. */
  payload_upload?: number;
}

export type FilterTuple = [string, number];

export interface UiUpdate {
  connected: boolean;
  torrents: Record<string, TorrentStatus> | null;
  filters: Record<string, FilterTuple[]> | null;
  stats: SessionStats | null;
  /** Present when this frame only contains torrent fields that changed. */
  partial?: boolean;
  /** Torrent ids removed since the previous full or partial frame. */
  removed?: string[];
  /** Server snapshot id. Send it back to receive another partial frame. */
  revision?: number;
}

export interface JsonRpcResponse<T = unknown> {
  id: number | string;
  result: T | null;
  error: { message: string; code?: number } | null;
}

export type HostInfo = [string, string, number, string];
export type HostStatus = [string, string, string];

export interface TorrentPeer {
  client: string;
  country: string;
  down_speed: number;
  up_speed: number;
  ip: string;
  progress: number;
  seed: number;
}

export interface TorrentTracker {
  url: string;
  tier: number;
}

export interface FileLeaf {
  type: "file";
  index: number;
  size: number;
  progress: number;
  priority: number;
  offset: number;
}

export interface FileDir {
  type: "dir";
  contents: Record<string, FileNode>;
}

export type FileNode = FileLeaf | FileDir;

export interface AddTorrentOptions {
  download_location?: string;
  move_completed?: boolean;
  move_completed_path?: string;
  add_paused?: boolean;
  sequential_download?: boolean;
  prioritize_first_last_pieces?: boolean;
  max_download_speed?: number;
  max_upload_speed?: number;
  max_connections?: number;
  max_upload_slots?: number;
  pre_allocated?: boolean;
  pre_allocate_storage?: boolean;
  seed_mode?: boolean;
  super_seeding?: boolean;
  file_priorities?: number[];
}

export interface LabelOptions {
  apply_max: boolean;
  max_download_speed: number;
  max_upload_speed: number;
  max_connections: number;
  max_upload_slots: number;
  apply_queue: boolean;
  is_auto_managed: boolean;
  stop_at_ratio: boolean;
  stop_ratio: number;
  remove_at_ratio: boolean;
  apply_move: boolean;
  move_completed: boolean;
  move_completed_path: string;
  apply_tracker: boolean;
  tracker: string;
}

export interface ExecuteCommand {
  id: string;
  event: string;
  command: string;
}

export interface WatchDir {
  id: string;
  path: string;
  enabled: boolean;
  append_extension: string;
  download_location: string;
  add_paused: boolean;
  label: string;
}

export type FilterDict = Record<string, string[]>;
