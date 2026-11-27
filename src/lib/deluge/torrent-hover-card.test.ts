import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_KINDS, clientCapabilities } from "../backend/client-kind";
import { DISMISSIBLE_OVERLAY_SELECTOR } from "./escape-selection";
import {
  TORRENT_HOVER_CARD_CLOSE_DELAY_MS,
  TORRENT_HOVER_CARD_OPEN_DELAY_MS,
  TORRENT_HOVER_CARD_OPEN_SELECTOR,
  TORRENT_HOVER_CARD_SELECTOR,
  TORRENT_HOVER_CARD_SLOT,
  TORRENT_HOVER_CELL_ATTRIBUTE,
  TORRENT_HOVER_CELL_SELECTOR,
  TORRENT_ROW_SELECTOR,
  hasOpenTorrentHoverCard,
  hoverCardAnchorRect,
  torrentHoverCardActions,
} from "./torrent-hover-card";
import type { TorrentState } from "./types";

// Pause or Resume follows the torrent's state.
const running: TorrentState[] = ["Downloading", "Seeding", "Checking", "Queued", "Error", "Allocating", "Moving"];
for (const state of running) {
  const { toggle } = torrentHoverCardActions("deluge", state);
  assert.deepEqual(toggle, { id: "pause", method: "core.pause_torrent", label: "Pause" }, state);
}
assert.deepEqual(torrentHoverCardActions("deluge", "Paused").toggle, {
  id: "resume",
  method: "core.resume_torrent",
  label: "Resume",
});
assert.equal(torrentHoverCardActions("deluge", null).toggle.id, "pause");

// Queue and recheck follow the client's capabilities; every client has them today.
for (const kind of CLIENT_KINDS) {
  const caps = clientCapabilities(kind);
  const actions = torrentHoverCardActions(kind, "Downloading");
  assert.equal(caps.queueOrdering, true, `${kind} queue ordering`);
  assert.equal(caps.forceRecheck, true, `${kind} force recheck`);
  assert.deepEqual(
    actions.queue.map((action) => action.method),
    ["core.queue_top", "core.queue_up", "core.queue_down", "core.queue_bottom"],
    `${kind} queue actions`
  );
  assert.deepEqual(
    actions.queue.map((action) => action.label),
    ["Queue top", "Queue up", "Queue down", "Queue bottom"]
  );
  assert.equal(actions.recheck?.method, "core.force_recheck", `${kind} recheck`);
}

// The card hangs under the pointer, clamped to the name cell.
const cell = { left: 100, right: 500, top: 40, bottom: 76 };
{
  const rect = hoverCardAnchorRect(cell, 300);
  assert.equal(rect.left, 284);
  assert.equal(rect.right, 284);
  assert.equal(rect.x, 284);
  assert.equal(rect.width, 0);
  assert.equal(rect.top, 40);
  assert.equal(rect.y, 40);
  assert.equal(rect.bottom, 76);
  assert.equal(rect.height, 36);
}
assert.equal(hoverCardAnchorRect(cell, 104).left, 100, "clamped to the cell's left edge");
assert.equal(hoverCardAnchorRect(cell, 20).left, 100);
assert.equal(hoverCardAnchorRect(cell, 900).left, 484, "clamped inside the cell's right edge");
assert.equal(hoverCardAnchorRect(cell, 300, 0).left, 300);
assert.equal(hoverCardAnchorRect({ left: 100, right: 108, top: 0, bottom: 36 }, 104).left, 100, "narrow cell");

// A hover delay, and a shorter grace period to reach the card.
assert.ok(TORRENT_HOVER_CARD_OPEN_DELAY_MS >= 300);
assert.ok(TORRENT_HOVER_CARD_CLOSE_DELAY_MS > 0);
assert.ok(TORRENT_HOVER_CARD_CLOSE_DELAY_MS < TORRENT_HOVER_CARD_OPEN_DELAY_MS);

assert.equal(TORRENT_ROW_SELECTOR, "tr[data-torrent-id]");
assert.equal(TORRENT_HOVER_CELL_SELECTOR, `td[${TORRENT_HOVER_CELL_ATTRIBUTE}]`);

// Escape closes the card first, but the card is not a dialog-style overlay:
// it must not disable the Find and Add shortcuts.
assert.equal(TORRENT_HOVER_CARD_SELECTOR, '[data-slot="torrent-hover-card"]');
assert.equal(TORRENT_HOVER_CARD_OPEN_SELECTOR, '[data-slot="torrent-hover-card"][data-open]');
assert.doesNotMatch(DISMISSIBLE_OVERLAY_SELECTOR, new RegExp(TORRENT_HOVER_CARD_SLOT));
assert.equal(
  hasOpenTorrentHoverCard({
    querySelector(selector: string) {
      assert.equal(selector, TORRENT_HOVER_CARD_OPEN_SELECTOR);
      return {};
    },
  } as unknown as ParentNode),
  true
);
assert.equal(
  hasOpenTorrentHoverCard({ querySelector: () => null } as unknown as ParentNode),
  false
);

