import { trackerHost } from "@/lib/deluge/format";
import { DEFAULT_FILE_PRIORITY } from "@/lib/deluge/files-tree";
import { normalizeTorrentName } from "@/lib/deluge/torrent-name";
import type {
  FileDir,
  FileLeaf,
  FilterDict,
  FilterTuple,
  SessionStats,
  TorrentPeer,
  TorrentState,
  TorrentStatus,
  TorrentTracker,
  UiUpdate,
} from "@/lib/deluge/types";
import { TR_STATUS, type TransmissionSession, type TransmissionTorrent, type TransmissionTracker } from "./types";

export const TRANSMISSION_STATE_FILTERS = [
  "All",
  "Downloading",
  "Seeding",
  "Paused",
  "Checking",
  "Queued",
  "Error",
  "Active",
] as const;

/** Transmission file priorities (`fileStats[].priority`): TR_PRI_LOW, TR_PRI_NORMAL, TR_PRI_HIGH. */
export const TR_PRIORITY = { LOW: -1, NORMAL: 0, HIGH: 1 } as const;

export function delugePriorityFromTransmission(priority: number, wanted: boolean): number {
  if (!wanted) return 0;
  if (priority < TR_PRIORITY.NORMAL) return 1;
  if (priority > TR_PRIORITY.NORMAL) return 7;
  return DEFAULT_FILE_PRIORITY;
}

export function transmissionPriorityFromDeluge(priority: number): {
  wanted: boolean;
  priority: number;
} {
  if (!Number.isFinite(priority) || priority <= 0) return { wanted: false, priority: TR_PRIORITY.NORMAL };
  if (priority >= 5) return { wanted: true, priority: TR_PRIORITY.HIGH };
  if (priority >= 4) return { wanted: true, priority: TR_PRIORITY.NORMAL };
  return { wanted: true, priority: TR_PRIORITY.LOW };
}

export function torrentKey(torrent: TransmissionTorrent): string {
  const hash = typeof torrent.hashString === "string" ? torrent.hashString.trim() : "";
  if (hash) return hash.toLowerCase();
  return String(torrent.id);
}

export function mapTransmissionState(torrent: TransmissionTorrent): TorrentState {
  const error = (torrent.errorString || "").trim();
  if (error && (torrent.error ?? 0) !== 0) return "Error";
  switch (torrent.status) {
    case TR_STATUS.CHECK_WAIT:
    case TR_STATUS.DOWNLOAD_WAIT:
    case TR_STATUS.SEED_WAIT:
      return "Queued";
    case TR_STATUS.CHECK:
      return "Checking";
    case TR_STATUS.DOWNLOAD:
      return "Downloading";
    case TR_STATUS.SEED:
      return "Seeding";
    case TR_STATUS.STOPPED:
    default:
      if (error) return "Error";
      return "Paused";
  }
}

function firstTrackerUrl(torrent: TransmissionTorrent): string {
  const stat = torrent.trackerStats?.[0];
  if (stat?.host) return stat.host;
  if (stat?.announce) return stat.announce;
  return torrent.trackers?.[0]?.announce || "";
}

