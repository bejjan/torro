/** Overlay popups that should consume Escape before torrent selection clears. */
export const DISMISSIBLE_OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"][data-open]',
  '[data-slot="alert-dialog-content"][data-open]',
  '[data-slot="sheet-content"][data-open]',
  '[data-slot="dropdown-menu-content"][data-open]',
  '[data-slot="context-menu-content"][data-open]',
  '[data-slot="select-content"][data-open]',
  '[data-slot="popover-content"][data-open]',
].join(",");

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "radio",
  "file",
  "reset",
  "submit",
  "range",
  "color",
  "hidden",
  "image",
]);

export type EscapeTargetKind = "search" | "input" | "other";

export type EscapeSelectionAction = "none" | "clear-search" | "clear-selection";

export type EscapeSelectionInput = {
  key: string;
  defaultPrevented?: boolean;
  overlayOpen: boolean;
  targetKind: EscapeTargetKind;
  search: string;
  selectedCount: number;
  hasActiveId: boolean;
};

export type TorrentSearchFindAction = "none" | "focus-search";

export type AddTorrentShortcutAction = "none" | "open-add";

export type ModifierShortcutInput = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  overlayOpen: boolean;
  targetKind: EscapeTargetKind;
  isMac: boolean;
};

export type TorrentSearchFindInput = ModifierShortcutInput;

export const TORRENT_SEARCH_SELECTOR = "[data-torrent-search]";

export const DEFAULT_TORRENT_SEARCH_PLACEHOLDER = "Search torrents";

export const DEFAULT_ADD_TORRENT_LABEL = "Add torrent";

/** Mac / iOS use ⌘F; Windows and Linux use Ctrl+F. */
export function isMacPlatform(userAgent: string): boolean {
  return /Mac|iPhone|iPad|iPod/.test(userAgent);
}

export function torrentSearchShortcutLabel(isMac: boolean): string {
  return isMac ? "⌘F" : "Ctrl+F";
}

export function torrentSearchShortcutTitle(isMac: boolean): string {
  return `${DEFAULT_TORRENT_SEARCH_PLACEHOLDER} (${torrentSearchShortcutLabel(isMac)})`;
}

/** Same parenthetical string as the title, so tooltip and placeholder cannot disagree. */
export function torrentSearchPlaceholder(isMac: boolean): string {
  return torrentSearchShortcutTitle(isMac);
}

/** Mac / iOS use ⌘D; Windows and Linux use Ctrl+D. ⌘A stays Select All. */
export function addTorrentShortcutLabel(isMac: boolean): string {
  return isMac ? "⌘D" : "Ctrl+D";
}

export function addTorrentShortcutTitle(isMac: boolean): string {
  return `${DEFAULT_ADD_TORRENT_LABEL} (${addTorrentShortcutLabel(isMac)})`;
}

function matchesLetterShortcut(
  input: ModifierShortcutInput,
  letter: string,
  options: { skipSearch?: boolean } = {}
): boolean {
  if (input.defaultPrevented) return false;
  if (input.overlayOpen) return false;
  if (input.targetKind === "input") return false;
  if (options.skipSearch && input.targetKind === "search") return false;
  if (input.altKey || input.shiftKey) return false;
  if (input.key !== letter && input.key !== letter.toUpperCase()) return false;
  const modifier = input.isMac ? input.metaKey : input.ctrlKey;
  const other = input.isMac ? input.ctrlKey : input.metaKey;
  return Boolean(modifier) && !other;
}

/**
 * Cmd+F (Mac) / Ctrl+F (elsewhere) focuses torrent search.
 * Other text fields and open dialogs/menus keep native Find-in-page.
 * Repeat presses while search is focused stay in the search field.
 */
export function decideTorrentSearchFindAction(input: TorrentSearchFindInput): TorrentSearchFindAction {
  return matchesLetterShortcut(input, "f") ? "focus-search" : "none";
}

/**
 * Cmd+D (Mac) / Ctrl+D (elsewhere) opens Add torrent.
 * Cmd+A / Ctrl+A stays Select All in the torrent list.
 * Search and other text fields keep their own shortcuts.
 * Open dialogs/menus keep the shortcut; preventDefault when handled.
 */
export function decideAddTorrentShortcutAction(input: ModifierShortcutInput): AddTorrentShortcutAction {
  return matchesLetterShortcut(input, "d", { skipSearch: true }) ? "open-add" : "none";
}

export function hasOpenDismissibleOverlay(root: ParentNode): boolean {
  return Boolean(root.querySelector(DISMISSIBLE_OVERLAY_SELECTOR));
}

export function isEditableField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const el = target.closest("input, textarea, select, [contenteditable=true], [contenteditable='']");
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has((el.type || "text").toLowerCase());
  }
  return true;
}

export function classifyEscapeTarget(
  target: EventTarget | null,
  searchSelector = TORRENT_SEARCH_SELECTOR
): EscapeTargetKind {
  if (!(target instanceof Element)) return "other";
  if (target.closest(searchSelector)) return "search";
  if (isEditableField(target)) return "input";
  return "other";
}

/**
 * Escape closes dialogs/menus first (caller skips when overlayOpen).
 * Search: non-empty query clears search; otherwise clear torrent selection.
 * Other text fields keep Escape. Otherwise clear selection + details id.
 */
export function decideEscapeSelectionAction(input: EscapeSelectionInput): EscapeSelectionAction {
  if (input.key !== "Escape") return "none";
  if (input.defaultPrevented) return "none";
  if (input.overlayOpen) return "none";
  if (input.targetKind === "search" && input.search.length > 0) return "clear-search";
  if (input.targetKind === "input") return "none";
  if (input.selectedCount > 0 || input.hasActiveId) return "clear-selection";
  return "none";
}
