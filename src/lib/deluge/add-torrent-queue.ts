import { compactFilePriorities, type TorrentInfoDir } from "./files-tree";
import type { AddTorrentOptions } from "./types";

export const ADD_CONFIG_KEYS = [
  "add_paused",
  "download_location",
  "move_completed",
  "move_completed_path",
  "prioritize_first_last_pieces",
  "sequential_download",
  "max_download_speed_per_torrent",
  "max_upload_speed_per_torrent",
] as const;

export type AddTab = "file" | "magnet" | "url";
export type PendingAddStatus = "loading" | "ready" | "error";

export interface PendingAddForm {
  download_location: string;
  move_completed: boolean;
  move_completed_path: string;
  add_paused: boolean;
  sequential_download: boolean;
  prioritize_first_last_pieces: boolean;
  max_download_speed: string;
  max_upload_speed: string;
}

export interface PendingAddDefaults extends PendingAddForm {
  notifyOnComplete: boolean;
}

export interface PendingAdd {
  id: string;
  kind: AddTab;
  label: string;
  source: string;
  path: string;
  infoHash: string;
  tree: TorrentInfoDir | null;
  priorities: number[];
  options: PendingAddForm;
  notifyOnComplete: boolean;
  status: PendingAddStatus;
  error?: string;
  file?: File;
}

export type MixedField<T> = { mixed: true; value: T } | { mixed: false; value: T };

export function newPendingId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function torrentFilesFromList(files: FileList | null | Iterable<File>): File[] {
  const listed = files ? Array.from(files) : [];
  if (!listed.length) return [];
  return listed.filter(
    (item) =>
      item.name.toLowerCase().endsWith(".torrent") || item.type === "application/x-bittorrent"
  );
}

export function emptyDefaults(defaultPath: string, notifyOnComplete: boolean): PendingAddDefaults {
  return {
    download_location: defaultPath,
    move_completed: false,
    move_completed_path: "",
    add_paused: false,
    sequential_download: false,
    prioritize_first_last_pieces: false,
    max_download_speed: "-1",
    max_upload_speed: "-1",
    notifyOnComplete,
  };
}

export function defaultsFromConfig(
  cfg: Record<string, unknown>,
  defaultPath: string,
  notifyOnComplete: boolean
): PendingAddDefaults {
  const download =
    typeof cfg.download_location === "string" && cfg.download_location
      ? cfg.download_location
      : defaultPath;
  return {
    download_location: download || defaultPath,
    move_completed: Boolean(cfg.move_completed),
    move_completed_path: typeof cfg.move_completed_path === "string" ? cfg.move_completed_path : "",
    add_paused: Boolean(cfg.add_paused),
    sequential_download: Boolean(cfg.sequential_download),
    prioritize_first_last_pieces: Boolean(cfg.prioritize_first_last_pieces),
    max_download_speed:
      typeof cfg.max_download_speed_per_torrent === "number"
        ? String(cfg.max_download_speed_per_torrent)
        : "-1",
    max_upload_speed:
      typeof cfg.max_upload_speed_per_torrent === "number"
        ? String(cfg.max_upload_speed_per_torrent)
        : "-1",
    notifyOnComplete,
  };
}

export function formFromDefaults(defaults: PendingAddDefaults): PendingAddForm {
  return {
    download_location: defaults.download_location,
    move_completed: defaults.move_completed,
    move_completed_path: defaults.move_completed_path,
    add_paused: defaults.add_paused,
    sequential_download: defaults.sequential_download,
    prioritize_first_last_pieces: defaults.prioritize_first_last_pieces,
    max_download_speed: defaults.max_download_speed,
    max_upload_speed: defaults.max_upload_speed,
  };
}

export function createPendingAdd(
  kind: AddTab,
  label: string,
  defaults: PendingAddDefaults,
  extra?: Partial<PendingAdd>
): PendingAdd {
  return {
    id: newPendingId(),
    kind,
    label,
    source: extra?.source ?? label,
    path: extra?.path ?? "",
    infoHash: extra?.infoHash ?? "",
    tree: extra?.tree ?? null,
    priorities: extra?.priorities ?? [],
    options: extra?.options ?? formFromDefaults(defaults),
    notifyOnComplete: extra?.notifyOnComplete ?? defaults.notifyOnComplete,
    status: extra?.status ?? "loading",
    error: extra?.error,
    file: extra?.file,
  };
}

export function optionsFromPending(item: PendingAdd): AddTorrentOptions {
  const down = Number(item.options.max_download_speed);
  const up = Number(item.options.max_upload_speed);
  return {
    download_location: item.options.download_location,
    move_completed: item.options.move_completed,
    move_completed_path: item.options.move_completed ? item.options.move_completed_path : undefined,
    add_paused: item.options.add_paused,
    sequential_download: item.options.sequential_download,
    prioritize_first_last_pieces: item.options.prioritize_first_last_pieces,
    max_download_speed: Number.isFinite(down) ? down : -1,
    max_upload_speed: Number.isFinite(up) ? up : -1,
    file_priorities: compactFilePriorities(item.priorities),
  };
}

export function normalizeInfoHash(hash: string): string {
  return hash.trim().toLowerCase();
}

