"use client";

import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import type { ClientKind } from "@/lib/deluge/client";
import { formatBytes, formatProgress } from "@/lib/deluge/format";
import {
  TORRENT_HOVER_CARD_CLOSE_DELAY_MS,
  TORRENT_HOVER_CARD_OPEN_DELAY_MS,
  TORRENT_HOVER_CARD_SELECTOR,
  TORRENT_HOVER_CARD_SLOT,
  TORRENT_HOVER_CELL_SELECTOR,
  TORRENT_ROW_SELECTOR,
  hoverCardAnchorRect,
  torrentHoverCardActions,
  type HoverAnchorRect,
  type TorrentHoverAction,
} from "@/lib/deluge/torrent-hover-card";
import type { TorrentStatus } from "@/lib/deluge/types";

type HoverTarget = {
  id: string;
  anchor: { getBoundingClientRect: () => HoverAnchorRect };
};

/** The two row handlers the card needs; the table passes its `handlersRef`. */
type HoverCardHandlers = {
  act: (method: string, torrentIds?: string[]) => void;
  remove: (torrentIds: string[]) => void;
};

/**
 * One card for the whole list, not one per row. Rows only carry data
 * attributes; hover is tracked with delegated listeners on the scroll
 * container, and the state lives here, so opening or closing the card never
 * re-renders the table and costs nothing while scrolling.
 *
 * The surface is a Popover (a labelled dialog), because a tooltip cannot hold
 * buttons. Mouse only: touch and pen pointers never start the open timer.
 *
 * Kept deliberately small: the name, one muted status line and icon-only
 * buttons. Queue ordering stays in the row context menu.
 */