export function mapTransmissionTorrent(torrent: TransmissionTorrent): TorrentStatus {
  const size = Number(torrent.sizeWhenDone ?? torrent.totalSize ?? 0) || 0;
  const done = Number(torrent.downloadedEver ?? 0) || 0;
  const remaining = Number(torrent.leftUntilDone ?? Math.max(0, size - done)) || 0;
  const percent = Number(torrent.percentDone ?? 0);
  const progress =
    Number.isFinite(percent) && percent >= 0
      ? percent <= 1
        ? percent * 100
        : percent
      : size > 0
        ? (done / size) * 100
        : 0;
  const down = Number(torrent.rateDownload ?? 0) || 0;
  const up = Number(torrent.rateUpload ?? 0) || 0;
  const seeds = Number(torrent.peersSendingToUs ?? 0) || 0;
  const peers = Number(torrent.peersConnected ?? 0) || 0;
  const swarmSeeds = torrent.trackerStats?.[0]?.seederCount;
  const swarmPeers = torrent.trackerStats?.[0]?.leecherCount;
  const ratio = Number(torrent.uploadRatio ?? 0);
  const labels = Array.isArray(torrent.labels)
    ? torrent.labels.map((l) => String(l).trim()).filter(Boolean)
    : [];
  const tracker = firstTrackerUrl(torrent);
  const checking = torrent.status === TR_STATUS.CHECK;
  const recheck = Number(torrent.recheckProgress ?? 0);
  const queuePos = Number(torrent.queuePosition ?? 0);
  const state = mapTransmissionState(torrent);
  const queued = state === "Queued" || state === "Downloading" || state === "Paused";
  const activity = Number(torrent.activityDate ?? 0);
  return {
    queue: queued && queuePos >= 0 ? queuePos : state === "Downloading" ? queuePos : -1,
    name: normalizeTorrentName(torrent.name || torrentKey(torrent)),
    total_wanted: size,
    state,
    progress: checking && recheck > 0 && recheck <= 1 ? recheck * 100 : progress,
    is_finished: !checking && (progress >= 100 || (size > 0 && remaining === 0)),
    num_seeds: seeds,
    total_seeds: typeof swarmSeeds === "number" && swarmSeeds >= 0 ? swarmSeeds : -1,
    num_peers: Math.max(0, peers - seeds),
    total_peers: typeof swarmPeers === "number" && swarmPeers >= 0 ? swarmPeers : -1,
    download_payload_rate: down,
    upload_payload_rate: up,
    eta: Number(torrent.eta ?? -1),
    ratio: Number.isFinite(ratio) && ratio >= 0 ? ratio : 0,
    distributed_copies: 0,
    is_auto_managed: torrent.honorsSessionLimits !== false,
    time_added: Number(torrent.addedDate ?? 0) || 0,
    tracker_host: tracker ? trackerHost(tracker) : "",
    download_location: torrent.downloadDir || "",
    last_seen_complete: 0,
    total_done: done,
    total_uploaded: Number(torrent.uploadedEver ?? 0) || 0,
    max_download_speed: torrent.downloadLimited ? Number(torrent.downloadLimit ?? -1) : -1,
    max_upload_speed: torrent.uploadLimited ? Number(torrent.uploadLimit ?? -1) : -1,
    seeds_peers_ratio: peers > 0 ? seeds / peers : 0,
    total_remaining: remaining,
    completed_time: Number(torrent.doneDate ?? 0) || 0,
    time_since_transfer: activity ? Math.max(0, Math.round(Date.now() / 1000 - activity)) : 0,
    total_payload_download: done,
    total_payload_upload: Number(torrent.uploadedEver ?? 0) || 0,
    next_announce: Number(torrent.trackerStats?.[0]?.nextAnnounceTime ?? 0) || 0,
    tracker_status: errorStatus(torrent),
    num_pieces: Number(torrent.pieceCount ?? 0) || 0,
    piece_length: Number(torrent.pieceSize ?? 0) || 0,
    active_time: Number(torrent.secondsDownloading ?? 0) + Number(torrent.secondsSeeding ?? 0),
    seeding_time: Number(torrent.secondsSeeding ?? 0) || 0,
    seed_rank: queuePos,
    owner: "",
    public: torrent.isPrivate !== true,
    shared: false,
    total_size: Number(torrent.totalSize ?? size) || size,
    num_files: torrent.files?.length ?? 0,
    message: (torrent.errorString || "").trim(),
    comment: torrent.comment || "",
    creator: torrent.creator || "",
    max_connections: -1,
    max_upload_slots: -1,
    stop_at_ratio: (torrent.seedRatioMode ?? 0) !== 0,
    stop_ratio: Number(torrent.seedRatioLimit ?? 2) || 2,
    remove_at_ratio: false,
    private: torrent.isPrivate === true,
    prioritize_first_last: false,
    move_completed: false,
    move_completed_path: "",
    super_seeding: false,
    sequential_download: false,
    label: labels[0],
  };
}

function errorStatus(torrent: TransmissionTorrent): string {
  const error = (torrent.errorString || "").trim();
  if (error) return error;
  const stat = torrent.trackerStats?.[0];
  if (!stat) return "";
  if (stat.lastAnnounceSucceeded) return "Announce OK";
  return String(stat.lastAnnounceResult || "");
}

