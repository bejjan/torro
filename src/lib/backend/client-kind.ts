import { readLocalStorage, removeLocalStorage, storageKey, writeLocalStorage } from "@/lib/storage";

export const CLIENT_KINDS = ["deluge", "transmission", "qbittorrent"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const CLIENT_KIND_STORAGE_KEY = storageKey("client-kind");
export const TRANSMISSION_USERNAME_STORAGE_KEY = storageKey("transmission-username");
export const TRANSMISSION_PASSWORD_SESSION_KEY = storageKey("transmission-password");
export const QBITTORRENT_USERNAME_STORAGE_KEY = storageKey("qbittorrent-username");
export const QBITTORRENT_PASSWORD_SESSION_KEY = storageKey("qbittorrent-password");

export function isClientKind(value: unknown): value is ClientKind {
  return value === "deluge" || value === "transmission" || value === "qbittorrent";
}

export function parseClientKind(raw: string | null | undefined): ClientKind {
  if (raw === "transmission" || raw === "qbittorrent") return raw;
  return "deluge";
}

export function getStoredClientKind(): ClientKind {
  return parseClientKind(readLocalStorage(CLIENT_KIND_STORAGE_KEY));
}

export function setStoredClientKind(kind: ClientKind) {
  writeLocalStorage(CLIENT_KIND_STORAGE_KEY, kind);
}

export function getStoredTransmissionUsername(): string {
  return readLocalStorage(TRANSMISSION_USERNAME_STORAGE_KEY) ?? "";
}

export function setStoredTransmissionUsername(username: string) {
  const trimmed = username.trim();
  if (!trimmed) {
    removeLocalStorage(TRANSMISSION_USERNAME_STORAGE_KEY);
    return;
  }
  writeLocalStorage(TRANSMISSION_USERNAME_STORAGE_KEY, trimmed);
}

export function getSessionTransmissionPassword(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(TRANSMISSION_PASSWORD_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setSessionTransmissionPassword(password: string) {
  if (typeof window === "undefined") return;
  try {
    if (!password) sessionStorage.removeItem(TRANSMISSION_PASSWORD_SESSION_KEY);
    else sessionStorage.setItem(TRANSMISSION_PASSWORD_SESSION_KEY, password);
  } catch {
    /* quota / private mode */
  }
}

export function getStoredQbittorrentUsername(): string {
  return readLocalStorage(QBITTORRENT_USERNAME_STORAGE_KEY) ?? "";
}

export function setStoredQbittorrentUsername(username: string) {
  const trimmed = username.trim();
  if (!trimmed) {
    removeLocalStorage(QBITTORRENT_USERNAME_STORAGE_KEY);
    return;
  }
  writeLocalStorage(QBITTORRENT_USERNAME_STORAGE_KEY, trimmed);
}

export function getSessionQbittorrentPassword(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(QBITTORRENT_PASSWORD_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setSessionQbittorrentPassword(password: string) {
  if (typeof window === "undefined") return;
  try {
    if (!password) sessionStorage.removeItem(QBITTORRENT_PASSWORD_SESSION_KEY);
    else sessionStorage.setItem(QBITTORRENT_PASSWORD_SESSION_KEY, password);
  } catch {
    /* quota / private mode */
  }
}

export function clientCapabilities(kind: ClientKind) {
  const deluge = kind === "deluge";
  const qbittorrent = kind === "qbittorrent";
  return {
    kind,
    connectionManager: deluge,
    plugins: deluge,
    delugePreferences: deluge,
    labelPluginHint: deluge,
    sequentialDownload: deluge || qbittorrent,
    prioritizeFirstLast: deluge || qbittorrent,
    superSeeding: deluge || qbittorrent,
    dhtNodes: deluge || qbittorrent,
    libtorrentVersion: deluge || qbittorrent,
    hostsPhase: deluge,
    // Every adapter implements core.queue_* and core.force_recheck today.
    // Quick-action surfaces (the row hover card) gate on these, so a client
    // without them only has to say so here.
    queueOrdering: true,
    forceRecheck: true,
  };
}

export function clientDisplayName(kind: ClientKind): string {
  if (kind === "transmission") return "Transmission";
  if (kind === "qbittorrent") return "qBittorrent";
  return "Deluge";
}

export function clientUsesUsername(kind: ClientKind): boolean {
  return kind === "transmission" || kind === "qbittorrent";
}
