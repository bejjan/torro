import { clientCapabilities, type ClientKind } from "@/lib/backend/client-kind";
import { torrentIsPaused } from "./torrent-pause-resume";
import type { TorrentState } from "./types";

/** The pointer has to stay on one row this long, so the card stays shut while moving down the list. */
export const TORRENT_HOVER_CARD_OPEN_DELAY_MS = 500;
/** Grace period to travel from the row into the card, or back. */
export const TORRENT_HOVER_CARD_CLOSE_DELAY_MS = 150;

/** `<tr>` of a torrent row; `dataset.torrentId` holds the id. */
export const TORRENT_ROW_SELECTOR = "tr[data-torrent-id]";
/** The cell that opens the hover card (the name column). */
export const TORRENT_HOVER_CELL_ATTRIBUTE = "data-torrent-hover";
export const TORRENT_HOVER_CELL_SELECTOR = `td[${TORRENT_HOVER_CELL_ATTRIBUTE}]`;

/**
 * Own `data-slot`, not `popover-content`: a card that opened under a resting
 * pointer must not switch off the Find and Add shortcuts the way a dialog does.
 */
export const TORRENT_HOVER_CARD_SLOT = "torrent-hover-card";
export const TORRENT_HOVER_CARD_SELECTOR = `[data-slot="${TORRENT_HOVER_CARD_SLOT}"]`;
export const TORRENT_HOVER_CARD_OPEN_SELECTOR = `${TORRENT_HOVER_CARD_SELECTOR}[data-open]`;

/** Escape closes an open hover card before it clears the torrent selection. */
export function hasOpenTorrentHoverCard(root: ParentNode): boolean {
  return Boolean(root.querySelector(TORRENT_HOVER_CARD_OPEN_SELECTOR));
}

export type TorrentHoverAction = {
  id: "pause" | "resume" | "queue_top" | "queue_up" | "queue_down" | "queue_bottom" | "recheck";
  /** RPC the shell's `act` handler runs, the same ones the row context menu uses. */
  method: string;
  label: string;
};

export type TorrentHoverCardActions = {
  /** Pause for a running torrent, Resume for a paused one. */
  toggle: TorrentHoverAction;
  /** Empty when the client has no queue ordering. */
  queue: TorrentHoverAction[];
  recheck: TorrentHoverAction | null;
};

const QUEUE_ACTIONS: TorrentHoverAction[] = [
  { id: "queue_top", method: "core.queue_top", label: "Queue top" },
  { id: "queue_up", method: "core.queue_up", label: "Queue up" },
  { id: "queue_down", method: "core.queue_down", label: "Queue down" },
  { id: "queue_bottom", method: "core.queue_bottom", label: "Queue bottom" },
];

/**
 * Actions the hover card offers for one torrent on the connected client.
 * Remove is not listed: it is always offered and goes through the confirm dialog, not an RPC.
 */
export function torrentHoverCardActions(
  kind: ClientKind,
  state: TorrentState | null | undefined
): TorrentHoverCardActions {
  const caps = clientCapabilities(kind);
  return {
    toggle: torrentIsPaused(state)
      ? { id: "resume", method: "core.resume_torrent", label: "Resume" }
      : { id: "pause", method: "core.pause_torrent", label: "Pause" },
    queue: caps.queueOrdering ? QUEUE_ACTIONS : [],
    recheck: caps.forceRecheck
      ? { id: "recheck", method: "core.force_recheck", label: "Recheck" }
      : null,
  };
}

export type HoverAnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Where the card hangs: the row's vertical extent, at the pointer's x.
 * Anchoring under the pointer (not at the cell's left edge) means moving
 * straight down from a wide name cell lands in the card, not on the next row.
 */
export function hoverCardAnchorRect(
  cell: { left: number; right: number; top: number; bottom: number },
  pointerX: number,
  inset = 16
): HoverAnchorRect {
  const max = Math.max(cell.left, cell.right - inset);
  const x = Math.min(Math.max(pointerX - inset, cell.left), max);
  return {
    x,
    y: cell.top,
    width: 0,
    height: cell.bottom - cell.top,
    top: cell.top,
    right: x,
    bottom: cell.bottom,
    left: x,
  };
}
