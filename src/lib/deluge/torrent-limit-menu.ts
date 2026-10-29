import type { ClientKind } from "@/lib/backend/client-kind";

/** Deluge web UI Options → D/L and U/L Speed Limit presets (KiB/s). */
export const TORRENT_SPEED_LIMIT_PRESETS_KIB = [5, 10, 30, 80, 300] as const;

/** Deluge web UI Options → Connection Limit presets. */
export const TORRENT_CONNECTION_LIMIT_PRESETS = [50, 100, 200, 300, 500] as const;

/** Deluge web UI Options → Upload Slot Limit presets. */
export const TORRENT_UPLOAD_SLOT_LIMIT_PRESETS = [0, 1, 2, 3, 5] as const;

export type TorrentLimitMenuCaps = {
  downloadSpeed: boolean;
  uploadSpeed: boolean;
  connections: boolean;
  uploadSlots: boolean;
  autoManaged: boolean;
};

/**
 * Per-torrent options that `core.set_torrent_options` actually applies
 * for the connected client. Speed limits and auto-managed work everywhere;
 * connection / upload-slot limits are Deluge (libtorrent) only.
 */
export function torrentLimitMenuCaps(kind: ClientKind): TorrentLimitMenuCaps {
  const deluge = kind === "deluge";
  return {
    downloadSpeed: true,
    uploadSpeed: true,
    connections: deluge,
    uploadSlots: deluge,
    autoManaged: true,
  };
}

export function torrentAutoManagedLabel(kind: ClientKind): string {
  if (kind === "transmission") return "Honor session limits";
  if (kind === "qbittorrent") return "Automatic Torrent Management";
  return "Auto Managed";
}

/** Radio value for a preset menu: `-1` unlimited, else a listed preset, else unset. */
export function torrentLimitRadioValue(
  current: number,
  presets: readonly number[]
): string {
  if (!Number.isFinite(current) || current < 0) return "-1";
  return presets.includes(current) ? String(current) : "";
}

export function torrentAutoManagedRadioValue(enabled: boolean): "on" | "off" {
  return enabled ? "on" : "off";
}

/** Fields the Limits context menu can mark as non-default. */
export type TorrentMenuLimits = {
  max_download_speed: number;
  max_upload_speed: number;
  max_connections: number;
  max_upload_slots: number;
};

export type TorrentLimitCustomMarks = {
  downloadSpeed: boolean;
  uploadSpeed: boolean;
  connections: boolean;
  uploadSlots: boolean;
  any: boolean;
};

/**
 * Unlimited is −1. Missing or non-finite values match that default so a row
 * does not light up before the status fields arrive. 0 is a real cap.
 */
export function torrentNumericLimitIsDefault(value: number | null | undefined): boolean {
  return value == null || !Number.isFinite(value) || value < 0;
}

/**
 * Marks for the Limits submenu. A field lights up when any torrent in the
 * menu's action set has a non-default value, and only when that field is
 * actually shown for the client. Auto Managed is a flag, not one of these caps.
 */
export function torrentLimitCustomMarks(
  torrents: readonly TorrentMenuLimits[],
  caps: TorrentLimitMenuCaps
): TorrentLimitCustomMarks {
  const marks: TorrentLimitCustomMarks = {
    downloadSpeed: false,
    uploadSpeed: false,
    connections: false,
    uploadSlots: false,
    any: false,
  };
  for (const torrent of torrents) {
    if (caps.downloadSpeed && !torrentNumericLimitIsDefault(torrent.max_download_speed)) {
      marks.downloadSpeed = true;
    }
    if (caps.uploadSpeed && !torrentNumericLimitIsDefault(torrent.max_upload_speed)) {
      marks.uploadSpeed = true;
    }
    if (caps.connections && !torrentNumericLimitIsDefault(torrent.max_connections)) {
      marks.connections = true;
    }
    if (caps.uploadSlots && !torrentNumericLimitIsDefault(torrent.max_upload_slots)) {
      marks.uploadSlots = true;
    }
  }
  marks.any = marks.downloadSpeed || marks.uploadSpeed || marks.connections || marks.uploadSlots;
  return marks;
}
