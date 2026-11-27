import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TORRENT_LIST_INSET_VAR } from "../../lib/deluge/ui-layout";

const dir = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(dir, "torrent-shell.tsx"), "utf8");
const table = readFileSync(join(dir, "torrent-table.tsx"), "utf8");
const css = readFileSync(join(dir, "../../app/globals.css"), "utf8");

const split = shell.slice(shell.indexOf("<div ref={splitRef}"), shell.indexOf("<footer"));
const sheet = shell.slice(shell.indexOf("<Sheet open={sidebarOpen}"), shell.indexOf("</Sheet>"));

// Desktop sidebar is translucent and layered above the list; the mobile sheet stays opaque.
assert.match(split, /<aside className="sidebar-glass [^"]*text-sidebar-foreground"/);
assert.doesNotMatch(split, /<aside className="[^"]*\bbg-sidebar\b/);
assert.match(split, /className="relative z-10 min-h-0 min-w-0 shrink-0 self-stretch"/);
assert.doesNotMatch(sheet, /sidebar-glass/);

// The list bleeds under the sidebar by exactly the width it is inset by, and only on desktop
// with the sidebar shown, so resizing or hiding the sidebar keeps the two in step.
assert.match(shell, /const sidebarInset = !mobile && showSidebar \? sidebarWidth : 0;/);
assert.match(split, /\{sidebarInset > 0 \? \(/);
assert.match(split, /className="isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"/);
assert.match(split, /marginLeft: -sidebarInset,\s*\[TORRENT_LIST_INSET_VAR\]: `\$\{sidebarInset\}px`,/);
assert.equal(TORRENT_LIST_INSET_VAR, "--torrent-list-inset");
assert.ok(
  table.includes(`pl-[var(${TORRENT_LIST_INSET_VAR},0px)]`),
  "table pads its scroll content by the variable the shell sets"
);

// Glass tint per theme, opaque fallbacks.
assert.equal([...css.matchAll(/^\s*--sidebar-glass:/gm)].length, 2, "light and dark tints");
assert.match(css, /\.sidebar-glass \{\s*background-color: var\(--sidebar\);\s*\}/);
assert.match(
  css,
  /@supports \(backdrop-filter: blur\(1px\)\)[^{]*\{\s*\.sidebar-glass \{\s*background-color: var\(--sidebar-glass\);[^}]*backdrop-filter: blur\(/
);
assert.match(
  css,
  /@media \(prefers-reduced-transparency: reduce\) \{\s*\.sidebar-glass \{\s*background-color: var\(--sidebar\);[^}]*backdrop-filter: none;/
);

console.log("torrent-shell-sidebar tests passed");
