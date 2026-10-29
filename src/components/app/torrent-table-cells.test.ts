import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TorrentStatus } from "../../lib/deluge/types";
import {
  cellTextOverflows,
  contextLimitTorrents,
  overflowTooltipLabel,
  torrentRowClassName,
  torrentRowHighlightClassName,
} from "./torrent-table";

const dir = dirname(fileURLToPath(import.meta.url));
const table = readFileSync(join(dir, "torrent-table.tsx"), "utf8");
const badge = readFileSync(join(dir, "state-badge.tsx"), "utf8");

const unstriped = torrentRowClassName({ striped: false, selected: false });
const striped = torrentRowClassName({ striped: true, selected: false });
const selected = torrentRowHighlightClassName({ striped: true, selected: true });
const selectedMid = torrentRowHighlightClassName({
  striped: false,
  selected: true,
  selectedAbove: true,
  selectedBelow: true,
});
const selectedTop = torrentRowHighlightClassName({
  striped: false,
  selected: true,
  selectedBelow: true,
});
const selectedBottom = torrentRowHighlightClassName({
  striped: false,
  selected: true,
  selectedAbove: true,
});
const stripedHighlight = torrentRowHighlightClassName({ striped: true, selected: false });
const unstripedHighlight = torrentRowHighlightClassName({ striped: false, selected: false });

assert.match(unstriped, /relative isolate/);
assert.match(striped, /\[transform:translateZ\(0\)\]/);
assert.doesNotMatch(unstriped, /rounded-/);
assert.doesNotMatch(striped, /rounded-/);
assert.doesNotMatch(unstriped, /\[&>td:first-child\]:rounded/);
assert.doesNotMatch(striped, /\[&>td\]:bg-muted/);
assert.doesNotMatch(striped, /\[&>td\]:bg-primary/);
assert.doesNotMatch(unstriped, /border-l-|border-r-/);
assert.doesNotMatch(stripedHighlight, /border-l-|border-r-/);

