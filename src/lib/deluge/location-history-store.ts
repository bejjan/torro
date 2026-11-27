import { getStoredAdminDemo } from "@/lib/demo/admin-catalog";
import {
  locationHistoryScope,
  parseLocationHistory,
  recordLocations,
  removeLocation,
  withScopeLocations,
  type LocationEntry,
  type LocationHistoryStore,
} from "@/lib/location-history";
import { readLocalStorage, removeLocalStorage, storageKey, writeLocalStorage } from "@/lib/storage";
import {
  getStoredClientKind,
  getStoredQbittorrentUrl,
  getStoredTransmissionUrl,
  getStoredWebUrl,
} from "./client";

export const LOCATION_HISTORY_STORAGE_KEY = storageKey("location-history");

/** Client kind plus connection URL of the session in this browser. */
export function currentLocationScope(): string {
  const kind = getStoredClientKind();
  if (getStoredAdminDemo().enabled) return locationHistoryScope(kind, "demo");
  const url =
    kind === "transmission"
      ? getStoredTransmissionUrl()
      : kind === "qbittorrent"
        ? getStoredQbittorrentUrl()
        : getStoredWebUrl();
  return locationHistoryScope(kind, url);
}

function readStore(): LocationHistoryStore {
  return parseLocationHistory(readLocalStorage(LOCATION_HISTORY_STORAGE_KEY));
}

function writeScope(store: LocationHistoryStore, scope: string, entries: LocationEntry[]) {
  const next = withScopeLocations(store, scope, entries);
  if (Object.keys(next).length === 0) removeLocalStorage(LOCATION_HISTORY_STORAGE_KEY);
  else writeLocalStorage(LOCATION_HISTORY_STORAGE_KEY, JSON.stringify(next));
}

/** Folders used on the connected daemon. */
export function loadLocationHistory(): LocationEntry[] {
  return readStore()[currentLocationScope()] ?? [];
}

/** Call after an add or move succeeded. Returns the daemon's updated folders. */
export function rememberLocations(paths: readonly string[], now = Date.now()): LocationEntry[] {
  const store = readStore();
  const scope = currentLocationScope();
  const entries = recordLocations(store[scope] ?? [], paths, now);
  writeScope(store, scope, entries);
  return entries;
}

export function forgetLocation(path: string): LocationEntry[] {
  const store = readStore();
  const scope = currentLocationScope();
  const entries = removeLocation(store[scope] ?? [], path);
  writeScope(store, scope, entries);
  return entries;
}
