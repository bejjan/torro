import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ADD_TORRENT_LABEL,
  DEFAULT_TORRENT_SEARCH_PLACEHOLDER,
  DISMISSIBLE_OVERLAY_SELECTOR,
  addTorrentShortcutLabel,
  addTorrentShortcutTitle,
  decideAddTorrentShortcutAction,
  decideEscapeSelectionAction,
  decideTorrentSearchFindAction,
  hasOpenDismissibleOverlay,
  isMacPlatform,
  torrentSearchPlaceholder,
  torrentSearchShortcutLabel,
  torrentSearchShortcutTitle,
  type EscapeSelectionInput,
  type ModifierShortcutInput,
  type TorrentSearchFindInput,
} from "./escape-selection";

const here = dirname(fileURLToPath(import.meta.url));

function decide(partial: Partial<EscapeSelectionInput> & Pick<EscapeSelectionInput, "targetKind">) {
  return decideEscapeSelectionAction({
    key: "Escape",
    overlayOpen: false,
    search: "",
    selectedCount: 2,
    hasActiveId: true,
    ...partial,
  });
}

assert.equal(
  decide({ key: "a", targetKind: "other" }),
  "none",
  "non-Escape keys are ignored"
);
assert.equal(
  decide({ targetKind: "other", defaultPrevented: true }),
  "none",
  "already-handled Escape is ignored"
);
assert.equal(
  decide({ targetKind: "other", overlayOpen: true }),
  "none",
  "open dialog/menu keeps selection"
);
assert.equal(
  decide({ targetKind: "search", search: "ubuntu", overlayOpen: true }),
  "none",
  "overlay wins over search clear"
);

assert.equal(
  decide({ targetKind: "search", search: "ubuntu" }),
  "clear-search",
  "focused non-empty search clears the query first"
);
assert.equal(
  decide({ targetKind: "search", search: "", selectedCount: 3, hasActiveId: true }),
  "clear-selection",
  "empty search still clears torrent selection"
);
assert.equal(
  decide({ targetKind: "input", search: "", selectedCount: 3 }),
  "none",
  "other text fields keep Escape"
);

assert.equal(
  decide({ targetKind: "other", selectedCount: 1, hasActiveId: false }),
  "clear-selection"
);
assert.equal(
  decide({ targetKind: "other", selectedCount: 0, hasActiveId: true }),
  "clear-selection",
  "details activeId clears even with an empty Set"
);
assert.equal(
  decide({ targetKind: "other", selectedCount: 0, hasActiveId: false }),
  "none"
);

assert.equal(
  hasOpenDismissibleOverlay({
    querySelector(selector: string) {
      assert.equal(selector, DISMISSIBLE_OVERLAY_SELECTOR);
      return { slot: "dialog-content" };
    },
  } as unknown as ParentNode),
  true
);
assert.equal(
  hasOpenDismissibleOverlay({
    querySelector() {
      return null;
    },
  } as unknown as ParentNode),
  false
);

assert.match(DISMISSIBLE_OVERLAY_SELECTOR, /data-slot="dialog-content"\]\[data-open\]/);
assert.match(DISMISSIBLE_OVERLAY_SELECTOR, /data-slot="select-content"\]\[data-open\]/);
assert.match(DISMISSIBLE_OVERLAY_SELECTOR, /data-slot="dropdown-menu-content"/);
assert.match(DISMISSIBLE_OVERLAY_SELECTOR, /data-slot="context-menu-content"/);
assert.match(DISMISSIBLE_OVERLAY_SELECTOR, /data-slot="sheet-content"/);

