import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(dir, "torrent-shell.tsx"), "utf8");
const table = readFileSync(join(dir, "torrent-table.tsx"), "utf8");
const brand = readFileSync(join(dir, "brand.tsx"), "utf8");
const login = readFileSync(join(dir, "login-screen.tsx"), "utf8");

const header = shell.slice(
  shell.indexOf("<header"),
  shell.indexOf("{error ?")
);
const footer = shell.slice(
  shell.indexOf("<footer"),
  shell.indexOf("<Sheet open={sidebarOpen}")
);
const dialogs = readFileSync(join(dir, "add-torrent-dialog.tsx"), "utf8");
const addTrigger = dialogs.slice(
  dialogs.indexOf("<PopoverTrigger"),
  dialogs.indexOf("</PopoverTrigger>")
);

assert.doesNotMatch(shell, /const toolbar =/);
assert.doesNotMatch(header, /flex-wrap/);
assert.match(header, /flex min-h-10 min-w-0 shrink-0 items-center/);
assert.match(header, /wordmarkClassName="hidden sm:inline"/);
assert.match(header, /w-\[min\(20rem,30vw\)\] xl:w-\[min\(24rem,36vw\)\] max-sm:hidden/);
assert.match(header, /sm:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
assert.match(header, /aria-label="Search torrents"/);
assert.match(header, /sm:hidden/);
assert.match(header, /Close search/);
assert.match(header, /<AddTorrentDialog/);
assert.match(header, /<SessionMonitor/);
assert.match(header, /data-session-monitor|isSessionMonitorChipVisible/);
assert.ok(
  header.lastIndexOf("<SearchField") < header.lastIndexOf("<SessionMonitor"),
  "centered search sits left of the stats chip"
);
assert.ok(
  header.lastIndexOf("<SearchField") < header.lastIndexOf("<AddTorrentDialog"),
  "Add torrent sits after search"
);
assert.ok(
  header.lastIndexOf("<SessionMonitor") < header.lastIndexOf("<AddTorrentDialog"),
  "stats chip sits in the right cluster with Add torrent"
);
assert.ok(
  header.lastIndexOf('aria-label="Search torrents"') < header.lastIndexOf("<AddTorrentDialog"),
  "Add torrent sits after the mobile search icon"
);
assert.equal(
  [...header.matchAll(/<AddTorrentDialog/g)].length,
  1,
  "one Add torrent trigger lives in the header"
);

assert.match(dialogs, /<DropdownMenu open=\{sourceMenuOpen\}/);
assert.match(dialogs, /<DropdownMenuTrigger/);
assert.match(addTrigger, /<Plus \/>/);
assert.match(addTrigger, /\{label\}/);
assert.match(addTrigger, /hidden xl:inline/);
assert.match(addTrigger, /title=\{label\}/);
assert.match(addTrigger, /aria-label=\{label\}/);
assert.doesNotMatch(addTrigger, />Add</);
assert.doesNotMatch(addTrigger, /max-\[20rem\]/);
assert.doesNotMatch(addTrigger, /Add torrent…/);
assert.doesNotMatch(addTrigger, /variant=/);
assert.doesNotMatch(addTrigger, /size=/);
assert.doesNotMatch(addTrigger, /disabled/);
assert.match(shell, /className="h-8 min-w-0 pl-7"/);
assert.match(dialogs, /h-8 min-w-0 shrink-0 px-2 xl:shrink xl:px-2.5/);
assert.ok(
  shell.includes('className="h-8 min-w-0 pl-7"') &&
    dialogs.includes("h-8 min-w-0 shrink-0 px-2 xl:shrink xl:px-2.5"),
  "Search input and Add torrent share h-8"
);

assert.doesNotMatch(header, /Queue top/);
assert.doesNotMatch(header, /Queue up/);
assert.doesNotMatch(header, /Queue down/);
assert.doesNotMatch(header, /Queue bottom/);
assert.doesNotMatch(header, /Move storage/);
assert.doesNotMatch(header, /Force recheck/);
assert.doesNotMatch(header, /label="Pause"/);
assert.doesNotMatch(header, /label="Resume"/);
assert.doesNotMatch(header, /label="Remove"/);
assert.doesNotMatch(header, /className="md:hidden"/);
assert.doesNotMatch(header, /className="lg:hidden"/);
assert.doesNotMatch(header, /hidden md:inline-flex/);
assert.doesNotMatch(header, /hidden lg:inline-flex/);

assert.match(header, /Preferences…/);
assert.match(header, /Connection Manager…/);
assert.doesNotMatch(header, /Open hosts page/);
assert.match(shell, /onConnecting=\{beginHostSwitch\}/);
assert.match(shell, /onConnected=\{finishHostSwitch\}/);
assert.match(shell, /onConnectFailed=\{abortHostSwitch\}/);
assert.match(shell, /resetNotifyCompleteMemory/);
assert.match(shell, /switchingHosts/);
assert.match(header, /aria-label="Menu"/);
assert.ok(
  header.indexOf('aria-label="Menu"') < header.indexOf("<Brand"),
  "hamburger sits left of the logo"
);
assert.match(header, /ThemeMenuSub/);
assert.match(header, /About torro/);
assert.doesNotMatch(header, /About Nova/);
assert.doesNotMatch(header, /About torro…/);
assert.ok(
  header.indexOf("About torro") < header.indexOf("Preferences…"),
  "About torro sits above Preferences in the hamburger"
);
assert.doesNotMatch(header, /More actions/);
assert.doesNotMatch(header, /ThemeToggle/);

assert.match(table, /Open inspector\.\.\./);
assert.match(table, /<AppWindow \/> Open inspector\.\.\./);
assert.ok(
  table.indexOf("Open inspector...") < table.indexOf("<Pause /> Pause"),
  "Open inspector sits at the top of the torrent context menu"
);
assert.match(table, /handlersRef.current.openDetails\(id\)/);
assert.match(table, /onDoubleClick=\{\(\) => handlersRef.current.openDetails\(id\)\}/);
assert.match(table, /Open inspector\.\.\./);
assert.match(table, /<AppWindow \/> Open inspector\.\.\./);
assert.ok(
  table.indexOf("Open inspector...") < table.indexOf("<Pause /> Pause"),
  "Open inspector sits at the top of the torrent context menu"
);
assert.match(table, /torrentIsPaused\(torrent\.state\) \?/);
assert.match(table, /<Pause \/> Pause/);
assert.match(table, /<Play \/> Resume/);
assert.match(table, /variant="destructive"/);
assert.match(table, /<Trash2 \/> Remove\.\.\./);
assert.match(table, /<ListOrdered \/> Queue/);
assert.match(table, /<ChevronsUp \/> Top/);
assert.match(table, /<ArrowUp \/> Up/);
assert.match(table, /<ArrowDown \/> Down/);
assert.match(table, /<ChevronsDown \/> Bottom/);
assert.match(table, /<Gauge \/> Limits/);
assert.match(table, /D\/L Speed Limit/);
assert.match(table, /U\/L Speed Limit/);
assert.match(table, /Connection Limit/);
assert.match(table, /Upload Slot Limit/);
assert.match(table, /limitCaps\.connections/);
assert.match(table, /limitCaps\.uploadSlots/);
assert.match(table, /torrentLimitMenuCaps/);
assert.match(table, /handlersRef\.current\.setOptions/);
assert.match(table, /clientKind=\{caps\.kind\}|clientKind=\{clientKind\}/);
assert.match(shell, /clientKind=\{caps\.kind\}/);
assert.match(shell, /core\.set_torrent_options/);
assert.match(table, /<FolderInput \/> Move storage…/);
assert.match(table, /<RefreshCw \/> Force recheck/);
assert.ok(
  table.indexOf("<ListOrdered /> Queue") < table.indexOf("<Gauge /> Limits"),
  "Queue submenu sits above Limits"
);
assert.ok(
  table.indexOf("<ListOrdered /> Queue") < table.indexOf("Remove..."),
  "Remove sits at the bottom of the torrent context menu"
);
assert.ok(
  table.lastIndexOf("<ContextMenuSeparator />") < table.lastIndexOf("<Trash2 /> Remove..."),
  "Remove is in its own section after the last separator"
);

assert.match(footer, /overflow-x-auto/);
assert.match(footer, /flex-wrap/);
assert.match(footer, /showSessionSpeed/);
assert.match(footer, /sm:ml-auto/);

assert.match(shell, /show_session_speed|isWebSessionSpeedVisible|showSessionSpeed/);
assert.match(shell, /w-\[min\(18rem,100%\)\]/);
assert.match(shell, /data-torrent-search/);
assert.match(shell, /decideTorrentSearchFindAction/);
assert.match(shell, /decideAddTorrentShortcutAction/);
assert.match(shell, /isMacPlatform\(navigator\.userAgent\)/);
assert.match(shell, /setSearchExpanded\(true\)/);
assert.match(shell, /torrentSearchShortcutTitle/);
assert.match(shell, /torrentSearchPlaceholder/);
assert.match(shell, /addTorrentShortcutTitle/);
assert.match(shell, /DEFAULT_TORRENT_SEARCH_PLACEHOLDER/);
assert.match(shell, /DEFAULT_ADD_TORRENT_LABEL/);
assert.match(shell, /setSearchPlaceholder\(torrentSearchPlaceholder/);
assert.match(shell, /setAddTorrentLabel\(addTorrentShortcutTitle/);
assert.match(shell, /placeholder=\{placeholder\}/);
assert.match(shell, /focusVisibleTorrentSearch/);
assert.match(shell, /pickDefaultAddRef\.current\?\.\(\)/);
assert.match(shell, /sourceMenuOpen=\{addMenuOpen\}/);
assert.match(shell, /onSourceMenuOpenChange=\{setAddMenuOpen\}/);
assert.doesNotMatch(shell, /setAddOpen\(true\)/);
assert.match(shell, /onAdded=\{\(\) => \{/);
assert.match(shell, /selectSidebarState\(prev, FILTER_DOWNLOADING\)/);
assert.match(shell, /void poll\(\);/);
assert.doesNotMatch(shell, /placeholder="Search torrents"/);
assert.doesNotMatch(shell, /⌥⌘N|Ctrl\+Alt\+N|⌘⇧N|Ctrl\+Shift\+N/);
assert.match(
  table,
  /if \(loading && !hasUi\)/,
  "table first-paint is loading with no UI yet"
);
assert.match(
  shell,
  /const sidebarLoading = loading && !ui/,
  "sidebar loading matches the table first-paint window"
);
assert.equal(
  [...shell.matchAll(/loading=\{sidebarLoading\}/g)].length,
  2,
  "desktop sidebar and mobile filter sheet share the same loading flag"
);

assert.match(brand, /wordmarkClassName/);
assert.match(brand, /min-w-0 truncate font-heading/);
assert.match(brand, /shrink-0/);
assert.match(brand, /\/logo\.svg/);
assert.match(brand, />\s*torro\s*</);
assert.doesNotMatch(brand, /bg-primary text-primary-foreground/);
assert.doesNotMatch(brand, /text-primary/);

assert.doesNotMatch(login, /Connect torro/);
assert.match(login, /minmax\(0,1fr\)/);
assert.match(login, /min-w-0 max-w-\[25rem\]/);
assert.match(login, /px-3 py-8 sm:px-4/);
assert.match(login, /aria-label=\{label\}/);
assert.match(login, /label="Client"/);
assert.match(login, /role="radiogroup"/);
assert.match(login, /role="radio"/);
assert.doesNotMatch(login, /RadioGroupItem/);
assert.doesNotMatch(login, /sr-only/);
assert.match(login, /<Brand markClassName="size-9" \/>[\s\S]*<Card /);
assert.match(login, /public\/clients\/deluge\.png/);
assert.match(login, /public\/clients\/transmission\.png/);
assert.match(login, /public\/clients\/qbittorrent\.png/);
assert.doesNotMatch(login, /icon: "\/clients\//);
assert.match(login, /Web URL/);
assert.doesNotMatch(login, /Deluge Web URL|Transmission RPC URL|qBittorrent Web URL/);
assert.doesNotMatch(login, /Deluge Web password/);
assert.match(login, />Password</);
assert.match(login, /Demo mode/);
assert.match(login, /flex gap-2\.5[\s\S]*Demo mode[\s\S]*Sign in/);
assert.doesNotMatch(login, /flex gap-2\.5[\s\S]*Sign in[\s\S]*Demo mode/);
assert.doesNotMatch(login, /Try demo/);
assert.match(login, /h-10 min-w-0 flex-1/);
assert.match(login, /Sample library/);
assert.match(login, /Load test/);
assert.match(login, /Torrent count/);
assert.match(login, /nova:admin-demo|setStoredAdminDemo|admin-demo/);
assert.match(login, /stripExplicitPort/);
assert.match(login, /submitFormOnInputEnter/);
assert.match(login, /type="submit"/);
assert.doesNotMatch(login, /Admin: synthetic session/);

assert.match(shell, /isSessionExpiredMessage/);
assert.match(shell, /auth\.check_session/);
assert.match(shell, /visibilitychange/);
assert.match(shell, /onLogoutRef\.current\(\)/);
assert.match(shell, /GRID_POLL_MS = 2000/);
assert.match(shell, /pollInFlight/);
assert.match(shell, /uiRevision/);
assert.match(shell, /uiRevision: uiRevision.current/);

console.log("torrent-shell toolbar breakpoint tests passed");
