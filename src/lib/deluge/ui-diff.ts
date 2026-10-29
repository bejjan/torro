import { createHash } from "node:crypto";

export interface TorrentFieldPatch {
  changed: Record<string, Record<string, unknown>>;
  removed: string[];
}

interface UiSnapshot {
  revision: number;
  torrents: Record<string, Record<string, unknown>>;
}

const snapshots = new Map<string, UiSnapshot>();
const MAX_SNAPSHOTS = 32;

export function resetUiUpdateSnapshots() {
  snapshots.clear();
}

export function uiSnapshotKey(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Fields that differ, or the whole torrent when it is new. */
export function diffTorrentMaps(
  prev: Record<string, Record<string, unknown>> | null | undefined,
  next: Record<string, Record<string, unknown>>
): TorrentFieldPatch {
  const changed: Record<string, Record<string, unknown>> = {};
  const removed: string[] = [];
  for (const [id, row] of Object.entries(next)) {
    const before = prev?.[id];
    if (!before) {
      changed[id] = row;
      continue;
    }
    const fields: Record<string, unknown> = {};
    let any = false;
    for (const key of Object.keys(row)) {
      if (!sameValue(before[key], row[key])) {
        fields[key] = row[key];
        any = true;
      }
    }
    if (any) changed[id] = fields;
  }
  if (prev) {
    for (const id of Object.keys(prev)) {
      if (!(id in next)) removed.push(id);
    }
  }
  return { changed, removed };
}

export interface UiFrame {
  connected: boolean;
  torrents: Record<string, Record<string, unknown>> | null;
  partial?: boolean;
  removed?: string[];
  revision?: number;
}

/**
 * Remember the last full torrent map for this session and return only the
 * fields that changed when the client still holds that revision.
 */
export function patchUiFrame<T extends UiFrame>(
  key: string,
  requestedRevision: number | null,
  frame: T
): T & { partial: boolean; removed: string[]; revision: number } {
  if (!frame.connected || !frame.torrents) {
    snapshots.delete(key);
    return { ...frame, partial: false, removed: [], revision: 0 };
  }

  const snap = snapshots.get(key);
  const hit = requestedRevision != null && snap?.revision === requestedRevision;
  if (hit && snap) {
    const { changed, removed } = diffTorrentMaps(snap.torrents, frame.torrents);
    const revision = snap.revision + 1;
    snapshots.delete(key);
    snapshots.set(key, { revision, torrents: frame.torrents });
    return {
      ...frame,
      torrents: changed,
      removed,
      partial: true,
      revision,
    };
  }

  const revision = (snap?.revision ?? 0) + 1;
  snapshots.delete(key);
  snapshots.set(key, { revision, torrents: frame.torrents });
  while (snapshots.size > MAX_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value;
    if (oldest == null) break;
    snapshots.delete(oldest);
  }
  return { ...frame, partial: false, removed: [], revision };
}