assert.match(stripedHighlight, /(?:^|\s)rounded-md(?:\s|$)/);
assert.match(unstripedHighlight, /(?:^|\s)rounded-md(?:\s|$)/);
assert.match(selected, /(?:^|\s)rounded-md(?:\s|$)/);
assert.match(selected, /bg-primary\/10/);
assert.match(stripedHighlight, /bg-muted\/50/);
assert.match(unstriped, /cursor-default/);
assert.doesNotMatch(unstriped, /cursor-pointer/);
assert.doesNotMatch(unstripedHighlight, /group-hover/);
assert.doesNotMatch(unstripedHighlight, /(?:^|\s)bg-muted\/50(?:\s|$)/);
assert.match(selectedMid, /rounded-none/);
assert.doesNotMatch(selectedMid, /rounded-(?:md|t-md|b-md)\b/);
assert.match(selectedTop, /rounded-t-md/);
assert.match(selectedBottom, /rounded-b-md/);
assert.doesNotMatch(stripedHighlight, /rounded-(?:l|r|tl|tr|bl|br)-md/);
assert.doesNotMatch(stripedHighlight, /rounded-sm|rounded-full|rounded-\[/);

assert.match(
  table,
  /className="min-h-0 flex-1 overflow-auto outline-none focus:outline-none"/,
);
assert.match(table, /aria-label="Torrent list"/);
assert.match(table, /tabIndex=\{0\}/);
assert.match(table, /table-fixed/);
assert.match(table, /TORRENT_ROW_HEIGHT = 36/);
assert.match(table, /whitespace-nowrap/);
assert.match(table, /overflow-hidden/);
assert.match(table, /text-ellipsis/);
assert.match(table, /max-w-0/);
assert.match(table, /isProgress \? "flex h-full w-full items-center" : "truncate"/);
assert.doesNotMatch(table, /flex h-full min-w-0 items-center/);
assert.match(table, /applyVisibleSelection/);
assert.match(table, /visibleSelectionState/);
assert.match(table, /border-separate border-spacing-0 text-sm/);
assert.doesNotMatch(table, /border-separate border-spacing-0 px-1\.5/);
assert.match(table, /style=\{\{ width: tableMinWidth \}\}/);
assert.doesNotMatch(table, /width: "100%"/);
assert.doesNotMatch(table, /minWidth: tableMinWidth/);
assert.match(table, /function TorrentListSkeleton/);
assert.match(table, /Loading torrents/);
assert.doesNotMatch(table, /Loading torrents…/);
assert.match(table, /TORRENT_SKELETON_ROWS/);
assert.match(table, /aria-busy="true"/);
assert.match(table, /virtualRow\.index % 2 === 1/);
assert.match(table, /torrentRowClassName/);
assert.match(table, /torrentRowHighlightClassName/);
assert.match(table, /data-row-highlight/);
assert.match(table, /absolute inset-y-0 left-1\.5 right-1\.5/);
assert.match(table, /bg-muted\/50/);
assert.match(table, /selected && "bg-primary\/10"/);
assert.doesNotMatch(table, /group-hover:bg-primary\/15/);
assert.doesNotMatch(table, /group-hover:bg-muted\/70/);
assert.match(table, /cursor-default \[transform:translateZ\(0\)\]/);
assert.doesNotMatch(table, /cursor-pointer \[transform:translateZ\(0\)\]/);
assert.doesNotMatch(table, /\[&>td\]:bg-muted\/50/);
assert.doesNotMatch(table, /\[&>td\]:bg-primary\/10/);
assert.doesNotMatch(table, /\[&>td:first-child\]:rounded/);
assert.doesNotMatch(table, /\[&>td:last-child\]:rounded/);
assert.doesNotMatch(table, /rounded-\[10px_4px\]|rounded-sm|rounded-\[4px\]/);
assert.doesNotMatch(table, /hover:\[&>td:first-child\]:rounded/);
assert.doesNotMatch(table, /border-l-\[0\.375rem\]|border-r-\[0\.375rem\]/);
assert.doesNotMatch(table, /\[&>td:first-child\]:border-l/);
assert.doesNotMatch(table, /\[&>td:last-child\]:border-r/);
assert.doesNotMatch(table, /\[&>td:nth-last-child/);
assert.doesNotMatch(table, /bg-clip-padding/);
assert.match(table, /overflow-hidden py-1\.5 pr-2 pl-3\.5 whitespace-nowrap/);
assert.match(table, /last && "pr-3\.5"/);
assert.match(table, /relative py-2 pr-2 pl-3\.5/);
assert.match(table, /last \? "pr-3\.5 pl-2" : "px-2"/);
assert.match(table, /ChevronUp/);
assert.match(table, /ChevronDown/);
assert.doesNotMatch(table, /▲/);
assert.doesNotMatch(table, /▼/);
assert.doesNotMatch(table, /cursor-pointer border-b hover:bg-muted\/50/);
assert.match(table, /flex w-full max-w-full cursor-default items-center gap-1 truncate py-2/);
assert.match(table, /relative overflow-visible cursor-default p-0 select-none/);
assert.doesNotMatch(table, /inline-flex max-w-full cursor-grab/);
assert.doesNotMatch(table, /: "cursor-grab"/);
assert.doesNotMatch(table, /sorted && "bg-muted\/25"/);
assert.doesNotMatch(table, /sorted=\{sortKey === column\.sortKey\}/);
assert.match(table, /formatCompactDate/);
assert.doesNotMatch(table, /hit\(formatDate\(/);
assert.match(table, /TorrentColumnCell/);
assert.match(table, /case "name":/);
assert.match(table, /torrentColumnCellText/);
assert.match(table, /hit\(text\)/);
assert.match(table, /case "name":\s*return t\.name/);
assert.match(table, /HighlightText/);
assert.doesNotMatch(table, /dangerouslySetInnerHTML/);
assert.doesNotMatch(table, /numeric=\{column\.numeric\}/);
assert.doesNotMatch(table, /numeric && "font-mono tabular"/);
assert.doesNotMatch(table, /numeric && "font-mono text-xs tabular"/);
assert.match(table, /column\.numeric && "font-mono text-xs"/);
assert.match(table, /px-2 py-1\.5 tabular/);
assert.match(table, /case "name":\s*return <td className="px-2 py-1\.5 font-medium">/);
assert.match(table, /case "status":\s*return \(\s*<td className="px-2 py-1\.5">/);
assert.match(table, /case "label":\s*return <td className="px-2 py-1\.5 text-muted-foreground">/);
assert.match(table, /case "tracker":\s*return <td className="px-2 py-1\.5 text-muted-foreground">/);
assert.match(table, /case "auto_managed":\s*return <td className="px-2 py-1\.5 text-muted-foreground">/);
assert.doesNotMatch(table, /<StateBadge[^/\n]*font-mono/);

assert.match(table, /function OverflowTooltip/);
assert.match(table, /overflowTooltipLabel/);
assert.match(table, /cellTextOverflows/);
assert.match(table, /onPointerEnter/);
assert.match(table, /overflowingRef/);
assert.match(table, /TooltipProvider delay=\{400\}/);
assert.match(table, /TooltipTrigger/);
assert.match(table, /delay=\{400\}/);
assert.match(table, /TooltipContent/);
assert.doesNotMatch(table, /new ResizeObserver/);
assert.match(table, /EMPTY_CELL/);
assert.match(table, /column\.id === "status" && t\.state === "Error"/);

assert.equal(overflowTooltipLabel("—"), undefined);
assert.equal(overflowTooltipLabel(""), undefined);
assert.equal(overflowTooltipLabel("Long Name.iso"), "Long Name.iso");
assert.equal(cellTextOverflows({ scrollWidth: 120, clientWidth: 80 } as HTMLElement), true);
assert.equal(cellTextOverflows({ scrollWidth: 80, clientWidth: 80 } as HTMLElement), false);

assert.match(
  table,
  /className: cn\(\s*typed\.props\.className,[\s\S]*max-w-0 min-w-0 overflow-hidden align-middle/
);
assert.match(table, /const isProgress = column\.id === "progress"/);
assert.match(table, /!isProgress && "text-ellipsis whitespace-nowrap"/);
assert.match(table, /isProgress \? "flex h-full w-full items-center" : "truncate"/);

assert.match(table, /flex min-w-0 w-full flex-1 items-center gap-2/);
assert.match(table, /h-1\.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black\/10 dark:bg-white\/15/);
assert.doesNotMatch(table, /min-w-8/);

assert.match(badge, /inline-flex max-w-full min-w-0 font-medium leading-none truncate/);
assert.match(badge, /inline-flex max-w-full min-w-0 cursor-default/);
assert.doesNotMatch(badge, /cursor-help/);
assert.match(badge, /TooltipProvider delay=\{400\}/);
assert.match(badge, /delay=\{400\}/);

const emptyState = table.slice(table.indexOf("if (torrents.length === 0)"), table.indexOf("const dragFromIndex"));
assert.match(emptyState, /const query = search\.trim\(\)/);
assert.match(emptyState, /torrentSearchEmptyTitle\(search\)/);
assert.match(emptyState, /TORRENT_SEARCH_EMPTY_HINT/);
assert.match(emptyState, /TORRENT_FILTER_EMPTY_TITLE/);
assert.match(emptyState, /TORRENT_FILTER_EMPTY_HINT/);
assert.doesNotMatch(emptyState, /No torrents match this view/);
assert.doesNotMatch(emptyState, /onAddTorrent/);
assert.doesNotMatch(emptyState, /Add torrent/);
assert.match(emptyState, /<Inbox className="size-12 text-muted-foreground" aria-hidden \/>/);
assert.ok(
  emptyState.indexOf("<Inbox") < emptyState.indexOf("torrentSearchEmptyTitle"),
  "empty-state icon sits above the title"
);

const limitA = { name: "a" } as TorrentStatus;
const limitB = { name: "b" } as TorrentStatus;
const limitById = new Map([
  ["a", limitA],
  ["b", limitB],
]);
assert.deepEqual(contextLimitTorrents("b", limitB, new Set(["a"]), limitById), [limitB]);
assert.deepEqual(contextLimitTorrents("a", limitA, new Set(["a", "b"]), limitById), [limitA, limitB]);
assert.deepEqual(contextLimitTorrents("a", limitA, new Set(["a", "missing"]), limitById), [limitA]);

console.log("torrent-table cell truncation tests passed");
