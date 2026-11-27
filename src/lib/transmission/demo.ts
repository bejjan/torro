import { randomBytes } from "crypto";
import {
  adminDemoCacheKey,
  generateSyntheticTorrentSpecs,
  type AdminDemoConfig,
  type SyntheticTorrentSpec,
} from "../demo/admin-catalog";
import { parseMagnetName, trackerHost } from "@/lib/deluge/format";
import { inventDemoFilesTree, parseMagnetInfoHash, type TorrentInfoDir } from "@/lib/deluge/files-tree";
import { TR_PRIORITY, resolveTransmissionIds, torrentKey } from "./map";
import {
  TR_STATUS,
  type TransmissionRpcRequest,
  type TransmissionRpcResponse,
  type TransmissionSession,
  type TransmissionTorrent,
} from "./types";

const DEMO_PASSWORD = "deluge";
export const TX_SESSION_COOKIE = "nova_tx_session";

type UploadRecord = {
  name: string;
  size: number;
  metainfo: string;
  filesTree: TorrentInfoDir;
  infoHash: string;
};

interface TxDemoState {
  sessions: Set<string>;
  torrents: TransmissionTorrent[];
  nextId: number;
  session: TransmissionSession;
  webConfig: Record<string, unknown>;
  knownLabels: Set<string>;
  uploads: Record<string, UploadRecord>;
  lastTick: number;
  labelsSupported: boolean;
}

type GlobalTx = typeof globalThis & {
  __novaTransmissionDemo?: TxDemoState;
  __novaTransmissionAdminDemo?: { key: string; state: TxDemoState };
};

const txSessions = new Set<string>();

