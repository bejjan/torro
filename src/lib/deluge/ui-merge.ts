import { GRID_KEYS } from "@/lib/deluge/keys";
import { normalizeTorrentMap, normalizeTorrentStatus } from "@/lib/deluge/torrent-name";
import type { SessionStats, TorrentStatus, UiUpdate } from "@/lib/deluge/types";

/** Compare the fields the torrent grid actually renders / sorts on. */
export function torrentStatusEqual(a: TorrentStatus, b: TorrentStatus): boolean {
  if (a === b) return true;
  for (const key of GRID_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Reuse previous torrent object identities when `web.update_ui` returns the same
 * field values. Rows that did not change can then skip React work.
 */
export function reuseTorrentMap(
  prev: Record<string, TorrentStatus> | null | undefined,
  next: Record<string, TorrentStatus> | null
): Record<string, TorrentStatus> | null {
  // `torrents: null` is a disconnected / partial frame — do not empty the table.
  if (!next) return prev ?? next;
  if (!prev) return normalizeTorrentMap(next);

  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  let changed = prevKeys.length !== nextKeys.length;
  const out: Record<string, TorrentStatus> = {};

  for (const id of nextKeys) {
    const incoming = normalizeTorrentStatus(next[id]);
    const existing = prev[id];
    const reused =
      existing && torrentStatusEqual(existing, incoming) ? existing : incoming;
    out[id] = reused;
    if (reused !== existing) changed = true;
  }

  if (!changed) return prev;
  return out;
}

/**
 * A poll with `stats: null` is a missed frame (in-flight, disconnected, or
 * partial update) — keep the previous snapshot instead of wiping rates to 0.
 */
export function mergeSessionStats(
  prev: SessionStats | null | undefined,
  next: SessionStats | null | undefined
): SessionStats | null {
  if (!next) return prev ?? null;
  if (prev && statsEqual(prev, next)) return prev;
  return next;
}

function mergeFilters(
  prev: UiUpdate["filters"] | null | undefined,
  next: UiUpdate["filters"] | null | undefined
): UiUpdate["filters"] {
  if (!next) return prev ?? null;
  return next;
}

function statsEqual(a: SessionStats, b: SessionStats): boolean {
  if (a === b) return true;
  return (
    a.max_download === b.max_download &&
    a.max_upload === b.max_upload &&
    a.max_num_connections === b.max_num_connections &&
    a.num_connections === b.num_connections &&
    a.upload_rate === b.upload_rate &&
    a.download_rate === b.download_rate &&
    a.download_protocol_rate === b.download_protocol_rate &&
    a.upload_protocol_rate === b.upload_protocol_rate &&
    a.dht_nodes === b.dht_nodes &&
    a.has_incoming_connections === b.has_incoming_connections &&
    a.free_space === b.free_space &&
    a.external_ip === b.external_ip &&
    a.payload_download === b.payload_download &&
    a.payload_upload === b.payload_upload
  );
}

/**
 * Merge a poll result into the previous UI snapshot, preserving object identity
 * for unchanged torrents / stats so the table does not remount or rebuild rows.
 */
export function mergeUiUpdate(prev: UiUpdate | null, next: UiUpdate): UiUpdate {
  if (next.partial && prev?.torrents) {
    const torrents = applyTorrentPatch(prev.torrents, next.torrents, next.removed);
    const stats = mergeSessionStats(prev.stats, next.stats);
    const filters = mergeFilters(prev.filters, next.filters);
    if (
      prev.connected === next.connected &&
      torrents === prev.torrents &&
      filters === prev.filters &&
      stats === prev.stats
    ) {
      return prev;
    }
    return { connected: next.connected, torrents, filters, stats };
  }

  // A newly connected session must not keep torrents from the previous daemon.
  const freshSession = !prev || (!prev.connected && next.connected);
  if (freshSession) {
    const torrents = reuseTorrentMap(null, next.torrents);
    return torrents === next.torrents ? next : { ...next, torrents };
  }

  const torrents = reuseTorrentMap(prev.torrents, next.torrents);
  const stats = mergeSessionStats(prev.stats, next.stats);
  const filters = mergeFilters(prev.filters, next.filters);

  if (
    prev.connected === next.connected &&
    torrents === prev.torrents &&
    filters === prev.filters &&
    stats === prev.stats
  ) {
    return prev;
  }

  return { connected: next.connected, torrents, filters, stats };
}

function applyTorrentPatch(
  prev: Record<string, TorrentStatus>,
  changed: Record<string, TorrentStatus> | null,
  removed: readonly string[] | undefined
): Record<string, TorrentStatus> {
  let changedAny = false;
  const out: Record<string, TorrentStatus> = { ...prev };
  for (const id of removed ?? []) {
    if (id in out) {
      delete out[id];
      changedAny = true;
    }
  }
  for (const [id, fields] of Object.entries(changed ?? {})) {
    const base = out[id];
    const merged = normalizeTorrentStatus({ ...(base ?? {}), ...fields });
    if (base && torrentStatusEqual(base, merged)) {
      out[id] = base;
      continue;
    }
    out[id] = merged;
    changedAny = true;
  }
  return changedAny ? out : prev;
}

/**
 * Overlay a GRID_KEYS poll onto a richer details snapshot.
 * `web.update_ui` omits option/status keys; replacing the object would drop
 * `max_connections` / `max_upload_slots` (and pieces/comment) and remount the
 * Options form as unset.
 */
export function overlayTorrentStatus(
  prev: TorrentStatus | null | undefined,
  next: TorrentStatus | null | undefined,
  sameTorrent: boolean
): TorrentStatus | null {
  if (!next) return sameTorrent ? (prev ?? null) : null;
  const incoming = normalizeTorrentStatus(next);
  if (!prev || !sameTorrent) return incoming;
  if (prev === incoming) return prev;
  return { ...prev, ...incoming };
}
