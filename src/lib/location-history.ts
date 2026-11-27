/**
 * Download folders the user has used before, per daemon.
 * Pure: no storage and no clock in here. `deluge/location-history-store.ts`
 * persists it and picks the scope.
 */

export type LocationEntry = {
  path: string;
  /** How many adds or moves used this folder. */
  count: number;
  /** Epoch ms of the latest use. */
  lastUsed: number;
};

/** Scope (`kind|url`) → folders used on that daemon. */
export type LocationHistoryStore = Record<string, LocationEntry[]>;

/** Folders kept per daemon. */
export const LOCATION_HISTORY_STORED_LIMIT = 20;
/** Folders offered in the picker. */
export const LOCATION_HISTORY_SHOWN_LIMIT = 8;
/** Places held for the most-used folders, so a run of one-off paths cannot push them out. */
export const LOCATION_HISTORY_FREQUENT_SLOTS = 3;
/** A folder counts as frequently used from its second use. */
export const LOCATION_HISTORY_FREQUENT_MIN_COUNT = 2;
/** Daemons remembered; the one used longest ago is dropped first. */
export const LOCATION_HISTORY_SCOPE_LIMIT = 12;

const ROOT_PATH = /^(?:[\\/]+|[A-Za-z]:[\\/]*)$/;

/**
 * Trim, and drop trailing separators so `/data/tv/` and `/data/tv` are one
 * entry. Case is kept: paths are case-sensitive on most daemons.
 */
export function normalizeLocationPath(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (ROOT_PATH.test(trimmed)) {
    return /^[A-Za-z]:/.test(trimmed) ? `${trimmed.slice(0, 2)}${trimmed[2] ?? "\\"}` : trimmed[0]!;
  }
  return trimmed.replace(/[\\/]+$/, "");
}

/**
 * Paths are only meaningful on one daemon, so history is keyed by client kind
 * and connection URL. A blank URL is the server's default connection.
 */
export function locationHistoryScope(kind: string, url: string | null | undefined): string {
  const cleaned = (url ?? "").trim().replace(/\/+$/, "");
  return `${kind}|${cleaned || "default"}`;
}

function recentFirst(a: LocationEntry, b: LocationEntry): number {
  return b.lastUsed - a.lastUsed || b.count - a.count || a.path.localeCompare(b.path);
}

function mostUsedFirst(a: LocationEntry, b: LocationEntry): number {
  return b.count - a.count || recentFirst(a, b);
}

/**
 * Recent first, capped at `limit`. When something has to go, the most-used
 * folders keep a place even if they have not been used lately.
 */
export function rankLocations(
  entries: readonly LocationEntry[],
  options: { limit?: number; frequentSlots?: number } = {}
): LocationEntry[] {
  const limit = Math.max(0, options.limit ?? LOCATION_HISTORY_SHOWN_LIMIT);
  const frequentSlots = Math.min(limit, options.frequentSlots ?? LOCATION_HISTORY_FREQUENT_SLOTS);
  const recent = [...entries].sort(recentFirst);
  if (recent.length <= limit) return recent;
  const kept = new Set(
    recent
      .filter((entry) => entry.count >= LOCATION_HISTORY_FREQUENT_MIN_COUNT)
      .sort(mostUsedFirst)
      .slice(0, frequentSlots)
      .map((entry) => entry.path)
  );
  for (const entry of recent) {
    if (kept.size >= limit) break;
    kept.add(entry.path);
  }
  return recent.filter((entry) => kept.has(entry.path));
}

/** Count one use of `path` at `now`. Blank paths are ignored. */
export function recordLocation(
  entries: readonly LocationEntry[],
  path: string,
  now: number
): LocationEntry[] {
  const normalized = normalizeLocationPath(path);
  if (!normalized) return [...entries];
  const existing = entries.find((entry) => entry.path === normalized);
  const next: LocationEntry = {
    path: normalized,
    count: (existing?.count ?? 0) + 1,
    lastUsed: now,
  };
  return rankLocations(
    [next, ...entries.filter((entry) => entry.path !== normalized)],
    { limit: LOCATION_HISTORY_STORED_LIMIT }
  );
}

/** One add or move can cover many torrents; each distinct folder counts once. */
export function recordLocations(
  entries: readonly LocationEntry[],
  paths: readonly string[],
  now: number
): LocationEntry[] {
  const distinct = [...new Set(paths.map(normalizeLocationPath).filter(Boolean))];
  return distinct.reduce<LocationEntry[]>(
    (acc, path) => recordLocation(acc, path, now),
    [...entries]
  );
}

/** Folders one torrent's add options actually use: the download folder, and the move-completed folder when that is on. */
export function usedLocationPaths(options: {
  download_location?: string | null;
  move_completed?: boolean;
  move_completed_path?: string | null;
}): string[] {
  const paths = [options.download_location ?? ""];
  if (options.move_completed) paths.push(options.move_completed_path ?? "");
  return paths.map(normalizeLocationPath).filter(Boolean);
}

export function removeLocation(entries: readonly LocationEntry[], path: string): LocationEntry[] {
  const normalized = normalizeLocationPath(path);
  return entries.filter((entry) => entry.path !== normalized);
}

function sanitizeEntries(value: unknown): LocationEntry[] {
  if (!Array.isArray(value)) return [];
  const byPath = new Map<string, LocationEntry>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const path = typeof raw.path === "string" ? normalizeLocationPath(raw.path) : "";
    if (!path) continue;
    const count = Number.isFinite(raw.count) ? Math.max(1, Math.floor(raw.count as number)) : 1;
    const lastUsed = Number.isFinite(raw.lastUsed) ? (raw.lastUsed as number) : 0;
    const seen = byPath.get(path);
    byPath.set(
      path,
      seen
        ? { path, count: seen.count + count, lastUsed: Math.max(seen.lastUsed, lastUsed) }
        : { path, count, lastUsed }
    );
  }
  return rankLocations([...byPath.values()], { limit: LOCATION_HISTORY_STORED_LIMIT });
}

/** Tolerates anything in storage: bad JSON or bad entries read as no history. */
export function parseLocationHistory(raw: string | null | undefined): LocationHistoryStore {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const store: LocationHistoryStore = {};
  for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
    const entries = sanitizeEntries(value);
    if (entries.length) store[scope] = entries;
  }
  return store;
}

/** Replace one daemon's folders; empty scopes are dropped and old daemons pruned. */
export function withScopeLocations(
  store: LocationHistoryStore,
  scope: string,
  entries: readonly LocationEntry[]
): LocationHistoryStore {
  const next: LocationHistoryStore = { ...store };
  if (entries.length) next[scope] = [...entries];
  else delete next[scope];
  const scopes = Object.keys(next);
  if (scopes.length <= LOCATION_HISTORY_SCOPE_LIMIT) return next;
  const latestUse = (key: string) => Math.max(...next[key]!.map((entry) => entry.lastUsed));
  const keep = new Set(
    scopes
      .sort((a, b) => Number(b === scope) - Number(a === scope) || latestUse(b) - latestUse(a))
      .slice(0, LOCATION_HISTORY_SCOPE_LIMIT)
  );
  return Object.fromEntries(Object.entries(next).filter(([key]) => keep.has(key)));
}