function trStatusFor(state: SyntheticTorrentSpec["state"]): number {
  switch (state) {
    case "Downloading":
      return TR_STATUS.DOWNLOAD;
    case "Seeding":
      return TR_STATUS.SEED;
    case "Checking":
      return TR_STATUS.CHECK;
    case "Queued":
      return TR_STATUS.DOWNLOAD_WAIT;
    case "Error":
      return TR_STATUS.STOPPED;
    case "Paused":
    default:
      return TR_STATUS.STOPPED;
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function fakeHash(seed: string): string {
  let n = 2166136261;
  let hex = "";
  for (let i = 0; i < 40; i++) {
    n ^= seed.charCodeAt(i % seed.length) + i;
    n = Math.imul(n, 16777619);
    hex += (n >>> 0).toString(16).padStart(8, "0").slice(-1);
  }
  return hex;
}

function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function defaultSession(): TransmissionSession {
  return {
    version: "4.0.6 (demo)",
    "rpc-version": 18,
    "download-dir": "/home/transmission/Downloads",
    "incomplete-dir": "/home/transmission/Incomplete",
    "incomplete-dir-enabled": false,
    "start-added-torrents": true,
    "rename-partial-files": true,
    "speed-limit-down": 2048,
    "speed-limit-down-enabled": false,
    "speed-limit-up": 512,
    "speed-limit-up-enabled": false,
    "alt-speed-down": 500,
    "alt-speed-up": 100,
    "alt-speed-enabled": false,
    "peer-limit-global": 200,
    "peer-limit-per-torrent": 60,
    "peer-port": 51413,
    "peer-port-random-on-start": false,
    "port-forwarding-enabled": true,
    "dht-enabled": true,
    "pex-enabled": true,
    "lpd-enabled": true,
    "utp-enabled": true,
    encryption: "preferred",
    "seed-queue-size": 5,
    "seed-queue-enabled": false,
    "download-queue-size": 5,
    "download-queue-enabled": true,
    "idle-seeding-limit": 30,
    "idle-seeding-limit-enabled": false,
    "ratio-limit": 2,
    "ratio-limit-enabled": false,
    "download-dir-free-space": 180 * 1024 ** 3,
    "cache-size-mb": 4,
  };
}

function makeTorrent(opts: {
  id: number;
  name: string;
  size: number;
  progress: number;
  status: number;
  down: number;
  up: number;
  labels?: string[];
  tracker: string;
  queue: number;
  error?: string;
  hash?: string;
  files?: { name: string; length: number; progress: number }[];
}): TransmissionTorrent {
  const done = Math.round(opts.size * opts.progress);
  const files = (opts.files ?? [{ name: opts.name, length: opts.size, progress: opts.progress }]).map(
    (file) => ({
      name: file.name,
      length: file.length,
      bytesCompleted: Math.round(file.length * file.progress),
    })
  );
  return {
    id: opts.id,
    name: opts.name,
    status: opts.status,
    percentDone: opts.progress,
    rateDownload: opts.status === TR_STATUS.DOWNLOAD ? opts.down : 0,
    rateUpload: opts.status === TR_STATUS.STOPPED || opts.status === TR_STATUS.DOWNLOAD_WAIT ? 0 : opts.up,
    eta: opts.status === TR_STATUS.DOWNLOAD && opts.down > 0 ? Math.max(0, opts.size - done) / opts.down : -1,
    sizeWhenDone: opts.size,
    totalSize: opts.size,
    downloadedEver: done,
    uploadedEver: Math.round(opts.size * 0.35),
    uploadRatio: 0.35,
    peersConnected: opts.status === TR_STATUS.STOPPED ? 0 : 8,
    peersGettingFromUs: opts.status === TR_STATUS.SEED ? 6 : 2,
    peersSendingToUs: opts.status === TR_STATUS.DOWNLOAD ? 5 : 0,
    addedDate: nowSec() - 86400 * opts.id,
    doneDate: opts.progress >= 1 ? nowSec() - 3600 : 0,
    activityDate: nowSec() - 12,
    downloadDir: "/home/transmission/Downloads",
    hashString: opts.hash ?? fakeHash(opts.name),
    labels: opts.labels ?? [],
    files,
    fileStats: files.map((f) => ({ bytesCompleted: f.bytesCompleted, wanted: true, priority: TR_PRIORITY.NORMAL })),
    trackers: [
      { announce: opts.tracker, id: 0, tier: 0 },
      { announce: "udp://tracker.opentrackr.org:1337/announce", id: 1, tier: 1 },
    ],
    trackerStats: [
      {
        announce: opts.tracker,
        host: trackerHost(opts.tracker) || opts.tracker,
        lastAnnounceSucceeded: !opts.error,
        lastAnnounceResult: opts.error || "Success",
        nextAnnounceTime: nowSec() + 1800,
        seederCount: 42,
        leecherCount: 120,
        tier: 0,
      },
    ],
    peers: [
      {
        address: `91.64.12.${10 + opts.id}`,
        port: 51413,
        clientName: "qBittorrent 5.1.0",
        progress: Math.min(1, opts.progress + 0.1),
        rateToClient: Math.round(opts.down * 0.4),
        rateToPeer: Math.round(opts.up * 0.3),
        isDownloadingFrom: opts.status === TR_STATUS.DOWNLOAD,
        isUploadingTo: opts.status === TR_STATUS.SEED,
      },
    ],
    honorsSessionLimits: true,
    downloadLimited: false,
    downloadLimit: 100,
    uploadLimited: false,
    uploadLimit: 100,
    seedRatioLimit: 2,
    seedRatioMode: 0,
    queuePosition: opts.queue,
    error: opts.error ? 3 : 0,
    errorString: opts.error ?? "",
    isFinished: opts.progress >= 1,
    leftUntilDone: Math.max(0, opts.size - done),
    pieceCount: Math.max(1, Math.round(opts.size / (256 * 1024))),
    pieceSize: 262144,
    comment: "Demo torrent",
    creator: "torro",
    isPrivate: false,
    recheckProgress: opts.status === TR_STATUS.CHECK ? opts.progress : 1,
    secondsDownloading: 5400,
    secondsSeeding: opts.progress >= 1 ? 3600 : 0,
  };
}

function seedTorrents(): TransmissionTorrent[] {
  return [
    makeTorrent({
      id: 1,
      name: "ubuntu-24.04.2-desktop-amd64.iso",
      size: 5.9 * 1024 ** 3,
      progress: 0.472,
      status: TR_STATUS.DOWNLOAD,
      down: 4.2 * 1024 ** 2,
      up: 180 * 1024,
      labels: ["linux"],
      tracker: "https://torrent.ubuntu.com/announce",
      queue: 0,
    }),
    makeTorrent({
      id: 2,
      name: "debian-12.10.0-amd64-netinst.iso",
      size: 661 * 1024 ** 2,
      progress: 1,
      status: TR_STATUS.SEED,
      down: 0,
      up: 920 * 1024,
      labels: ["linux"],
      tracker: "https://bttracker.debian.org:443/announce",
      queue: 0,
    }),
    makeTorrent({
      id: 3,
      name: "archlinux-2026.08.01-x86_64.iso",
      size: 1.2 * 1024 ** 3,
      progress: 0.238,
      status: TR_STATUS.STOPPED,
      down: 0,
      up: 0,
      labels: ["linux"],
      tracker: "udp://tracker.archlinux.org:6969/announce",
      queue: 2,
    }),
    makeTorrent({
      id: 4,
      name: "Fedora-Workstation-Live-42-1.1.x86_64.iso",
      size: 2.3 * 1024 ** 3,
      progress: 0,
      status: TR_STATUS.DOWNLOAD_WAIT,
      down: 0,
      up: 0,
      labels: ["linux"],
      tracker: "http://torrent.fedoraproject.org:6969/announce",
      queue: 3,
    }),
    makeTorrent({
      id: 5,
      name: "linuxmint-22.1-cinnamon-64bit.iso",
      size: 3.1 * 1024 ** 3,
      progress: 0.824,
      status: TR_STATUS.DOWNLOAD,
      down: 2.8 * 1024 ** 2,
      up: 64 * 1024,
      labels: ["linux"],
      tracker: "https://linuxmint.com/torrent/announce",
      queue: 1,
    }),
    makeTorrent({
      id: 6,
      name: "openSUSE-Tumbleweed-DVD-x86_64.iso",
      size: 4.4 * 1024 ** 3,
      progress: 0.121,
      status: TR_STATUS.STOPPED,
      down: 0,
      up: 0,
      tracker: "http://tracker.opensuse.org:6969/announce",
      queue: 4,
      error: "No space left on device",
    }),
    makeTorrent({
      id: 7,
      name: "Big Buck Bunny (2008) 1080p",
      size: 850 * 1024 ** 2,
      progress: 1,
      status: TR_STATUS.SEED,
      down: 0,
      up: 1.4 * 1024 ** 2,
      labels: ["movies"],
      tracker: "udp://tracker.opentrackr.org:1337/announce",
      queue: 1,
      files: [
        { name: "Big Buck Bunny/bbb_sunflower_1080p.mp4", length: 800 * 1024 ** 2, progress: 1 },
        { name: "Big Buck Bunny/poster.jpg", length: 2 * 1024 ** 2, progress: 1 },
        { name: "Big Buck Bunny/extras/soundtrack.flac", length: 6 * 1024 ** 2, progress: 1 },
      ],
    }),
    makeTorrent({
      id: 8,
      name: "blender-open-movie-pack",
      size: 1.8 * 1024 ** 3,
      progress: 0.615,
      status: TR_STATUS.CHECK,
      down: 0,
      up: 0,
      labels: ["movies"],
      tracker: "udp://tracker.openbittorrent.com:6969/announce",
      queue: 0,
    }),
    makeTorrent({
      id: 9,
      name: "Dune.Part.Two.2024.REPACK.2160p.UPSCALE.WEB.HEVC.10Bit.AAC.2.0-R&H.mkv",
      size: 18.4 * 1024 ** 3,
      progress: 1,
      status: TR_STATUS.SEED,
      down: 0,
      up: 2.1 * 1024 ** 2,
      labels: ["movies"],
      tracker: "udp://tracker.opentrackr.org:1337/announce",
      queue: 1,
      files: [
        {
          name: "Dune.Part.Two.2024.REPACK.2160p.UPSCALE.WEB.HEVC.10Bit.AAC.2.0-R&H.mkv",
          length: 18.4 * 1024 ** 3,
          progress: 1,
        },
      ],
    }),
  ];
}

function torrentFromSpec(spec: SyntheticTorrentSpec, id: number): TransmissionTorrent {
  return makeTorrent({
    id,
    name: spec.name,
    size: spec.size,
    progress: spec.progress / 100,
    status: trStatusFor(spec.state),
    down: spec.down,
    up: spec.up,
    labels: spec.label ? [spec.label] : [],
    tracker: spec.tracker,
    queue: spec.queue < 0 ? 0 : spec.queue,
    error: spec.message,
    hash: spec.hash,
  });
}

function emptyTxState(torrents: TransmissionTorrent[], nextId: number, labels: string[]): TxDemoState {
  return {
    sessions: txSessions,
    torrents,
    nextId,
    session: defaultSession(),
    webConfig: { show_sidebar: true, show_session_speed: true, sidebar_show_zero: false },
    knownLabels: new Set(labels),
    uploads: {},
    lastTick: Date.now(),
    labelsSupported: true,
  };
}

function getState(admin?: AdminDemoConfig | null): TxDemoState {
  const g = globalThis as GlobalTx;
  if (admin?.enabled) {
    const key = adminDemoCacheKey(admin);
    if (!g.__novaTransmissionAdminDemo || g.__novaTransmissionAdminDemo.key !== key) {
      const specs = generateSyntheticTorrentSpecs(admin);
      const torrents = specs.map((spec, i) => torrentFromSpec(spec, i + 1));
      const labels = specs.map((s) => s.label).filter((label): label is string => Boolean(label));
      g.__novaTransmissionAdminDemo = {
        key,
        state: emptyTxState(torrents, torrents.length + 1, labels),
      };
    }
    return g.__novaTransmissionAdminDemo.state;
  }
  if (!g.__novaTransmissionDemo) {
    g.__novaTransmissionDemo = emptyTxState(seedTorrents(), 10, ["linux", "movies"]);
  }
  return g.__novaTransmissionDemo;
}

export function resetTransmissionAdminDemo() {
  delete (globalThis as GlobalTx).__novaTransmissionAdminDemo;
}

function tickDownloads(state: TxDemoState) {
  const now = Date.now();
  const dt = Math.min(5, Math.max(0.2, (now - state.lastTick) / 1000));
  state.lastTick = now;
  for (const torrent of state.torrents) {
    const size = Number(torrent.sizeWhenDone ?? 0) || 0;
    if (torrent.status === TR_STATUS.DOWNLOAD) {
      const rate = Number(torrent.rateDownload ?? 0) || 0;
      if (rate > 0 && size > 0) {
        const done = Math.min(size, (Number(torrent.downloadedEver ?? 0) || 0) + rate * dt);
        torrent.downloadedEver = done;
        torrent.leftUntilDone = Math.max(0, size - done);
        torrent.percentDone = done / size;
        if (done >= size) {
          torrent.status = TR_STATUS.SEED;
          torrent.percentDone = 1;
          torrent.rateDownload = 0;
          torrent.isFinished = true;
          torrent.doneDate = nowSec();
        }
      }
      torrent.rateDownload = Math.max(
        80 * 1024,
        (Number(torrent.rateDownload ?? 0) || 0) + (Math.random() - 0.5) * 200 * 1024
      );
      torrent.rateUpload = Math.max(
        0,
        (Number(torrent.rateUpload ?? 0) || 0) + (Math.random() - 0.45) * 20 * 1024
      );
    } else if (torrent.status === TR_STATUS.SEED) {
      const up = Number(torrent.rateUpload ?? 0) || 0;
      torrent.uploadedEver = (Number(torrent.uploadedEver ?? 0) || 0) + up * dt;
      torrent.uploadRatio = size > 0 ? (Number(torrent.uploadedEver ?? 0) || 0) / size : 0;
      torrent.rateUpload = Math.max(32 * 1024, up + (Math.random() - 0.5) * 80 * 1024);
    } else if (torrent.status === TR_STATUS.CHECK) {
      const next = Math.min(1, (Number(torrent.percentDone ?? 0) || 0) + dt * 0.04);
      torrent.percentDone = next;
      torrent.recheckProgress = next;
      if (next >= 1) {
        torrent.status = TR_STATUS.SEED;
        torrent.percentDone = 1;
        torrent.isFinished = true;
        torrent.recheckProgress = 1;
        torrent.doneDate = nowSec();
      }
    }
  }
}

function ok(args: Record<string, unknown> = {}, tag?: number | string): TransmissionRpcResponse {
  return { result: "success", arguments: args, tag };
}

function fail(message: string, tag?: number | string): TransmissionRpcResponse {
  return { result: message, arguments: {}, tag };
}

function idsOf(args: Record<string, unknown> | undefined, state: TxDemoState): TransmissionTorrent[] {
  if (args?.ids == null || args.ids === "recently-active") return state.torrents;
  const numeric = new Set(resolveTransmissionIds(args.ids, state.torrents));
  return state.torrents.filter((t) => numeric.has(t.id));
}

function applyTorrentSet(torrent: TransmissionTorrent, args: Record<string, unknown>) {
  if (typeof args.downloadLimited === "boolean") torrent.downloadLimited = args.downloadLimited;
  if (typeof args.downloadLimit === "number") torrent.downloadLimit = args.downloadLimit;
  if (typeof args.uploadLimited === "boolean") torrent.uploadLimited = args.uploadLimited;
  if (typeof args.uploadLimit === "number") torrent.uploadLimit = args.uploadLimit;
  if (typeof args.honorsSessionLimits === "boolean") torrent.honorsSessionLimits = args.honorsSessionLimits;
  if (typeof args.seedRatioMode === "number") torrent.seedRatioMode = args.seedRatioMode;
  if (typeof args.seedRatioLimit === "number") torrent.seedRatioLimit = args.seedRatioLimit;
  if (typeof args.queuePosition === "number") torrent.queuePosition = args.queuePosition;
  if (Array.isArray(args.labels)) torrent.labels = args.labels.map((l) => String(l).trim()).filter(Boolean);
  if (typeof args.location === "string") torrent.downloadDir = args.location;
  const stats = torrent.fileStats ?? [];
  const mark = (indexes: unknown, patch: Partial<(typeof stats)[number]>) => {
    if (!Array.isArray(indexes)) return;
    for (const raw of indexes) {
      const i = Number(raw);
      if (Number.isInteger(i) && i >= 0 && i < stats.length) Object.assign(stats[i], patch);
    }
  };
  mark(args["files-wanted"], { wanted: true });
  mark(args["files-unwanted"], { wanted: false });
  mark(args["priority-low"], { priority: TR_PRIORITY.LOW });
  mark(args["priority-normal"], { priority: TR_PRIORITY.NORMAL });
  mark(args["priority-high"], { priority: TR_PRIORITY.HIGH });
  torrent.fileStats = stats;
  if (Array.isArray(args.trackerRemove)) {
    const ids = new Set(args.trackerRemove.map(Number));
    const keep = (torrent.trackers ?? []).filter((t) => !ids.has(Number(t.id)));
    const kept = new Set(keep.map((t) => t.announce));
    torrent.trackers = keep;
    torrent.trackerStats = (torrent.trackerStats ?? []).filter((t) => kept.has(String(t.announce)));
  }
  if (Array.isArray(args.trackerAdd)) {
    const trackers = torrent.trackers ?? [];
    let nextId = trackers.reduce((max, t) => Math.max(max, Number(t.id ?? -1)), -1) + 1;
    const nextTier = trackers.reduce((max, t) => Math.max(max, Number(t.tier ?? -1)), -1) + 1;
    for (const raw of args.trackerAdd) {
      const announce = String(raw).trim();
      if (!announce || trackers.some((t) => t.announce === announce)) continue;
      trackers.push({ announce, id: nextId++, tier: nextTier });
    }
    torrent.trackers = trackers;
  }
}

export function transmissionDemoCookie(header: string | null): string | undefined {
  return parseCookie(header)[TX_SESSION_COOKIE];
}

export function isTransmissionDemoAuthed(
  cookieHeader: string | null,
  admin?: AdminDemoConfig | null
): boolean {
  const sid = transmissionDemoCookie(cookieHeader);
  return Boolean(sid && getState(admin).sessions.has(sid));
}

export function loginTransmissionDemo(
  password: string,
  admin?: AdminDemoConfig | null
): { ok: boolean; setCookie?: string } {
  if (!admin?.enabled && password !== DEMO_PASSWORD) return { ok: false };
  const sid = randomBytes(16).toString("hex");
  getState(admin).sessions.add(sid);
  return { ok: true, setCookie: `${TX_SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax` };
}

export function logoutTransmissionDemo(
  cookieHeader: string | null,
  admin?: AdminDemoConfig | null
): string {
  const sid = transmissionDemoCookie(cookieHeader);
  if (sid) getState(admin).sessions.delete(sid);
  return `${TX_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export function handleTransmissionDemoUpload(
  name: string,
  size: number,
  metainfo = "",
  admin?: AdminDemoConfig | null
) {
  const infoHash = fakeHash(name + String(size));
  const path = `/tmp/nova-tx-${infoHash}.torrent`;
  getState(admin).uploads[path] = {
    name: name.replace(/\.torrent$/i, "") || name,
    size: size || 400 * 1024 ** 2,
    metainfo,
    filesTree: inventDemoFilesTree(name, size || 400 * 1024 ** 2),
    infoHash,
  };
  return { success: true, files: [path] };
}

export function getTransmissionDemoUpload(
  path: string,
  admin?: AdminDemoConfig | null
): UploadRecord | undefined {
  return getState(admin).uploads[path];
}

export function getTransmissionDemoWebConfig(admin?: AdminDemoConfig | null): Record<string, unknown> {
  return { ...getState(admin).webConfig };
}

export function setTransmissionDemoWebConfig(
  patch: Record<string, unknown>,
  admin?: AdminDemoConfig | null
) {
  Object.assign(getState(admin).webConfig, patch);
}

export function transmissionDemoLabels(admin?: AdminDemoConfig | null): string[] {
  const state = getState(admin);
  const set = new Set(state.knownLabels);
  for (const torrent of state.torrents) {
    for (const label of torrent.labels ?? []) if (label) set.add(label);
  }
  return [...set].sort();
}

export function transmissionDemoLabelsSupported(admin?: AdminDemoConfig | null): boolean {
  return getState(admin).labelsSupported;
}

export function addTransmissionDemoLabel(name: string, admin?: AdminDemoConfig | null) {
  getState(admin).knownLabels.add(name);
}

export function removeTransmissionDemoLabel(name: string, admin?: AdminDemoConfig | null) {
  const state = getState(admin);
  state.knownLabels.delete(name);
  for (const torrent of state.torrents) {
    torrent.labels = (torrent.labels ?? []).filter((l) => l !== name);
  }
}

export function setTransmissionDemoTorrentLabel(
  id: number | string,
  label: string,
  admin?: AdminDemoConfig | null
) {
  const state = getState(admin);
  for (const torrent of idsOf({ ids: [id] }, state)) {
    torrent.labels = label ? [label] : [];
  }
  if (label) state.knownLabels.add(label);
}

export function handleTransmissionDemoRpc(
  body: TransmissionRpcRequest,
  admin?: AdminDemoConfig | null
): TransmissionRpcResponse {
  const method = body.method;
  const args = (body.arguments ?? {}) as Record<string, unknown>;
  const tag = body.tag;
  const state = getState(admin);
  tickDownloads(state);

  switch (method) {
    case "session-get":
      return ok({ ...state.session }, tag);
    case "session-set":
      Object.assign(state.session, args);
      return ok({}, tag);
    case "session-stats":
      return ok(
        {
          activeTorrentCount: state.torrents.filter((t) => t.status !== TR_STATUS.STOPPED).length,
          pausedTorrentCount: state.torrents.filter((t) => t.status === TR_STATUS.STOPPED).length,
          torrentCount: state.torrents.length,
        },
        tag
      );
    case "torrent-get": {
      const fields = args.fields as string[] | undefined;
      const torrents = idsOf(args, state).map((t) => {
        if (!fields?.length) return { ...t };
        const rec = t as unknown as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const field of fields) if (field in rec) out[field] = rec[field];
        return out;
      });
      return ok({ torrents }, tag);
    }
    case "torrent-start":
    case "torrent-start-now":
      for (const t of idsOf(args, state)) {
        t.status = t.isFinished || (t.percentDone ?? 0) >= 1 ? TR_STATUS.SEED : TR_STATUS.DOWNLOAD;
      }
      return ok({}, tag);
    case "torrent-stop":
      for (const t of idsOf(args, state)) {
        t.status = TR_STATUS.STOPPED;
        t.rateDownload = 0;
        t.rateUpload = 0;
      }
      return ok({}, tag);
    case "torrent-verify":
      for (const t of idsOf(args, state)) t.status = TR_STATUS.CHECK;
      return ok({}, tag);
    case "torrent-reannounce":
      return ok({}, tag);
    case "torrent-set":
      for (const torrent of idsOf(args, state)) applyTorrentSet(torrent, args);
      return ok({}, tag);
    case "torrent-set-location":
      for (const torrent of idsOf(args, state)) torrent.downloadDir = String(args.location ?? "");
      return ok({}, tag);
    case "torrent-remove": {
      const ids = new Set(idsOf(args, state).map((t) => t.id));
      state.torrents = state.torrents.filter((t) => !ids.has(t.id));
      return ok({}, tag);
    }
    case "torrent-add": {
      if (typeof args.filename === "string" && args.filename.startsWith("magnet:")) {
        const torrent = makeTorrent({
          id: state.nextId++,
          name: parseMagnetName(args.filename) || "Magnet download",
          size: 400 * 1024 ** 2,
          progress: 0,
          status: args.paused ? TR_STATUS.STOPPED : TR_STATUS.DOWNLOAD,
          down: 800 * 1024,
          up: 20 * 1024,
          tracker: "udp://tracker.opentrackr.org:1337/announce",
          queue: 0,
        });
        torrent.hashString = parseMagnetInfoHash(args.filename) || torrent.hashString;
        torrent.magnetLink = args.filename;
        if (typeof args["download-dir"] === "string") torrent.downloadDir = args["download-dir"];
        applyTorrentSet(torrent, args);
        state.torrents.unshift(torrent);
        return ok({ "torrent-added": { id: torrent.id, name: torrent.name, hashString: torrent.hashString } }, tag);
      }
      const path = typeof args.filename === "string" ? args.filename : "";
      const upload = path ? state.uploads[path] : undefined;
      const torrent = makeTorrent({
        id: state.nextId++,
        name: upload?.name || `upload-${state.nextId}`,
        size: upload?.size || 400 * 1024 ** 2,
        progress: 0,
        status: args.paused ? TR_STATUS.STOPPED : TR_STATUS.DOWNLOAD,
        down: 1.2 * 1024 ** 2,
        up: 40 * 1024,
        tracker: "udp://tracker.opentrackr.org:1337/announce",
        queue: 0,
      });
      if (upload?.infoHash) torrent.hashString = upload.infoHash;
      if (typeof args["download-dir"] === "string") torrent.downloadDir = args["download-dir"];
      applyTorrentSet(torrent, args);
      state.torrents.unshift(torrent);
      return ok({ "torrent-added": { id: torrent.id, name: torrent.name, hashString: torrent.hashString } }, tag);
    }
    default:
      return fail(`unknown method: ${method || "(none)"}`, tag);
  }
}

export { torrentKey };
