import {
  getSessionQbittorrentPassword,
  getSessionTransmissionPassword,
  getStoredClientKind,
  getStoredQbittorrentUsername,
  getStoredTransmissionUsername,
  setSessionQbittorrentPassword,
  setSessionTransmissionPassword,
} from "@/lib/backend/client-kind";
import {
  ADMIN_DEMO_HEADER,
  encodeAdminDemoHeader,
  getStoredAdminDemo,
} from "@/lib/demo/admin-catalog";
import { readLocalStorage, removeLocalStorage, storageKey, writeLocalStorage } from "@/lib/storage";
import { normalizeQbittorrentWebUrl } from "@/lib/qbittorrent/url";
import { normalizeTransmissionRpcUrl } from "@/lib/transmission/url";
import { formatUnknownMethodMessage } from "./plugins";
import type { JsonRpcResponse } from "./types";
import { normalizeDelugeWebUrl } from "./web-url";

export {
  getStoredClientKind,
  setStoredClientKind,
  getStoredTransmissionUsername,
  setStoredTransmissionUsername,
  getStoredQbittorrentUsername,
  setStoredQbittorrentUsername,
  clientCapabilities,
  clientDisplayName,
  clientUsesUsername,
} from "@/lib/backend/client-kind";
export type { ClientKind } from "@/lib/backend/client-kind";

export const STORAGE_URL = storageKey("web-url");
export const STORAGE_TLS = storageKey("tls-insecure");
export const STORAGE_TRANSMISSION_URL = storageKey("transmission-url");
export const STORAGE_QBITTORRENT_URL = storageKey("qbittorrent-url");

export function getStoredWebUrl(): string {
  return readLocalStorage(STORAGE_URL) ?? "";
}

export function setStoredWebUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    removeLocalStorage(STORAGE_URL);
    return;
  }
  try {
    writeLocalStorage(STORAGE_URL, normalizeDelugeWebUrl(trimmed));
  } catch {
    writeLocalStorage(STORAGE_URL, trimmed.replace(/\/$/, ""));
  }
}

export function getStoredTransmissionUrl(): string {
  return readLocalStorage(STORAGE_TRANSMISSION_URL) ?? "";
}

export function setStoredTransmissionUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    removeLocalStorage(STORAGE_TRANSMISSION_URL);
    return;
  }
  try {
    writeLocalStorage(STORAGE_TRANSMISSION_URL, normalizeTransmissionRpcUrl(trimmed));
  } catch {
    writeLocalStorage(STORAGE_TRANSMISSION_URL, trimmed.replace(/\/$/, ""));
  }
}

export function getStoredQbittorrentUrl(): string {
  return readLocalStorage(STORAGE_QBITTORRENT_URL) ?? "";
}

export function setStoredQbittorrentUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    removeLocalStorage(STORAGE_QBITTORRENT_URL);
    return;
  }
  try {
    writeLocalStorage(STORAGE_QBITTORRENT_URL, normalizeQbittorrentWebUrl(trimmed));
  } catch {
    writeLocalStorage(STORAGE_QBITTORRENT_URL, trimmed.replace(/\/$/, ""));
  }
}

export function getStoredTlsInsecure(): boolean {
  return readLocalStorage(STORAGE_TLS) === "1";
}

export function setStoredTlsInsecure(enabled: boolean) {
  if (enabled) writeLocalStorage(STORAGE_TLS, "1");
  else removeLocalStorage(STORAGE_TLS);
}

let requestId = 1;

export class DelugeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelugeError";
  }
}

function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "X-Torrent-Client": getStoredClientKind() };
  const admin = getStoredAdminDemo();
  if (admin.enabled) {
    headers[ADMIN_DEMO_HEADER] = encodeAdminDemoHeader(admin);
    return headers;
  }
  if (getStoredClientKind() === "transmission") {
    const url = getStoredTransmissionUrl();
    if (url) headers["X-Transmission-URL"] = url;
    const username = getStoredTransmissionUsername();
    if (username) headers["X-Transmission-Username"] = username;
    const password = getSessionTransmissionPassword();
    if (password) headers["X-Transmission-Password"] = password;
    if (getStoredTlsInsecure()) {
      headers["X-Transmission-TLS-Insecure"] = "1";
      headers["X-Deluge-TLS-Insecure"] = "1";
    }
    return headers;
  }
  if (getStoredClientKind() === "qbittorrent") {
    const url = getStoredQbittorrentUrl();
    if (url) headers["X-QBittorrent-URL"] = url;
    const username = getStoredQbittorrentUsername();
    if (username) headers["X-QBittorrent-Username"] = username;
    const password = getSessionQbittorrentPassword();
    if (password) headers["X-QBittorrent-Password"] = password;
    if (getStoredTlsInsecure()) {
      headers["X-QBittorrent-TLS-Insecure"] = "1";
      headers["X-Deluge-TLS-Insecure"] = "1";
    }
    return headers;
  }
  const webUrl = getStoredWebUrl();
  if (webUrl) headers["X-Deluge-URL"] = webUrl;
  if (getStoredTlsInsecure()) headers["X-Deluge-TLS-Insecure"] = "1";
  return headers;
}