const shellSource = readFileSync(join(here, "../../components/app/torrent-shell.tsx"), "utf8");
assert.match(shellSource, /decideEscapeSelectionAction/);
assert.match(shellSource, /decideTorrentSearchFindAction/);
assert.match(shellSource, /decideAddTorrentShortcutAction/);
assert.match(shellSource, /hasOpenDismissibleOverlay/);
assert.match(shellSource, /window\.addEventListener\("keydown"/);
assert.match(shellSource, /capture:\s*true/);
assert.match(shellSource, /setSelected\(new Set\(\)\)/);
assert.match(shellSource, /setActiveId\(null\)/);
assert.match(shellSource, /data-torrent-search/);
assert.match(shellSource, /setSearchExpanded\(true\)/);
assert.match(shellSource, /focusVisibleTorrentSearch/);
assert.match(shellSource, /pickDefaultAddRef\.current\?\.\(\)/);
assert.doesNotMatch(shellSource, /setAddOpen\(true\)/);
assert.match(shellSource, /torrentSearchPlaceholder/);
assert.match(shellSource, /addTorrentShortcutTitle/);
assert.match(shellSource, /DEFAULT_TORRENT_SEARCH_PLACEHOLDER/);
assert.match(shellSource, /DEFAULT_ADD_TORRENT_LABEL/);
assert.match(shellSource, /setSearchPlaceholder\(torrentSearchPlaceholder/);
assert.match(shellSource, /setAddTorrentLabel\(addTorrentShortcutTitle/);
assert.doesNotMatch(
  shellSource,
  /placeholder="Search torrents"/,
  "search placeholder is mount-safe, not a hardcoded shortcut"
);

function find(partial: Partial<TorrentSearchFindInput> = {}): ReturnType<typeof decideTorrentSearchFindAction> {
  return decideTorrentSearchFindAction({
    key: "f",
    metaKey: false,
    ctrlKey: true,
    overlayOpen: false,
    targetKind: "other",
    isMac: false,
    ...partial,
  });
}

assert.equal(isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), true);
assert.equal(isMacPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
assert.equal(isMacPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), true);
assert.equal(isMacPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), false);
assert.equal(isMacPlatform("Mozilla/5.0 (X11; Linux x86_64)"), false);
assert.equal(DEFAULT_TORRENT_SEARCH_PLACEHOLDER, "Search torrents");
assert.equal(torrentSearchShortcutLabel(true), "⌘F");
assert.equal(torrentSearchShortcutLabel(false), "Ctrl+F");
assert.equal(torrentSearchShortcutTitle(true), "Search torrents (⌘F)");
assert.equal(torrentSearchShortcutTitle(false), "Search torrents (Ctrl+F)");
assert.equal(torrentSearchPlaceholder(true), "Search torrents (⌘F)");
assert.equal(torrentSearchPlaceholder(false), "Search torrents (Ctrl+F)");
assert.equal(torrentSearchPlaceholder(true), torrentSearchShortcutTitle(true));
assert.equal(torrentSearchPlaceholder(false), torrentSearchShortcutTitle(false));
assert.equal(DEFAULT_ADD_TORRENT_LABEL, "Add torrent");
assert.equal(addTorrentShortcutLabel(true), "⌘D");
assert.equal(addTorrentShortcutLabel(false), "Ctrl+D");
assert.equal(addTorrentShortcutTitle(true), "Add torrent (⌘D)");
assert.equal(addTorrentShortcutTitle(false), "Add torrent (Ctrl+D)");

assert.equal(find(), "focus-search", "Ctrl+F focuses search on Windows/Linux");
assert.equal(find({ isMac: true, metaKey: true, ctrlKey: false }), "focus-search", "⌘F focuses search on Mac");
assert.equal(find({ key: "F", isMac: true, metaKey: true, ctrlKey: false }), "focus-search");
assert.equal(find({ isMac: true, metaKey: false, ctrlKey: true }), "none", "Ctrl+F is not the Mac shortcut");
assert.equal(find({ isMac: false, metaKey: true, ctrlKey: false }), "none", "⌘F is not the Windows shortcut");
assert.equal(find({ key: "k" }), "none");
assert.equal(find({ altKey: true }), "none");
assert.equal(find({ shiftKey: true }), "none");
assert.equal(find({ defaultPrevented: true }), "none");
assert.equal(find({ overlayOpen: true }), "none", "open dialog/menu keeps native find");
assert.equal(find({ targetKind: "input" }), "none", "other text fields keep native find");
assert.equal(
  find({ targetKind: "search" }),
  "focus-search",
  "repeat press stays in torrent search"
);

function add(partial: Partial<ModifierShortcutInput> = {}): ReturnType<typeof decideAddTorrentShortcutAction> {
  return decideAddTorrentShortcutAction({
    key: "d",
    metaKey: false,
    ctrlKey: true,
    overlayOpen: false,
    targetKind: "other",
    isMac: false,
    ...partial,
  });
}

assert.equal(add(), "open-add", "Ctrl+D opens add on Windows/Linux");
assert.equal(add({ isMac: true, metaKey: true, ctrlKey: false }), "open-add", "⌘D opens add on Mac");
assert.equal(add({ key: "D", isMac: true, metaKey: true, ctrlKey: false }), "open-add");
assert.equal(add({ key: "a" }), "none", "Ctrl+A stays Select All");
assert.equal(add({ key: "a", isMac: true, metaKey: true, ctrlKey: false }), "none", "⌘A stays Select All");
assert.equal(add({ isMac: true, metaKey: false, ctrlKey: true }), "none", "Ctrl+D is not the Mac shortcut");
assert.equal(add({ isMac: false, metaKey: true, ctrlKey: false }), "none", "⌘D is not the Windows shortcut");
assert.equal(add({ key: "n" }), "none");
assert.equal(add({ altKey: true }), "none");
assert.equal(add({ shiftKey: true }), "none");
assert.equal(add({ defaultPrevented: true }), "none");
assert.equal(add({ overlayOpen: true }), "none", "open dialog/menu keeps the shortcut");
assert.equal(add({ targetKind: "input" }), "none", "text fields keep their own shortcuts");
assert.equal(add({ targetKind: "search" }), "none", "search keeps its own shortcuts");

console.log("escape-selection tests passed");