export function TorrentHoverCard({
  scrollRef,
  torrentById,
  clientKind,
  handlersRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  torrentById: ReadonlyMap<string, TorrentStatus>;
  clientKind: ClientKind;
  handlersRef: { current: HoverCardHandlers };
}) {
  const [target, setTarget] = useState<HoverTarget | null>(null);
  const [open, setOpen] = useState(false);
  const intent = useRef({
    openTimer: 0,
    closeTimer: 0,
    /** Row the open timer is running for. */
    pendingId: null as string | null,
    /** Row the card is open for. */
    openId: null as string | null,
    /** Row that was just clicked or dismissed: stays shut until the pointer leaves it. */
    suppressedId: null as string | null,
    pointerX: 0,
    /** The card is closing to open the remove dialog, which takes focus itself. */
    leaveFocus: false,
  });

  const cancelOpen = useCallback(() => {
    const state = intent.current;
    window.clearTimeout(state.openTimer);
    state.openTimer = 0;
    state.pendingId = null;
  }, []);

  const cancelClose = useCallback(() => {
    const state = intent.current;
    window.clearTimeout(state.closeTimer);
    state.closeTimer = 0;
  }, []);

  const hide = useCallback(() => {
    cancelOpen();
    cancelClose();
    intent.current.openId = null;
    setOpen(false);
  }, [cancelClose, cancelOpen]);

  const scheduleClose = useCallback(() => {
    const state = intent.current;
    if (state.openId == null || state.closeTimer) return;
    state.closeTimer = window.setTimeout(() => {
      state.closeTimer = 0;
      hide();
    }, TORRENT_HOVER_CARD_CLOSE_DELAY_MS);
  }, [hide]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const state = intent.current;

    const hoverCellAt = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return null;
      const cell = eventTarget.closest<HTMLElement>(TORRENT_HOVER_CELL_SELECTOR);
      const id = cell?.closest<HTMLElement>(TORRENT_ROW_SELECTOR)?.dataset.torrentId;
      return cell && id ? { cell, id } : null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      state.pointerX = event.clientX;
      // A pressed button is a click, a text selection or a column drag, not a hover.
      if (event.buttons !== 0) {
        cancelOpen();
        return;
      }
      const hit = hoverCellAt(event.target);
      if (!hit) {
        cancelOpen();
        state.suppressedId = null;
        scheduleClose();
        return;
      }
      if (state.suppressedId !== hit.id) state.suppressedId = null;
      if (hit.id === state.openId) {
        cancelOpen();
        cancelClose();
        return;
      }
      scheduleClose();
      if (hit.id === state.suppressedId || hit.id === state.pendingId) return;
      cancelOpen();
      state.pendingId = hit.id;
      state.openTimer = window.setTimeout(() => {
        state.openTimer = 0;
        state.pendingId = null;
        // The row can scroll out of the virtual window while the timer runs.
        if (!hit.cell.isConnected) return;
        const rect = hoverCardAnchorRect(hit.cell.getBoundingClientRect(), state.pointerX);
        cancelClose();
        state.leaveFocus = false;
        state.openId = hit.id;
        setTarget({ id: hit.id, anchor: { getBoundingClientRect: () => rect } });
        setOpen(true);
      }, TORRENT_HOVER_CARD_OPEN_DELAY_MS);
    };

    const onPointerLeave = (event: PointerEvent) => {
      cancelOpen();
      // Into the card: stay open. React delivers the card's own pointerenter
      // before this native event, so that handler cannot cancel a close armed here.
      const into = event.relatedTarget;
      if (into instanceof Element && into.closest(TORRENT_HOVER_CARD_SELECTOR)) return;
      state.suppressedId = null;
      scheduleClose();
    };

    // Selecting, double-clicking or right-clicking a row is not asking for the card.
    const onPointerDown = (event: PointerEvent) => {
      state.suppressedId = hoverCellAt(event.target)?.id ?? null;
      hide();
    };

    // Typing in the list (arrows, Escape) dismisses the card for the row under the pointer.
    const onKeyDown = () => {
      if (state.openId != null) state.suppressedId = state.openId;
      hide();
    };

    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("pointerdown", onPointerDown);
    // The anchor is a fixed rect, so the card must not outlive a scroll.
    root.addEventListener("scroll", hide, { passive: true });
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("scroll", hide);
      root.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(state.openTimer);
      window.clearTimeout(state.closeTimer);
      state.openTimer = 0;
      state.closeTimer = 0;
      state.pendingId = null;
      state.openId = null;
    };
  }, [scrollRef, cancelClose, cancelOpen, hide, scheduleClose]);

  const torrent = target ? torrentById.get(target.id) : undefined;

  // The torrent was removed, or filtered out of the list, while its card was open.
  useEffect(() => {
    if (open && !torrent) hide();
  }, [open, torrent, hide]);

  if (!target) return null;

  const actions = torrentHoverCardActions(clientKind, torrent?.state);
  const run = (action: TorrentHoverAction) => {
    handlersRef.current.act(action.method, [target.id]);
  };

  return (
    <Popover
      open={open && torrent != null}
      onOpenChange={(next, details) => {
        if (next) return;
        if (details.reason === "escape-key") intent.current.suppressedId = intent.current.openId;
        hide();
      }}
    >
      <PopoverContent
        data-slot={TORRENT_HOVER_CARD_SLOT}
        anchor={target.anchor}
        side="bottom"
        align="start"
        sideOffset={2}
        collisionPadding={8}
        // Opening under a resting pointer must not pull focus out of the list.
        initialFocus={false}
        // After a click inside the card, hand focus back to the list so arrow keys keep working.
        finalFocus={() => {
          const state = intent.current;
          if (!state.leaveFocus) return scrollRef.current;
          state.leaveFocus = false;
          return false;
        }}
        className="w-64 max-w-[calc(100vw-1rem)] cursor-default gap-1.5 p-3"
        onPointerEnter={() => {
          cancelOpen();
          cancelClose();
        }}
        onPointerLeave={scheduleClose}
      >
        {torrent ? (
          <>
            <PopoverHeader className="min-w-0 gap-0.5">
              <PopoverTitle className="line-clamp-4 leading-snug font-semibold break-words select-text">
                {torrent.name}
              </PopoverTitle>
              <p className="tabular truncate text-xs text-muted-foreground">
                {torrent.state} · {formatProgress(torrent.progress)} ·{" "}
                {formatBytes(torrent.total_wanted)}
              </p>
            </PopoverHeader>
            <div
              role="group"
              aria-label="Torrent actions"
              className="-mx-1.5 -mb-1 flex items-center gap-1 text-muted-foreground"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={actions.toggle.label}
                title={actions.toggle.label}
                onClick={() => run(actions.toggle)}
              >
                {actions.toggle.id === "resume" ? <Play /> : <Pause />}
              </Button>
              {actions.recheck ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={actions.recheck.label}
                  title="Force recheck"
                  onClick={() => run(actions.recheck!)}
                >
                  <RefreshCw />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove…"
                title="Remove…"
                className="hover:text-destructive"
                onClick={() => {
                  // Never removes directly: the shell opens RemoveTorrentDialog to confirm.
                  intent.current.leaveFocus = true;
                  hide();
                  handlersRef.current.remove([target.id]);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