function messageFromBody(text: string): string | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as {
      error?: { message?: string } | string | null;
      message?: string;
      result?: string;
    };
    if (typeof data.error === "string" && data.error.trim()) return data.error.trim();
    if (data.error && typeof data.error === "object" && data.error.message?.trim()) {
      return data.error.message.trim();
    }
    if (typeof data.message === "string" && data.message.trim()) return data.message.trim();
    if (typeof data.result === "string" && data.result.trim() && data.result !== "success") {
      return data.result.trim();
    }
  } catch {
    /* not JSON */
  }
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<") || trimmed.length > 400) return null;
  return trimmed;
}

function unreachableMessage(status: number): string {
  if (getStoredClientKind() === "transmission") {
    return status === 401
      ? "Incorrect username or password for Transmission RPC."
      : "Cannot reach Transmission. Check the RPC URL and that transmission-daemon is running.";
  }
  if (getStoredClientKind() === "qbittorrent") {
    return status === 401 || status === 403
      ? "Incorrect username or password for qBittorrent."
      : "Cannot reach qBittorrent. Check the Web UI URL and that qBittorrent is running.";
  }
  return "Cannot reach Deluge Web. Check the URL and that deluge-web is running.";
}

export async function rpc<T = unknown>(
  method: string,
  params: unknown[] = [],
  options?: { uiRevision?: number | null }
): Promise<T> {
  const id = requestId++;
  if (method === "auth.login" && getStoredClientKind() === "transmission") {
    setSessionTransmissionPassword(typeof params[0] === "string" ? params[0] : "");
  }
  if (method === "auth.login" && getStoredClientKind() === "qbittorrent") {
    setSessionQbittorrentPassword(typeof params[0] === "string" ? params[0] : "");
  }

  const res = await fetch("/api/json", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.uiRevision != null ? { "x-torro-ui-rev": String(options.uiRevision) } : {}),
      ...proxyHeaders(),
    },
    body: JSON.stringify({ method, params, id }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new DelugeError(
      messageFromBody(text) ||
        (res.status === 401 || res.status === 502 || res.status === 503
          ? unreachableMessage(res.status)
          : `HTTP ${res.status}`)
    );
  }

  let data: JsonRpcResponse<T>;
  try {
    data = JSON.parse(text) as JsonRpcResponse<T>;
  } catch {
    throw new DelugeError(
      getStoredClientKind() === "transmission"
        ? "Transmission did not return JSON. Check that the URL points at the RPC endpoint (http://host:9091/transmission/rpc)."
        : getStoredClientKind() === "qbittorrent"
          ? "qBittorrent did not return JSON. Check that the URL points at the Web UI (http://host:8080)."
          : "Deluge Web did not return JSON. Check that the URL points at deluge-web (http://host:8112)."
    );
  }
  if (data.error) {
    throw new DelugeError(formatUnknownMethodMessage(method, data.error.message || "RPC error"));
  }
  if (method === "auth.login" && data.result !== true) {
    setSessionTransmissionPassword("");
    setSessionQbittorrentPassword("");
  }
  if (method === "auth.delete_session") {
    setSessionTransmissionPassword("");
    setSessionQbittorrentPassword("");
  }
  return data.result as T;
}

export async function uploadTorrent(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name || "upload.torrent");
  const kind = getStoredClientKind();
  const res = await fetch(kind === "transmission" ? "/api/transmission/upload" : "/api/upload", {
    method: "POST",
    credentials: "include",
    headers: proxyHeaders(),
    body: form,
  });
  const text = await res.text().catch(() => "");
  let data: { success?: boolean; files?: string[]; error?: string } | null = null;
  try {
    data = JSON.parse(text) as { success?: boolean; files?: string[]; error?: string };
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new DelugeError(data?.error || messageFromBody(text) || `Failed to upload torrent (HTTP ${res.status}).`);
  }
  if (!data?.success || !data.files?.[0]) {
    throw new DelugeError(data?.error || "Failed to upload torrent.");
  }
  return data.files[0];
}