export function filesTreeFromTransmission(torrent: TransmissionTorrent): FileDir {
  const files = torrent.files ?? [];
  const stats = torrent.fileStats ?? [];
  const root: FileDir = { type: "dir", contents: {} };
  files.forEach((file, index) => {
    const stat = stats[index];
    const wanted = stat?.wanted !== false;
    const size = Number(file.length ?? 0) || 0;
    const completed = Number(stat?.bytesCompleted ?? file.bytesCompleted ?? 0) || 0;
    const leaf: FileLeaf = {
      type: "file",
      index,
      size,
      progress: size > 0 ? completed / size : 0,
      priority: delugePriorityFromTransmission(stat?.priority ?? TR_PRIORITY.NORMAL, wanted),
      offset: 0,
    };
    const parts = String(file.name || `file-${index}`).split(/[/\\]/).filter(Boolean);
    if (!parts.length) parts.push(`file-${index}`);
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const existing = dir.contents[part];
      if (!existing || existing.type !== "dir") dir.contents[part] = { type: "dir", contents: {} };
      dir = dir.contents[part] as FileDir;
    }
    dir.contents[parts[parts.length - 1]] = leaf;
  });
  return root;
}

export function mapTransmissionPeers(torrent: TransmissionTorrent): TorrentPeer[] {
  return (torrent.peers ?? []).map((peer) => ({
    client: peer.clientName || "",
    country: "",
    down_speed: Number(peer.rateToClient ?? 0) || 0,
    up_speed: Number(peer.rateToPeer ?? 0) || 0,
    ip: peer.port ? `${peer.address}:${peer.port}` : peer.address,
    progress: Number(peer.progress ?? 0) || 0,
    seed: peer.isUploadingTo && !peer.isDownloadingFrom ? 1 : 0,
  }));
}

export function mapTransmissionTrackers(torrent: TransmissionTorrent): TorrentTracker[] {
  if (torrent.trackers?.length) {
    return torrent.trackers.map((t) => ({ url: t.announce, tier: Number(t.tier ?? 0) || 0 }));
  }
  return (torrent.trackerStats ?? []).map((t) => ({
    url: t.announce || t.host || "",
    tier: Number(t.tier ?? 0) || 0,
  }));
}