export function findDuplicate(
  queue: readonly PendingAdd[],
  hash: string,
  exceptId?: string
): PendingAdd | undefined {
  const needle = normalizeInfoHash(hash);
  if (!needle) return undefined;
  return queue.find(
    (item) => item.id !== exceptId && item.infoHash && normalizeInfoHash(item.infoHash) === needle
  );
}

export const ALREADY_IN_SESSION_ERROR = "Already in the session";

/** Deluge does not answer `web.add_torrents` for a hash that is already loaded. */
export function sessionHasInfoHash(
  torrentIds: Iterable<string> | null | undefined,
  hash: string
): boolean {
  const needle = normalizeInfoHash(hash);
  if (!needle || !torrentIds) return false;
  for (const id of torrentIds) {
    if (normalizeInfoHash(id) === needle) return true;
  }
  return false;
}

export function splitAlreadyInSession(
  items: readonly PendingAdd[],
  torrentIds: Iterable<string> | null | undefined
): { fresh: PendingAdd[]; existing: PendingAdd[] } {
  const fresh: PendingAdd[] = [];
  const existing: PendingAdd[] = [];
  for (const item of items) {
    if (item.infoHash && sessionHasInfoHash(torrentIds, item.infoHash)) existing.push(item);
    else fresh.push(item);
  }
  return { fresh, existing };
}

export function alreadyInSessionMessage(count: number): string {
  if (count <= 1) return "This torrent is already in the session";
  return `${count} torrents are already in the session`;
}

export function parseMagnetLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function sourceHint(item: PendingAdd): string {
  if (item.kind === "magnet") return "Magnet";
  if (item.kind === "file") return "Torrent file";
  const candidate = item.source.startsWith("http") ? item.source : item.path;
  try {
    const host = new URL(candidate).hostname;
    return host || "URL";
  } catch {
    return "URL";
  }
}

export function mixedField<T>(
  items: readonly PendingAdd[],
  get: (item: PendingAdd) => T
): MixedField<T> {
  const first = get(items[0]!);
  for (let i = 1; i < items.length; i++) {
    if (get(items[i]!) !== first) return { mixed: true, value: first };
  }
  return { mixed: false, value: first };
}

export function canSubmitQueue(queue: readonly PendingAdd[], busy: boolean): boolean {
  if (busy) return false;
  if (queue.some((item) => item.status === "loading")) return false;
  return queue.some((item) => item.status === "ready" && Boolean(item.path));
}

export function readyAdds(queue: readonly PendingAdd[]): PendingAdd[] {
  return queue.filter((item) => item.status === "ready" && Boolean(item.path));
}

export function addSuccessToast(count: number): string {
  return count === 1 ? "Torrent added" : `${count} torrents added`;
}

export function addSubmitBatches(items: readonly PendingAdd[]): {
  fileNotify: PendingAdd[];
  fileSilent: PendingAdd[];
  magnets: PendingAdd[];
} {
  const filesAndUrls = items.filter((item) => item.kind !== "magnet");
  return {
    fileNotify: filesAndUrls.filter((item) => item.notifyOnComplete),
    fileSilent: filesAndUrls.filter((item) => !item.notifyOnComplete),
    magnets: items.filter((item) => item.kind === "magnet"),
  };
}

export function remainingAfterPartialAdd(
  queue: readonly PendingAdd[],
  succeededIds: ReadonlySet<string>
): PendingAdd[] {
  return queue.filter((item) => !succeededIds.has(item.id));
}

export function addPartialFailureMessage(added: number, cause: string): string {
  if (added <= 0) return cause;
  const prefix = added === 1 ? "1 torrent was added" : `${added} torrents were added`;
  return `${prefix}. The rest failed: ${cause}`;
}

export function addButtonLabel(count: number, busy: boolean): string {
  if (busy) return "Adding…";
  if (count <= 1) return "Add";
  return `Add ${count} torrents`;
}

export function patchPendingAdds(
  queue: readonly PendingAdd[],
  ids: ReadonlySet<string>,
  patch: (item: PendingAdd) => PendingAdd
): PendingAdd[] {
  let changed = false;
  const next = queue.map((item) => {
    if (!ids.has(item.id)) return item;
    changed = true;
    return patch(item);
  });
  return changed ? next : [...queue];
}

export function removePendingAdds(
  queue: readonly PendingAdd[],
  ids: ReadonlySet<string>
): PendingAdd[] {
  return queue.filter((item) => !ids.has(item.id));
}

export function selectionAfterRemove(
  queue: readonly PendingAdd[],
  selected: ReadonlySet<string>,
  removed: ReadonlySet<string>
): Set<string> {
  const kept = [...selected].filter((id) => !removed.has(id));
  if (kept.length) return new Set(kept);
  const remaining = queue.filter((item) => !removed.has(item.id));
  if (!remaining.length) return new Set();
  const firstRemoved = queue.findIndex((item) => removed.has(item.id));
  const neighbor = remaining[Math.min(Math.max(firstRemoved, 0), remaining.length - 1)];
  return neighbor ? new Set([neighbor.id]) : new Set();
}

export function urlBasename(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return name || parsed.hostname || trimmed;
  } catch {
    return trimmed.split("/").filter(Boolean).pop() || trimmed;
  }
}
