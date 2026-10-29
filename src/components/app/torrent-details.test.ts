import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const details = readFileSync(join(dir, "torrent-details.tsx"), "utf8");
const tree = readFileSync(join(dir, "torrent-file-tree.tsx"), "utf8");
const icons = readFileSync(join(dir, "file-tree-icons.tsx"), "utf8");

assert.match(details, /from "@\/components\/app\/torrent-file-tree"/);
assert.match(details, /key=\{torrentId\}/);
assert.match(details, /<FileTree/);
assert.doesNotMatch(details, /function FileTree/);

assert.match(details, /InspectorStatusBar/);
assert.match(details, /aria-label="Close inspector"/);
assert.match(details, /aria-label=\{label\}/);
assert.match(details, /paused=\{torrentIsPaused\(detail\?\.state\)\}/);
assert.match(details, /currentTab === "files"/);
assert.match(details, /currentTab === "peers"/);
assert.match(details, /currentTab === "trackers"/);
assert.doesNotMatch(details, /web\.get_torrent_status",\s*\n?\s*\[torrentId, \[\]\]/);
assert.match(details, /paused \?/);
assert.match(details, /core\.pause_torrent/);
assert.match(details, /core\.resume_torrent/);
assert.match(details, /core\.queue_top/);
assert.match(details, /core\.force_recheck/);
assert.match(details, /label="Remove"/);
assert.match(details, /label="Move storage"/);
assert.match(details, /label="Force recheck"/);
assert.match(details, /variant="destructive"/);
assert.ok(
  details.indexOf('label="Force recheck"') < details.indexOf('label="Remove"'),
  "inspector Remove sits last after Force recheck"
);
{
  const bar = details.slice(
    details.indexOf("function InspectorActionBar"),
    details.indexOf("function InspectorAction({")
  );
  assert.ok(
    bar.lastIndexOf('label="Remove"') > bar.lastIndexOf('label="Force recheck"'),
    "Remove is the last inspector toolbar action"
  );
  assert.match(bar, /variant="destructive"/);
}
assert.match(details, /function InspectorTabs/);
assert.match(details, /function InspectorActionBar/);
assert.match(details, /<InspectorTabs/);
assert.match(details, /actions=\{/);
assert.doesNotMatch(details, /function InspectorTab\b/);
assert.doesNotMatch(details, /<Activity \/>/);
assert.doesNotMatch(details, /<FolderTree \/>/);
assert.doesNotMatch(details, /<Users \/>/);
assert.doesNotMatch(details, /<Settings2 \/>/);
assert.doesNotMatch(details, /<Radio \/>/);
assert.doesNotMatch(details, /flex-col gap-1\.5 rounded-xl/);
assert.doesNotMatch(details, /text-\[11px\] font-medium leading-none/);
assert.match(details, /bg-background/);
assert.match(details, /size="icon-xs"/);
assert.match(details, /size="icon-sm"/);
assert.doesNotMatch(details, /size="icon"(?!-)/);
assert.match(details, /TooltipContent/);
assert.match(details, /variant === "dialog" \? "p-4" : "p-3"/);
assert.ok(
  details.indexOf("title={name}") < details.indexOf('label="Pause"'),
  "inspector title sits above the tab-row actions"
);
{
  const start = details.indexOf("function InspectorStatusBar");
  const end = details.indexOf("\nfunction ", start + 1);
  const headerFn = details.slice(start, end);
  assert.doesNotMatch(headerFn, /StateBadge/);
  assert.doesNotMatch(headerFn, /label="Pause"/);
  assert.doesNotMatch(headerFn, /bg-muted\/50/);
  assert.match(headerFn, /bg-background/);
}
{
  const start = details.indexOf("function InspectorAction({");
  const end = details.indexOf("\nfunction ", start + 1);
  const actionFn = details.slice(start, end);
  assert.doesNotMatch(actionFn, /flex-col/);
  assert.match(actionFn, /size="icon-xs"/);
}
assert.match(details, /DetailsHeader/);
assert.match(details, /DetailsDockControl/);
assert.match(details, /Display at bottom/);
assert.match(details, /Display on the right/);
assert.match(details, /aria-label="Details layout"/);
assert.match(details, /aria-label="Close details"/);
assert.match(details, /MoreHorizontal/);
assert.match(details, /PanelBottom/);
assert.match(details, /PanelRight/);
assert.match(details, /DropdownMenuRadioGroup/);
assert.match(details, /ContextMenuRadioGroup/);
assert.match(details, /min-w-56/);
assert.match(details, /variant === "dialog"/);
assert.doesNotMatch(details, /line-clamp-2 min-w-0 break-all font-mono/);
assert.match(details, /overlayTorrentStatus/);
assert.match(details, /normalizeTorrentStatus/);
assert.match(details, /setDetail\(normalizeTorrentStatus\(status\)\)/);
assert.doesNotMatch(details, /dangerouslySetInnerHTML/);
assert.match(details, /TabsTrigger value="status"/);
assert.match(details, /TabsTrigger value="files"/);
assert.match(details, /TabsTrigger value="peers"/);
assert.match(details, /TabsTrigger value="options"/);
assert.match(details, /TabsTrigger value="trackers"/);
assert.match(details, /QUICK_INSPECT_TAB_CLASS/);
assert.match(details, /rounded-lg border-0/);
assert.match(details, /text-\[13px\] font-normal text-muted-foreground/);
assert.match(details, /after:hidden/);
assert.match(details, /hover:bg-muted\/50 hover:text-muted-foreground/);
assert.match(details, /data-active:bg-muted data-active:font-normal/);
assert.match(details, /data-active:hover:bg-muted data-active:hover:text-foreground/);
assert.match(details, /group-data-\[variant=default\]\/tabs-list:data-active:shadow-none/);
assert.match(details, /h-8 w-max items-center justify-start gap-0\.5 rounded-none/);
assert.doesNotMatch(details, /hover:text-foreground\/80/);
assert.doesNotMatch(details, /justify-start gap-2 rounded-none/);
assert.match(details, /overflow-hidden px-2 py-1/);
assert.doesNotMatch(details, /overflow-hidden border-b px-2 py-1/);
assert.doesNotMatch(details, /data-active:font-semibold/);
assert.doesNotMatch(details, /data-active:border-border/);
assert.doesNotMatch(details, /variant="line"/);
assert.doesNotMatch(details, /after:h-0\.5 after:bg-foreground/);
assert.doesNotMatch(details, /min-w-full justify-start/);
assert.doesNotMatch(details, /overflow-x-auto border-b px-2 pt-1/);
assert.match(details, /@container flex h-full min-h-0 min-w-0/);
assert.match(details, /flex min-w-0 flex-col border-b bg-background/);
assert.match(details, /@min-\[36rem\]:flex-row @min-\[36rem\]:items-center/);
assert.match(details, /@min-\[36rem\]:pl-1\.5 @min-\[36rem\]:pr-3/);
assert.doesNotMatch(details, /border-b bg-background px-3/);
assert.doesNotMatch(details, /flex min-w-0 items-center gap-2 border-b bg-background pl-1\.5 pr-3/);
assert.match(details, /overflow-x-auto overscroll-x-contain/);
assert.match(details, /border-t px-2 py-1 @min-\[36rem\]:border-t-0/);
assert.doesNotMatch(details, /@min-\[480px\]:grid-cols-2/);
assert.doesNotMatch(details, /items-baseline justify-between/);
assert.doesNotMatch(details, /min-w-0 text-right tabular/);
assert.doesNotMatch(details, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
assert.match(details, /grid min-w-0 grid-cols-\[38%_1fr\] gap-x-3/);
assert.doesNotMatch(details, /grid min-w-0 grid-cols-2 gap-x-3/);
assert.match(details, /min-w-0 text-left tabular/);
assert.match(details, /min-w-0 text-left text-muted-foreground/);
assert.match(details, /text-sm @min-\[36rem\]:text-\[15px\]/);
assert.doesNotMatch(details, /@min-\[36rem\]:text-base/);
assert.match(details, /large=\{variant === "dialog"\}/);
assert.doesNotMatch(details, /border-b pb-1 font-semibold/);
assert.match(details, /font-semibold text-foreground/);
assert.match(details, /grid min-w-0 divide-y/);
assert.match(details, /py-4 first:pt-0 last:pb-0/);
assert.match(details, /title="Transfer"/);
assert.match(details, /title="State"/);
assert.match(details, /title="Times"/);
assert.match(details, /title="Paths"/);
assert.doesNotMatch(details, /@min-\[360px\]:grid-cols-2/);
assert.doesNotMatch(details, /@min-\[640px\]:grid-cols-3/);
assert.match(details, /@min-\[520px\]:hidden/);
assert.match(details, /overflow-x-auto @min-\[520px\]:block/);
assert.match(details, /min-w-0 truncate py-1 pr-2 font-mono text-xs" title=\{t\.url\}/);
assert.doesNotMatch(details, /hash=\{torrentId\}/);
assert.doesNotMatch(details, /sm:grid-cols-2 lg:grid-cols-3/);

const options = readFileSync(join(dir, "torrent-options-form.tsx"), "utf8");
assert.match(options, /@min-\[440px\]:grid-cols-2/);
assert.doesNotMatch(options, /@min-\[40rem\]:grid-cols-4/);
assert.doesNotMatch(options, /grid-cols-4/);
assert.match(options, /col-span-full/);
assert.doesNotMatch(options, /@min-\[440px\]:col-span-2/);
assert.match(options, /min-w-0 w-full font-mono/);
assert.match(options, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
assert.match(options, /optionLimitInput\(torrent\.max_connections\)/);
assert.match(options, /optionLimitInput\(torrent\.max_upload_slots\)/);
assert.match(options, /placeholder="Unlimited"/);
assert.match(details, /key=\{`\$\{torrentId\}:\$\{typeof detail\.max_connections === "number"/);
assert.doesNotMatch(options, /String\(torrent\.max_connections\)/);
assert.doesNotMatch(options, /String\(torrent\.max_upload_slots\)/);
assert.doesNotMatch(options, /md:grid-cols-2/);

assert.match(tree, /from "@\/components\/app\/file-tree-icons"/);
assert.match(tree, /FileKindIcon/);
assert.match(tree, /FolderTreeIcon/);
assert.match(tree, /from "lucide-react"/);
assert.match(tree, /ChevronDown/);
assert.match(tree, /ChevronRight/);
assert.match(tree, /defaultFolderExpanded\(depth, huge\)/);
assert.match(tree, /isHugeFileTree\(node\)/);
assert.match(tree, /aria-expanded=\{open\}/);
assert.doesNotMatch(tree, /inline-block size-6 shrink-0/);
assert.match(tree, /open \? "ml-3 min-w-0 overflow-hidden border-l pl-3" : "hidden"/);
assert.match(tree, /min-w-0 truncate/);
assert.doesNotMatch(tree, /@min-\[420px\]:w-36/);
assert.doesNotMatch(tree, /FILE_PRIORITY_CLASS/);
assert.match(tree, /@min-\[420px\]:hidden/);
assert.match(tree, /FilePrioritySelect/);
assert.match(tree, /core\.set_torrent_file_priorities/);
assert.match(tree, /canonicalizeFilePriority/);
assert.doesNotMatch(tree, /core\.set_file_priorities/);

assert.match(icons, /from "lucide-react"/);
assert.match(icons, /Captions/);
assert.match(icons, /Disc3/);
assert.match(icons, /FileArchive/);
assert.match(icons, /FileImage/);
assert.match(icons, /FileMusic/);
assert.match(icons, /Film/);
assert.match(icons, /FolderOpen/);
assert.match(icons, /\bFolder\b/);
assert.match(icons, /size-3\.5 shrink-0 text-muted-foreground/);
assert.match(icons, /fileIconKind\(name\)/);
assert.match(icons, /video: Film/);
assert.match(icons, /audio: FileMusic/);
assert.match(icons, /image: FileImage/);
assert.match(icons, /archive: FileArchive/);
assert.match(icons, /subtitle: Captions/);
assert.match(icons, /disk: Disc3/);
assert.match(icons, /file: File/);

console.log("torrent-details files tree tests passed");