export function uniqueLabels(torrents: TransmissionTorrent[]): string[] {
  const set = new Set<string>();
  for (const torrent of torrents) {
    for (const label of torrent.labels ?? []) {
      const trimmed = String(label).trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return [...set].sort();
}

export function buildTransmissionFilters(
  torrents: TransmissionTorrent[],
  labelsSupported: boolean
): Record<string, FilterTuple[]> {
  const counts = new Map<string, number>();
  for (const name of TRANSMISSION_STATE_FILTERS) counts.set(name, 0);
  const trackers = new Map<string, number>();
  const labels = new Map<string, number>();
  let unlabeled = 0;
  for (const torrent of torrents) {
    const status = mapTransmissionTorrent(torrent);
    counts.set("All", (counts.get("All") ?? 0) + 1);
    counts.set(status.state, (counts.get(status.state) ?? 0) + 1);
    if (status.download_payload_rate > 0 || status.upload_payload_rate > 0) {
      counts.set("Active", (counts.get("Active") ?? 0) + 1);
    }
    trackers.set(status.tracker_host || "", (trackers.get(status.tracker_host || "") ?? 0) + 1);
    if (labelsSupported) {
      const torrentLabels = (torrent.labels ?? []).map((l) => String(l).trim()).filter(Boolean);
      if (!torrentLabels.length) unlabeled += 1;
      for (const label of torrentLabels) labels.set(label, (labels.get(label) ?? 0) + 1);
    }
  }
  const result: Record<string, FilterTuple[]> = {
    state: TRANSMISSION_STATE_FILTERS.map((name) => [name, counts.get(name) ?? 0]),
    tracker_host: [
      ["All", counts.get("All") ?? 0],
      ...[...trackers.entries()].map(([name, count]) => [name, count] as FilterTuple),
    ],
  };
  if (labelsSupported) {
    result.label = [
      ["All", counts.get("All") ?? 0],
      ["", unlabeled],
      ...[...labels.entries()].map(([name, count]) => [name, count] as FilterTuple),
    ];
  }
  return result;
}

export function matchesTransmissionFilter(
  torrent: TransmissionTorrent,
  filter: FilterDict | undefined
): boolean {
  if (!filter) return true;
  const status = mapTransmissionTorrent(torrent);
  if (filter.state?.[0] && filter.state[0] !== "All") {
    const wanted = filter.state[0];
    if (wanted === "Active") {
      if (status.download_payload_rate <= 0 && status.upload_payload_rate <= 0) return false;
    } else if (status.state !== wanted) return false;
  }
  if (filter.tracker_host?.[0] && status.tracker_host !== filter.tracker_host[0]) return false;
  if (filter.label && filter.label[0] !== undefined) {
    const wanted = filter.label[0];
    const labels = (torrent.labels ?? []).map((l) => String(l).trim()).filter(Boolean);
    if (wanted === "") {
      if (labels.length) return false;
    } else if (!labels.includes(wanted)) return false;
  }
  return true;
}

export function mapSessionStats(
  session: TransmissionSession | null | undefined,
  torrents: TransmissionTorrent[]
): SessionStats {
  let download = 0;
  let upload = 0;
  let peers = 0;
  let payloadDownload = 0;
  let payloadUpload = 0;
  for (const torrent of torrents) {
    download += Number(torrent.rateDownload ?? 0) || 0;
    upload += Number(torrent.rateUpload ?? 0) || 0;
    peers += Number(torrent.peersConnected ?? 0) || 0;
    payloadDownload += Number(torrent.downloadedEver ?? 0) || 0;
    payloadUpload += Number(torrent.uploadedEver ?? 0) || 0;
  }
  return {
    max_download: session?.["speed-limit-down-enabled"]
      ? Number(session["speed-limit-down"] ?? 0) * 1024
      : -1,
    max_upload: session?.["speed-limit-up-enabled"] ? Number(session["speed-limit-up"] ?? 0) * 1024 : -1,
    max_num_connections: Number(session?.["peer-limit-global"] ?? 0) || 0,
    num_connections: peers,
    upload_rate: upload,
    download_rate: download,
    download_protocol_rate: 0,
    upload_protocol_rate: 0,
    dht_nodes: 0,
    has_incoming_connections: peers > 0,
    free_space: Number(session?.["download-dir-free-space"] ?? 0) || 0,
    external_ip: "",
    payload_download: payloadDownload,
    payload_upload: payloadUpload,
  };
}

export function mapUiUpdate(
  torrents: TransmissionTorrent[],
  session: TransmissionSession | null,
  filter: FilterDict | undefined,
  labelsSupported: boolean,
  keys: string[]
): UiUpdate {
  const visible = torrents.filter((t) => matchesTransmissionFilter(t, filter));
  const mapped: Record<string, TorrentStatus> = {};
  for (const torrent of visible) {
    const status = mapTransmissionTorrent(torrent);
    const id = torrentKey(torrent);
    if (keys.length) {
      const picked: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in status) picked[key] = status[key as keyof TorrentStatus];
      }
      mapped[id] = picked as unknown as TorrentStatus;
    } else {
      mapped[id] = status;
    }
  }
  return {
    connected: true,
    torrents: mapped,
    filters: buildTransmissionFilters(torrents, labelsSupported),
    stats: mapSessionStats(session, torrents),
  };
}

