import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "torrent-dialogs.tsx"), "utf8");
const addSource = readFileSync(join(dir, "add-torrent-dialog.tsx"), "utf8");
const details = readFileSync(join(dir, "torrent-details.tsx"), "utf8");

const addDialog = addSource.slice(
  addSource.indexOf("export function AddTorrentDialog"),
  addSource.indexOf("function SourcePromptDialog")
);
const sourcePrompt = addSource.slice(
  addSource.indexOf("function SourcePromptDialog"),
  addSource.indexOf("function QueuePane")
);
const queuePane = addSource.slice(
  addSource.indexOf("function QueuePane"),
  addSource.indexOf("function AddDialogActions")
);
const properties = addSource.slice(
  addSource.indexOf("function PropertiesPane"),
  addSource.indexOf("function TorrentPreviewCard")
);
const preview = addSource.slice(
  addSource.indexOf("function TorrentPreviewCard"),
  addSource.indexOf("function AddFilesTree")
);
const tree = addSource.slice(addSource.indexOf("function AddFilesTree"));

assert.match(addSource, /export const ADD_POPOVER_CLASS/);
assert.match(addDialog, /ADD_POPOVER_CLASS/);
assert.match(addSource, /min\(43rem/);
assert.doesNotMatch(addSource, /min\(48rem/);
assert.match(addSource, /h-\[min\(33\.75rem/);
assert.doesNotMatch(addSource, /min\(40rem/);
assert.doesNotMatch(addSource, /min\(44rem/);
assert.match(queuePane, /sm:w-\[15\.5rem\]/);
assert.match(queuePane, /sm:min-w-\[15\.5rem\]/);
assert.match(queuePane, /sm:max-w-\[15\.5rem\]/);
assert.match(queuePane, /sm:flex-none/);
assert.doesNotMatch(queuePane, /sm:w-72/);
assert.doesNotMatch(queuePane, /sm:w-80/);
assert.match(addSource, /100svh/);
assert.doesNotMatch(addSource, /ADD_DIALOG_CLASS/);
assert.match(addDialog, /<Popover/);
assert.match(addDialog, /details\.reason === "focus-out"/);
assert.match(addDialog, /details\.cancel\(\)/);
assert.match(addDialog, /submittingRef/);
assert.match(addDialog, /if \(open \|\| submittingRef\.current\) return/);
assert.match(addDialog, /toAdd\.some\(\(item\) => !item\.path\)/);
assert.match(addDialog, /PopoverTrigger/);
assert.match(addDialog, /PopoverContent/);
assert.match(addDialog, /align="end"/);
assert.match(addDialog, /<PopoverTitle className="sr-only">Add torrent<\/PopoverTitle>/);
assert.doesNotMatch(addDialog, /<Dialog /);
assert.doesNotMatch(addDialog, /DialogTrigger/);
assert.doesNotMatch(addDialog, /DialogHeader className="shrink-0 border-b/);
assert.doesNotMatch(addDialog, /<DialogFooter/);
assert.match(addDialog, /PREF_DIALOG_SPLIT_CLASS/);
assert.match(addDialog, /<QueuePane/);
assert.match(addDialog, /<PropertiesPane/);
assert.match(addDialog, /<SourcePromptDialog/);

assert.doesNotMatch(addSource, /ADD_PILL_TAB_CLASS/);
assert.doesNotMatch(addSource, /TabsContent/);
assert.doesNotMatch(addSource, /TabsList/);
assert.doesNotMatch(addSource, /TabsTrigger/);
assert.doesNotMatch(addSource, /setTab\(/);
assert.doesNotMatch(addSource, /useState<AddTab>/);
assert.doesNotMatch(addSource, /Choose torrent files/);
assert.doesNotMatch(addSource, /chooseFileRef/);
assert.match(details, /QUICK_INSPECT_TAB_CLASS/);
assert.match(details, /h-7 flex-none rounded-lg border-0/);

assert.match(addDialog, /<Plus \/>/);
assert.match(addDialog, /hidden xl:inline/);
assert.match(addDialog, /title=\{label\}/);
assert.match(addDialog, /aria-label=\{label\}/);
assert.match(addSource, /h-8 min-w-0 shrink-0 px-2 xl:shrink xl:px-2.5/);
assert.match(addDialog, /ADD_TOOLBAR_TRIGGER_CLASS/);
assert.match(addDialog, /sourceMenuOpen/);
assert.match(addDialog, /onSourceMenuOpenChange/);
assert.match(addDialog, /function revealPanel/);
assert.match(addDialog, /if \(!open\) onOpenChange\(true\)/);
assert.match(addDialog, /function pickDefaultAdd/);
assert.match(addDialog, /onClick=\{pickDefaultAdd\}/);
assert.match(addDialog, /pickDefaultAddRef\.current = pickDefaultAdd/);
assert.match(addDialog, /aria-label="More ways to add a torrent"/);
assert.match(addDialog, /<DropdownMenu open=\{sourceMenuOpen\}/);
assert.match(addDialog, /<DropdownMenuTrigger/);
assert.ok(
  addDialog.indexOf('id="add-torrent-file"') < addDialog.indexOf("<Popover"),
  "file input lives at the dialog root so the toolbar File action can click it"
);
assert.match(addDialog, /revealPanel\(\)/);
assert.doesNotMatch(addDialog, /Add torrent…/);

assert.match(addDialog, /id="add-torrent-file"/);
assert.match(addDialog, /multiple/);
assert.match(addSource, /advancedOpen/);
assert.match(properties, /aria-expanded=\{advancedOpen\}/);
assert.match(properties, /text-sm font-medium text-muted-foreground/);
assert.doesNotMatch(properties, /hover:bg-muted/);
assert.doesNotMatch(properties, /hover:bg-sidebar-accent/);
assert.doesNotMatch(properties, /uppercase/);
assert.match(properties, /<span className="min-w-0 flex-1 truncate">Advanced<\/span>/);
assert.doesNotMatch(addSource, /Advanced settings/);
assert.doesNotMatch(properties, /rounded-md border border-border bg-muted\/40/);
assert.ok(
  properties.indexOf("<TorrentPreviewCard") < properties.indexOf("add-advanced-fields"),
  "file preview sits above the Advanced foldout"
);
assert.match(addSource, /function AddDialogActions[\s\S]*bg-popover/);
assert.doesNotMatch(
  addSource.slice(addSource.indexOf("function AddDialogActions"), addSource.indexOf("function AdvancedSwitch")),
  /bg-muted/
);
assert.match(addSource, /Notify when this download finishes/);
assert.match(addSource, /add-notify-hint/);
assert.match(addDialog, /loadNotifyOnComplete/);
assert.match(addDialog, /requestNotifyPermissionFromGesture/);
assert.match(addDialog, /function requestNotifyIfNeeded/);
assert.match(addDialog, /NOTIFY_INSECURE_CONTEXT_MESSAGE/);
assert.match(addDialog, /isNotifySecureContext/);
assert.match(addDialog, /beginNotifyAdd/);
assert.match(addDialog, /registerNotifyTorrentIds/);
assert.ok(
  addDialog.indexOf("if (wantsNotify)") < addDialog.indexOf("setBusy(true)") &&
    addDialog.slice(addDialog.indexOf("if (wantsNotify)"), addDialog.indexOf("setBusy(true)")).includes(
      "requestNotifyIfNeeded"
    ),
  "notify permission is requested before setBusy / RPC so the user gesture is still valid"
);
assert.ok(
  addDialog.indexOf("void requestNotifyIfNeeded()") < addDialog.indexOf("setBusy(true)"),
  "submit does not await permission before starting the add"
);
{
  const submitStart = addDialog.indexOf("async function addFileUrlBatch");
  const submitFn = addDialog.slice(submitStart, addDialog.indexOf("return (", submitStart));
  assert.match(submitFn, /} finally \{\s*submittingRef\.current = false;\s*setBusy\(false\);/);
  assert.doesNotMatch(submitFn, /auth\.login/);
  assert.doesNotMatch(submitFn, /web\.connect/);
  assert.match(submitFn, /rpc\("web\.add_torrents"/);
}
assert.doesNotMatch(addDialog, /await enableNotifyFromGesture/);
assert.doesNotMatch(addDialog, /await requestNotifyPermissionFromGesture/);
assert.match(addDialog, /onNotifyGesture=\{\(\) => void requestNotifyIfNeeded\(\)\}/);
assert.match(properties, /onPointerDown=/);
assert.match(properties, /onNotifyGesture\(\)/);
assert.match(properties, /onKeyDown=/);
assert.doesNotMatch(addSource, /notifyPermissionHint/);
assert.match(addSource, /id="add-notify-hint" className="sr-only"/);
assert.doesNotMatch(addSource, /Your browser will ask for permission/);
assert.match(source, /rememberRemovedTorrentIds/);

const fileInput = addDialog.slice(
  addDialog.indexOf("<input"),
  addDialog.indexOf("{error ?")
);
assert.match(fileInput, /type="file"/);
assert.match(fileInput, /multiple/);
assert.match(fileInput, /tabIndex=\{-1\}/);
assert.match(fileInput, /className="hidden"/);
assert.doesNotMatch(fileInput, /autoFocus/);

const addError = addDialog.slice(
  addDialog.indexOf("{error ?"),
  addDialog.indexOf("PREF_DIALOG_SPLIT_CLASS")
);
assert.match(addError, /<AddErrorAlert/);
assert.match(addError, /rounded-none border-x-0 border-t-0 bg-destructive\/10 px-4 py-2\.5/);
assert.doesNotMatch(addError, /mx-4/);
assert.match(addSource, /function AddErrorAlert/);
assert.match(addSource, /min-w-0 max-w-full shrink-0/);
assert.match(addSource, /min-w-0 text-wrap break-words/);
assert.match(sourcePrompt, /<AddErrorAlert id="add-source-error"/);
assert.match(sourcePrompt, /grid min-w-0 gap-3/);
assert.doesNotMatch(sourcePrompt, /className="text-sm text-destructive"/);

assert.match(queuePane, /id="add-torrent-source"/);
assert.match(queuePane, /Add torrent/);
assert.match(queuePane, /<DropdownMenu/);
assert.match(queuePane, /<AddSourceMenuItems/);
assert.match(addSource, /<File \/> File/);
assert.match(addSource, /<Magnet \/> Magnet/);
assert.match(addSource, /<Link \/> URL/);
assert.match(queuePane, /onPickFiles/);
assert.match(queuePane, /onPickMagnet/);
assert.match(queuePane, /onPickUrl/);
assert.match(queuePane, /shrink-0 p-2/);
assert.doesNotMatch(queuePane, /border-t p-2/);
assert.match(queuePane, /Drop \.torrent files here/);
assert.match(addDialog, /fileInputRef\.current\?\.click\(\)/);
assert.match(addDialog, /setSourcePrompt\("magnet"\)/);
assert.match(addDialog, /setSourcePrompt\("url"\)/);
assert.match(addDialog, /initialFocus=\{locationInputRef\}/);
assert.match(addDialog, /locationInputRef\.current/);
assert.match(addDialog, /input\.focus\(\)/);
assert.match(addDialog, /input\.select\(\)/);
assert.match(addDialog, /requestAnimationFrame/);
assert.match(properties, /ref=\{locationInputRef\}/);
assert.match(queuePane, /ref=\{addSourceRef\}/);
assert.doesNotMatch(queuePane, /autoFocus/);

assert.match(sourcePrompt, /id="add-source-magnet"/);
assert.match(sourcePrompt, /id="add-source-url"/);
assert.match(sourcePrompt, /<DialogTitle>\{isMagnet \? "Add magnet" : "Add URL"\}<\/DialogTitle>/);
assert.match(sourcePrompt, /<Textarea/);
assert.match(sourcePrompt, /<Input/);
assert.match(sourcePrompt, /<Button type="submit">Add<\/Button>/);
assert.match(sourcePrompt, /event\.stopPropagation\(\)/);

assert.match(addSource, /<TorrentPreviewCard/);
assert.match(properties, /locked=\{items\.length > 1\}/);
assert.doesNotMatch(properties, /\{single \? \(/);
assert.match(addDialog, /sessionGen/);
assert.match(addDialog, /onAdded\?: \(\) => void/);
assert.match(addDialog, /web\.add_torrents/);
assert.match(addDialog, /items\.map\(\(item\) => \(\{ path: item\.path, options: optionsFromPending\(item\) \}\)\)/);
assert.match(addDialog, /toast\.success\(addSuccessToast\(fresh\.length\)\)/);
assert.match(addDialog, /onOpenChange\(false\)/);
assert.match(addDialog, /addSubmitBatches\(fresh\)/);
assert.match(addDialog, /remainingAfterPartialAdd\(prev, succeededIds\)/);
assert.match(addDialog, /addPartialFailureMessage\(/);
assert.equal(
  [...addDialog.matchAll(/onAdded\?\.\(\)/g)].length,
  2,
  "onAdded runs on full success and after a partial add so the list can refresh"
);
assert.doesNotMatch(addDialog, /onCancel=\{\(\) => \{\s*onAdded/);

assert.match(addSource, /role="listbox"/);
assert.match(addSource, /aria-multiselectable="true"/);
assert.match(addSource, /No torrent file added\./);
assert.match(queuePane, /bg-sidebar text-sidebar-foreground/);
assert.match(queuePane, /flex items-center justify-center/);
assert.match(queuePane, /text-center/);
assert.match(properties, /Editing torrent/);
assert.match(properties, /Editing \$\{items\.length\} torrents/);
assert.match(addSource, /Multiple values/);
assert.match(addSource, /metaKey \|\| event\.ctrlKey/);
assert.match(addSource, /event\.shiftKey/);

assert.doesNotMatch(queuePane, /Select all torrents/);
assert.doesNotMatch(queuePane, /onRemoveSelected/);
assert.doesNotMatch(queuePane, /onSelectAll/);
assert.doesNotMatch(queuePane, /<Trash2/);
assert.match(queuePane, /Remove \$\{item\.label\}/);

assert.match(properties, /<AddDialogActions/);
assert.match(properties, /canAdd=\{canAdd\}/);
assert.doesNotMatch(addDialog, /<AddDialogActions/);
assert.match(addSource, /function AddDialogActions/);
assert.match(addSource, /type="submit"/);

const notifyRow = properties.slice(
  properties.indexOf("flex min-h-7 items-center justify-between"),
  properties.indexOf("id=\"add-notify-hint\"")
);
assert.match(notifyRow, /<Bell className="size-4 shrink-0 text-muted-foreground" \/>/);
assert.match(notifyRow, /Notify when this download finishes/);
assert.match(notifyRow, /<NotifyTestButton/);
assert.match(addSource, /NotifyTestButton/);
assert.match(readFileSync(join(dir, "notify-test-button.tsx"), "utf8"), /Test notification/);
assert.match(notifyRow, /justify-between/);
assert.ok(
  notifyRow.indexOf("<Bell") < notifyRow.indexOf("Notify when this download finishes") &&
    notifyRow.indexOf("Notify when this download finishes") < notifyRow.indexOf("<Switch"),
  "notify row is icon, label, then switch"
);
assert.match(notifyRow, /\(mixed\)/);
assert.ok(
  properties.indexOf("add-download-location") < properties.indexOf("Notify when this download finishes") &&
    properties.indexOf("Notify when this download finishes") < properties.indexOf("<TorrentPreviewCard"),
  "download location sits above notify, then the file list"
);

assert.doesNotMatch(preview, /text-sm font-medium leading-6/);
assert.doesNotMatch(preview, /title=\{name\}/);
assert.match(preview, /border-t bg-sidebar px-2 py-1\.5 text-xs text-muted-foreground/);
assert.match(preview, /file\$\{fileCount === 1 \? "" : "s"\} · \$\{formatBytes\(infoTreeSize\(tree\)\)\}/);
assert.match(preview, /flex min-w-0 flex-col overflow-hidden rounded-md border/);
assert.match(preview, /rounded-b-md border-t bg-sidebar/);
assert.doesNotMatch(preview, /rounded-lg border p-3/);
assert.doesNotMatch(preview, /infoHash/);
assert.doesNotMatch(preview, /font-mono/);
assert.match(preview, /min-h-40 max-h-56 min-w-0 overflow-auto/);
assert.match(preview, /sm:min-h-56/);
assert.match(preview, /File list will appear here/);
assert.match(preview, /showFileGutter=\{fileCount > 1\}/);
assert.match(preview, /File priorities can’t be changed when several torrents are selected/);
assert.match(preview, /locked/);

assert.match(tree, /flex min-w-0 items-center/);
assert.match(tree, /min-w-0 flex-1 truncate/);
assert.match(tree, /showFileGutter \? <span className="inline-block size-6 shrink-0"/);
assert.match(tree, /FileKindIcon/);
assert.match(tree, /FolderTreeIcon/);
assert.match(tree, /FilePrioritySelect/);

assert.match(source, /if \(open\) setRemoveData\(false\)/);
assert.match(source, /if \(open\) setPath\(currentPath\)/);
assert.match(source, /export \{ AddTorrentDialog, ADD_POPOVER_CLASS \}/);

assert.match(addDialog, /<form/);
assert.match(addDialog, /event\.currentTarget\.requestSubmit\(\)/);
assert.match(addDialog, /event\.target instanceof HTMLInputElement/);
assert.match(addSource, /type="submit"/);
assert.match(addDialog, /type="button"/);
assert.match(addSource, /id="add-download-location"/);
assert.doesNotMatch(
  addDialog,
  /<Button disabled=\{!canAdd\} onClick=\{\(\) => void submit\(\)\}>/
);

console.log("add-torrent dialog width and truncation tests passed");