{
  const here = dirname(fileURLToPath(import.meta.url));
  const app = join(here, "../../components/app");
  const card = readFileSync(join(app, "torrent-hover-card.tsx"), "utf8");
  const table = readFileSync(join(app, "torrent-table.tsx"), "utf8");
  const shell = readFileSync(join(app, "torrent-shell.tsx"), "utf8");
  const popover = readFileSync(join(here, "../../components/ui/popover.tsx"), "utf8");

  // An interactive surface (Popover dialog), not a tooltip, and one for the whole list.
  assert.match(card, /from "@\/components\/ui\/popover"/);
  assert.doesNotMatch(card, /components\/ui\/tooltip/);
  assert.match(card, /data-slot=\{TORRENT_HOVER_CARD_SLOT\}/);
  assert.match(card, /<PopoverTitle[^>]*>\s*\{torrent\.name\}/);
  assert.match(card, /anchor=\{target\.anchor\}/);
  assert.match(popover, /anchor=\{anchor\}/);
  assert.equal(table.match(/<TorrentHoverCard\b/g)?.length, 1, "one shared card, not one per row");
  const row = table.slice(table.indexOf("const TorrentRow = memo("), table.indexOf("function CustomLimitMark"));
  assert.doesNotMatch(row, /TorrentHoverCard|<Popover/, "rows stay free of popover state");

  // Hover intent: mouse only, delayed, and dropped on press, scroll and keys.
  assert.match(card, /event\.pointerType !== "mouse"\) return/);
  assert.match(card, /event\.buttons !== 0/);
  assert.match(card, /TORRENT_HOVER_CARD_OPEN_DELAY_MS\)/);
  assert.match(card, /TORRENT_HOVER_CARD_CLOSE_DELAY_MS\)/);
  assert.match(card, /addEventListener\("pointerdown", onPointerDown\)/);
  assert.match(card, /addEventListener\("scroll", hide, \{ passive: true \}\)/);
  assert.match(card, /addEventListener\("keydown", onKeyDown\)/);
  // Entering the card from the row must not arm the close timer.
  assert.match(card, /into\.closest\(TORRENT_HOVER_CARD_SELECTOR\)\) return;/);
  // Opening must not take focus from the list or the search field.
  assert.match(card, /initialFocus=\{false\}/);

  // Actions reuse the row handlers; remove only asks the shell for its confirm dialog,
  // which then owns focus.
  assert.match(card, /intent\.current\.leaveFocus = true;\s*hide\(\);\s*handlersRef\.current\.remove/);
  assert.match(card, /handlersRef\.current\.act\(action\.method, \[target\.id\]\)/);
  assert.match(card, /handlersRef\.current\.remove\(\[target\.id\]\)/);
  assert.doesNotMatch(card, /rpc\(|core\.remove_torrent/);
  assert.match(card, /torrentHoverCardActions\(clientKind, torrent\?\.state\)/);
  assert.match(card, /actions\.recheck \?/);
  // Compact card: icon-only buttons with accessible names, and no queue controls.
  assert.doesNotMatch(card, /actions\.queue/);
  assert.doesNotMatch(card, /\{actions\.(toggle|recheck)\.label\}\s*<\/Button>/);
  assert.match(card, /aria-label=\{actions\.toggle\.label\}/);
  assert.match(card, /aria-label="Remove…"/);
  assert.match(card, /cursor-default/);
  assert.match(shell, /onRemove=\{openRemove\}/);
  assert.match(shell, /<RemoveTorrentDialog/);

  // No hover card without a mouse or in the mobile layout.
  assert.match(table, /const canHover = useCanHover\(\);/);
  assert.match(table, /const hoverCard = canHover && !mobile;/);
  assert.match(table, /\{hoverCard \? \(\s*<TorrentHoverCard/);
  assert.match(table, /hoverCard=\{hoverCard && column\.id === "name"\}/);
  assert.match(table, /data-torrent-id=\{id\}/);
  assert.match(table, /\[TORRENT_HOVER_CELL_ATTRIBUTE\]: hoverCard \? "" : undefined/);
  const hook = readFileSync(join(here, "../../hooks/use-can-hover.ts"), "utf8");
  assert.match(hook, /\(hover: hover\) and \(pointer: fine\)/);

  // Row interactions are untouched.
  assert.match(table, /onClick=\{\(e\) => handlersRef\.current\.clickRow\(id, e\)\}/);
  assert.match(table, /onDoubleClick=\{\(\) => handlersRef\.current\.openDetails\(id\)\}/);
  assert.match(table, /<ContextMenuTrigger\s+render=\{\s*<tr/);

  assert.match(shell, /overlayOpen: overlayOpen \|\| hasOpenTorrentHoverCard\(document\)/);
}

console.log("torrent-hover-card tests passed");