export function sessionToCoreConfig(session: TransmissionSession): Record<string, unknown> {
  const downEnabled = Boolean(session["speed-limit-down-enabled"]);
  const upEnabled = Boolean(session["speed-limit-up-enabled"]);
  return {
    download_location: session["download-dir"] ?? "",
    move_completed: Boolean(session["incomplete-dir-enabled"]),
    move_completed_path: session["incomplete-dir"] ?? "",
    add_paused: session["start-added-torrents"] === false,
    sequential_download: false,
    prioritize_first_last_pieces: false,
    max_download_speed: downEnabled ? Number(session["speed-limit-down"] ?? -1) : -1,
    max_upload_speed: upEnabled ? Number(session["speed-limit-up"] ?? -1) : -1,
    max_download_speed_per_torrent: -1,
    max_upload_speed_per_torrent: -1,
    max_connections_global: Number(session["peer-limit-global"] ?? 200) || 200,
    max_connections_per_torrent: Number(session["peer-limit-per-torrent"] ?? -1) || -1,
    listen_ports: [
      Number(session["peer-port"] ?? 51413) || 51413,
      Number(session["peer-port"] ?? 51413) || 51413,
    ],
    random_port: Boolean(session["peer-port-random-on-start"]),
    dht: session["dht-enabled"] !== false,
    utpex: session["pex-enabled"] !== false,
    lsd: session["lpd-enabled"] !== false,
    utp: session["utp-enabled"] !== false,
    upnp: Boolean(session["port-forwarding-enabled"]),
    natpmp: Boolean(session["port-forwarding-enabled"]),
    max_active_downloading: Number(session["download-queue-size"] ?? 5) || 5,
    max_active_seeding: Number(session["seed-queue-size"] ?? 5) || 5,
    share_ratio_limit: Number(session["ratio-limit"] ?? 2) || 2,
    stop_seed_at_ratio: Boolean(session["ratio-limit-enabled"]),
    stop_seed_ratio: Number(session["ratio-limit"] ?? 2) || 2,
    cache_size: (Number(session["cache-size-mb"] ?? 4) || 4) * 1024,
    ...session,
  };
}

export function coreConfigToSession(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes("-")) out[key] = value;
  }
  if ("download_location" in patch) out["download-dir"] = patch.download_location;
  if ("move_completed_path" in patch) out["incomplete-dir"] = patch.move_completed_path;
  if ("move_completed" in patch) out["incomplete-dir-enabled"] = Boolean(patch.move_completed);
  if ("add_paused" in patch) out["start-added-torrents"] = !patch.add_paused;
  if ("max_download_speed" in patch) {
    const n = Number(patch.max_download_speed);
    if (n < 0) out["speed-limit-down-enabled"] = false;
    else {
      out["speed-limit-down-enabled"] = true;
      out["speed-limit-down"] = n;
    }
  }
  if ("max_upload_speed" in patch) {
    const n = Number(patch.max_upload_speed);
    if (n < 0) out["speed-limit-up-enabled"] = false;
    else {
      out["speed-limit-up-enabled"] = true;
      out["speed-limit-up"] = n;
    }
  }
  if ("max_connections_global" in patch) out["peer-limit-global"] = patch.max_connections_global;
  if ("max_connections_per_torrent" in patch) out["peer-limit-per-torrent"] = patch.max_connections_per_torrent;
  if ("dht" in patch) out["dht-enabled"] = Boolean(patch.dht);
  if ("utpex" in patch) out["pex-enabled"] = Boolean(patch.utpex);
  if ("lsd" in patch) out["lpd-enabled"] = Boolean(patch.lsd);
  if ("utp" in patch) out["utp-enabled"] = Boolean(patch.utp);
  if ("upnp" in patch || "natpmp" in patch) out["port-forwarding-enabled"] = Boolean(patch.upnp ?? patch.natpmp);
  if ("random_port" in patch) out["peer-port-random-on-start"] = Boolean(patch.random_port);
  if ("listen_ports" in patch && Array.isArray(patch.listen_ports) && patch.listen_ports[0] != null) {
    out["peer-port"] = Number(patch.listen_ports[0]);
  }
  if ("max_active_downloading" in patch) {
    out["download-queue-size"] = patch.max_active_downloading;
    out["download-queue-enabled"] = Number(patch.max_active_downloading) > 0;
  }
  if ("max_active_seeding" in patch) {
    out["seed-queue-size"] = patch.max_active_seeding;
    out["seed-queue-enabled"] = Number(patch.max_active_seeding) > 0;
  }
  if ("share_ratio_limit" in patch || "stop_seed_ratio" in patch) {
    out["ratio-limit"] = patch.share_ratio_limit ?? patch.stop_seed_ratio;
  }
  if ("stop_seed_at_ratio" in patch) out["ratio-limit-enabled"] = Boolean(patch.stop_seed_at_ratio);
  if ("cache_size" in patch) {
    const kib = Number(patch.cache_size);
    if (Number.isFinite(kib)) out["cache-size-mb"] = Math.max(0, Math.round(kib / 1024));
  }
  return out;
}

/**
 * `torrent-set` args that turn the torrent's tracker list into `wanted`.
 * `trackerRemove` takes tracker ids, not URLs, and libtransmission rejects an empty or no-op
 * `trackerAdd`/`trackerRemove`, so each key is only sent when it has work to do.
 */
export function trackerEditToTransmissionArgs(
  current: readonly TransmissionTracker[],
  wanted: readonly string[]
): Record<string, unknown> {
  const wantedSet = new Set(wanted.map((url) => url.trim()).filter(Boolean));
  const currentUrls = new Set(current.map((t) => t.announce));
  const trackerAdd = [...wantedSet].filter((url) => !currentUrls.has(url));
  const trackerRemove: number[] = [];
  for (const tracker of current) {
    if (wantedSet.has(tracker.announce)) continue;
    if (typeof tracker.id !== "number") {
      throw new Error(`Transmission did not report an id for tracker ${tracker.announce}`);
    }
    trackerRemove.push(tracker.id);
  }
  const args: Record<string, unknown> = {};
  if (trackerAdd.length) args.trackerAdd = trackerAdd;
  if (trackerRemove.length) args.trackerRemove = trackerRemove;
  return args;
}

export function filePrioritiesToTransmissionArgs(priorities: number[]): Record<string, unknown> {
  const wanted: number[] = [];
  const unwanted: number[] = [];
  const low: number[] = [];
  const normal: number[] = [];
  const high: number[] = [];
  priorities.forEach((priority, index) => {
    const mapped = transmissionPriorityFromDeluge(priority);
    if (!mapped.wanted) {
      unwanted.push(index);
      return;
    }
    wanted.push(index);
    if (mapped.priority === TR_PRIORITY.HIGH) high.push(index);
    else if (mapped.priority === TR_PRIORITY.LOW) low.push(index);
    else normal.push(index);
  });
  const args: Record<string, unknown> = {};
  if (wanted.length) args["files-wanted"] = wanted;
  if (unwanted.length) args["files-unwanted"] = unwanted;
  if (low.length) args["priority-low"] = low;
  if (normal.length) args["priority-normal"] = normal;
  if (high.length) args["priority-high"] = high;
  return args;
}

export function torrentOptionsToTransmission(options: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if ("max_download_speed" in options) {
    const n = Number(options.max_download_speed);
    if (!Number.isFinite(n) || n < 0) args.downloadLimited = false;
    else {
      args.downloadLimited = true;
      args.downloadLimit = n;
    }
  }
  if ("max_upload_speed" in options) {
    const n = Number(options.max_upload_speed);
    if (!Number.isFinite(n) || n < 0) args.uploadLimited = false;
    else {
      args.uploadLimited = true;
      args.uploadLimit = n;
    }
  }
  if ("is_auto_managed" in options) args.honorsSessionLimits = Boolean(options.is_auto_managed);
  if ("stop_at_ratio" in options) args.seedRatioMode = options.stop_at_ratio ? 1 : 0;
  if ("stop_ratio" in options) args.seedRatioLimit = Number(options.stop_ratio);
  if (Array.isArray(options.file_priorities)) {
    Object.assign(args, filePrioritiesToTransmissionArgs(options.file_priorities as number[]));
  }
  return args;
}

export function addOptionsToTransmission(options: Record<string, unknown> | undefined): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (!options) return args;
  if (typeof options.download_location === "string" && options.download_location) {
    args["download-dir"] = options.download_location;
  }
  if (options.add_paused != null) args.paused = Boolean(options.add_paused);
  Object.assign(args, torrentOptionsToTransmission(options));
  return args;
}

export function resolveTransmissionIds(ids: unknown, torrents: TransmissionTorrent[]): number[] {
  const list = Array.isArray(ids) ? ids : ids == null ? [] : [ids];
  const byKey = new Map<string, number>();
  for (const torrent of torrents) {
    byKey.set(torrentKey(torrent), torrent.id);
    byKey.set(String(torrent.id), torrent.id);
  }
  const out: number[] = [];
  for (const id of list) {
    const key = String(id);
    const numeric = byKey.get(key) ?? byKey.get(key.toLowerCase());
    if (typeof numeric === "number") out.push(numeric);
    else if (/^\d+$/.test(key)) out.push(Number(key));
  }
  return out;
}
