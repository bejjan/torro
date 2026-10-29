"use client";

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { Bell, ChevronDown, ChevronRight, File, Link, Loader2, Magnet, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { FileKindIcon, FolderTreeIcon } from "@/components/app/file-tree-icons";
import { NotifyTestButton } from "@/components/app/notify-test-button";
import { FilePrioritySelect } from "@/components/app/file-priority-select";
import { PREF_DIALOG_SPLIT_CLASS } from "@/components/app/pref-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  VIEWPORT_DIALOG_MAX_H,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { clientCapabilities, DelugeError, getStoredClientKind, rpc, uploadTorrent } from "@/lib/deluge/client";
import { formatBytes } from "@/lib/deluge/format";
import {
  ADD_CONFIG_KEYS,
  ALREADY_IN_SESSION_ERROR,
  addButtonLabel,
  addPartialFailureMessage,
  addSubmitBatches,
  addSuccessToast,
  alreadyInSessionMessage,
  canSubmitQueue,
  createPendingAdd,
  defaultsFromConfig,
  emptyDefaults,
  findDuplicate,
  mixedField,
  optionsFromPending,
  parseMagnetLines,
  patchPendingAdds,
  readyAdds,
  remainingAfterPartialAdd,
  sessionHasInfoHash,
  splitAlreadyInSession,
  removePendingAdds,
  selectionAfterRemove,
  sourceHint,
  torrentFilesFromList,
  urlBasename,
  type PendingAdd,
  type PendingAddDefaults,
  type PendingAddForm,
} from "@/lib/deluge/add-torrent-queue";
import {
  commonPriority,
  infoFileIndexes,
  infoTreeSize,
  initialFilePriorities,
  isMagnetUri,
  normalizeFilesTree,
  parseMagnetInfoHash,
  setPrioritiesForIndexes,
  type TorrentFileInfo,
  type TorrentInfoDir,
  type TorrentInfoNode,
} from "@/lib/deluge/files-tree";
import { DEFAULT_ADD_TORRENT_LABEL } from "@/lib/deluge/escape-selection";
import {
  idsBetween,
  resolveRangeAnchor,
} from "@/lib/deluge/selection";
import {
  beginNotifyAdd,
  cancelNotifyAdd,
  extractAddedTorrentIds,
  isNotifySecureContext,
  loadNotifyOnComplete,
  NOTIFY_INSECURE_CONTEXT_MESSAGE,
  registerNotifyTorrentIds,
  requestNotifyPermissionFromGesture,
  saveNotifyOnComplete,
  torrentIdsFromAddForm,
} from "@/lib/notify-complete";
import { cn } from "@/lib/utils";

export const ADD_POPOVER_CLASS = cn(
  "flex w-[min(43rem,calc(100vw-1.5rem))] min-w-0 flex-col gap-0 overflow-hidden p-0",
  VIEWPORT_DIALOG_MAX_H,
  "h-[min(33.75rem,calc(100svh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
);

function errMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function AddErrorAlert({
  id,
  message,
  className,
}: {
  id?: string;
  message: string;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={cn("min-w-0 max-w-full shrink-0", className)}>
      <AlertDescription id={id} className="min-w-0 text-wrap break-words">
        {message}
      </AlertDescription>
    </Alert>
  );
}

const ADD_TOOLBAR_TRIGGER_CLASS = "h-8 min-w-0 shrink-0 px-2 xl:shrink xl:px-2.5";

export function AddTorrentDialog({
  open,
  onOpenChange,
  sourceMenuOpen: sourceMenuOpenProp,
  onSourceMenuOpenChange,
  pickDefaultAddRef,
  defaultPath,
  existingTorrentIds,
  label = DEFAULT_ADD_TORRENT_LABEL,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceMenuOpen?: boolean;
  onSourceMenuOpenChange?: (open: boolean) => void;
  /** Called from the add shortcut so the file picker stays inside the key gesture. */
  pickDefaultAddRef?: RefObject<(() => void) | null>;
  defaultPath: string;
  /** Info-hashes already loaded. Deluge never answers an add for one of these. */
  existingTorrentIds?: readonly string[];
  label?: string;
  onAdded?: () => void;
}) {
  const [queue, setQueue] = useState<PendingAdd[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourcePrompt, setSourcePrompt] = useState<"magnet" | "url" | null>(null);
  const [defaults, setDefaults] = useState<PendingAddDefaults>(() =>
    emptyDefaults(defaultPath, false)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [uncontrolledSourceMenuOpen, setUncontrolledSourceMenuOpen] = useState(false);
  const sourceMenuOpen = sourceMenuOpenProp ?? uncontrolledSourceMenuOpen;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addSourceRef = useRef<HTMLButtonElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const rangeAnchorRef = useRef<string | null>(null);
  const sessionGen = useRef(0);
  const submittingRef = useRef(false);
  const caps = clientCapabilities(getStoredClientKind());

  function setSourceMenuOpen(next: boolean) {
    if (sourceMenuOpenProp === undefined) setUncontrolledSourceMenuOpen(next);
    onSourceMenuOpenChange?.(next);
  }

  function pickDefaultAdd() {
    fileInputRef.current?.click();
  }

  if (pickDefaultAddRef) pickDefaultAddRef.current = pickDefaultAdd;

  function revealPanel() {
    setSourceMenuOpen(false);
    if (!open) onOpenChange(true);
  }

  useEffect(() => {
    if (open || submittingRef.current) return;
    sessionGen.current += 1;
    setQueue([]);
    setSelected(new Set());
    rangeAnchorRef.current = null;
    setFileDragOver(false);
    setAdvancedOpen(false);
    setSourcePrompt(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open && !sourceMenuOpen) return;
    const gen = sessionGen.current;
    const notify = loadNotifyOnComplete();
    setDefaults(emptyDefaults(defaultPath, notify));
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await rpc<Record<string, unknown>>("core.get_config_values", [
          [...ADD_CONFIG_KEYS],
        ]);
        if (cancelled || gen !== sessionGen.current) return;
        setDefaults(defaultsFromConfig(cfg, defaultPath, notify));
      } catch {
        if (!cancelled && gen === sessionGen.current) {
          setDefaults(emptyDefaults(defaultPath, notify));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sourceMenuOpen, defaultPath]);

  const ids = queue.map((item) => item.id);
  const selectedItems = queue.filter((item) => selected.has(item.id));
  const ready = readyAdds(queue);
  const canAdd = canSubmitQueue(queue, busy);
  const hasSelection = selectedItems.length > 0;

  useEffect(() => {
    if (!open || sourcePrompt || !hasSelection) return;
    const frame = requestAnimationFrame(() => {
      const input = locationInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, sourcePrompt, hasSelection]);

  function selectNewItems(items: PendingAdd[]) {
    if (!items.length) return;
    setSelected(new Set(items.map((item) => item.id)));
    rangeAnchorRef.current = items[items.length - 1]?.id ?? null;
  }

  function clickQueueRow(id: string, event: MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      rangeAnchorRef.current = id;
      return;
    }
    if (event.shiftKey) {
      const anchorId = resolveRangeAnchor(ids, rangeAnchorRef.current, [...selected][0] ?? null);
      if (anchorId) {
        rangeAnchorRef.current = anchorId;
        setSelected(new Set(idsBetween(ids, anchorId, id)));
        return;
      }
    }
    rangeAnchorRef.current = id;
    setSelected(new Set([id]));
  }

  function removeIds(removed: Set<string>) {
    setSelected((prev) => selectionAfterRemove(queue, prev, removed));
    setQueue((prev) => removePendingAdds(prev, removed));
    setError(null);
  }

  function updateSelected(patch: (item: PendingAdd) => PendingAdd) {
    setQueue((prev) => patchPendingAdds(prev, selected, patch));
  }

  function patchSelectedOptions(partial: Partial<PendingAddForm>) {
    updateSelected((item) => ({ ...item, options: { ...item.options, ...partial } }));
  }

  function requestNotifyIfNeeded() {
    saveNotifyOnComplete(true);
    if (!isNotifySecureContext()) {
      toast.message(NOTIFY_INSECURE_CONTEXT_MESSAGE);
    }
    return requestNotifyPermissionFromGesture();
  }

  function applyNotify(checked: boolean) {
    setDefaults((prev) => ({ ...prev, notifyOnComplete: checked }));
    updateSelected((item) => ({ ...item, notifyOnComplete: checked }));
    saveNotifyOnComplete(checked);
  }

  async function finishItem(
    id: string,
    gen: number,
    next: {
      path: string;
      name: string;
      infoHash: string;
      tree: TorrentInfoDir | null;
      priorities: number[];
    }
  ) {
    if (gen !== sessionGen.current) return;
    let skipped = false;
    setQueue((prev) => {
      if (!prev.some((item) => item.id === id)) return prev;
      if (findDuplicate(prev, next.infoHash, id)) {
        skipped = true;
        return prev.filter((item) => item.id !== id);
      }
      if (sessionHasInfoHash(existingTorrentIds, next.infoHash)) {
        return prev.map((item) =>
          item.id === id
            ? {
                ...item,
                path: next.path,
                label: next.name,
                infoHash: next.infoHash,
                tree: next.tree,
                priorities: next.priorities,
                status: "error" as const,
                error: ALREADY_IN_SESSION_ERROR,
              }
            : item
        );
      }
      return prev.map((item) =>
        item.id === id
          ? {
              ...item,
              path: next.path,
              label: next.name,
              infoHash: next.infoHash,
              tree: next.tree,
              priorities: next.priorities,
              status: "ready",
              error: undefined,
            }
          : item
      );
    });
    if (skipped) {
      setSelected((prev) => {
        const nextSelected = new Set(prev);
        nextSelected.delete(id);
        return nextSelected;
      });
      toast.message(`${next.name} is already in the list`);
    } else if (sessionHasInfoHash(existingTorrentIds, next.infoHash)) {
      toast.error(`${next.name} is already in the session`);
    }
  }

  function failItem(id: string, gen: number, message: string) {
    if (gen !== sessionGen.current) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "error" as const, error: message } : item
      )
    );
  }

  async function resolveFile(id: string, file: File, gen: number) {
    try {
      const path = await uploadTorrent(file);
      if (gen !== sessionGen.current) return;
      const info = await rpc<TorrentFileInfo | false>("web.get_torrent_info", [path]);
      if (gen !== sessionGen.current) return;
      if (!info || typeof info !== "object" || !info.info_hash) {
        throw new DelugeError("Not a valid torrent");
      }
      const tree = normalizeFilesTree(info.files_tree);
      await finishItem(id, gen, {
        path,
        name: info.name || file.name || path.split("/").pop() || "Torrent",
        infoHash: String(info.info_hash),
        tree,
        priorities: initialFilePriorities(tree),
      });
    } catch (err) {
      failItem(id, gen, errMessage(err, "Failed to upload torrent"));
    }
  }

  async function resolveMagnet(id: string, uri: string, gen: number) {
    try {
      const info = await rpc<TorrentFileInfo | Record<string, never>>("web.get_magnet_info", [uri]);
      if (gen !== sessionGen.current) return;
      if (!info || typeof info !== "object" || !("info_hash" in info) || !info.info_hash) {
        throw new DelugeError("Invalid magnet URI");
      }
      const tree = normalizeFilesTree(info.files_tree);
      await finishItem(id, gen, {
        path: uri,
        name: info.name || "Magnet download",
        infoHash: String(info.info_hash),
        tree,
        priorities: tree ? initialFilePriorities(tree) : [],
      });
    } catch (err) {
      failItem(id, gen, errMessage(err, "Failed to parse magnet URI"));
    }
  }

  async function resolveUrl(id: string, source: string, gen: number) {
    try {
      const path = await rpc<string>("web.download_torrent_from_url", [source]);
      if (gen !== sessionGen.current) return;
      if (!path) throw new DelugeError("Failed to download torrent from URL");
      const info = await rpc<TorrentFileInfo | false>("web.get_torrent_info", [path]);
      if (gen !== sessionGen.current) return;
      if (!info || typeof info !== "object" || !info.info_hash) {
        throw new DelugeError("Not a valid torrent");
      }
      const tree = normalizeFilesTree(info.files_tree);
      await finishItem(id, gen, {
        path,
        name: info.name || urlBasename(source),
        infoHash: String(info.info_hash),
        tree,
        priorities: initialFilePriorities(tree),
      });
    } catch (err) {
      failItem(id, gen, errMessage(err, "Failed to download torrent from URL"));
    }
  }

  function addFiles(files: File[]) {
    const picked = torrentFilesFromList(files);
    if (!picked.length) return;
    const gen = sessionGen.current;
    const created = picked.map((file) =>
      createPendingAdd("file", file.name, defaults, { source: file.name, file, status: "loading" })
    );
    setQueue((prev) => [...prev, ...created]);
    selectNewItems(created);
    setError(null);
    revealPanel();
    for (const [index, file] of picked.entries()) {
      void resolveFile(created[index]!.id, file, gen);
    }
  }

  function addMagnetText(text: string): string | null {
    const lines = parseMagnetLines(text);
    if (!lines.length) return "Paste a magnet URI";
    const valid = lines.filter((line) => isMagnetUri(line));
    const invalid = lines.length - valid.length;
    if (!valid.length) return "Paste a magnet URI starting with magnet:?xt=urn:btih:";
    const gen = sessionGen.current;
    const created: PendingAdd[] = [];
    const skipped: string[] = [];
    setQueue((prev) => {
      const next = [...prev];
      for (const line of valid) {
        const hash = parseMagnetInfoHash(line);
        if (hash && findDuplicate(next, hash)) {
          skipped.push(line);
          continue;
        }
        const pending = createPendingAdd("magnet", hash || "Magnet download", defaults, {
          source: line,
          path: line,
          infoHash: hash,
          status: "loading",
        });
        created.push(pending);
        next.push(pending);
      }
      return next;
    });
    if (created.length) {
      selectNewItems(created);
      setError(null);
      revealPanel();
      for (const pending of created) {
        void resolveMagnet(pending.id, pending.path, gen);
      }
    }
    if (skipped.length) {
      toast.message(
        skipped.length === 1 ? "Already in the list" : `${skipped.length} magnets are already in the list`
      );
    }
    if (invalid) toast.message("Some lines were not valid magnet URIs and were skipped");
    if (!created.length && !skipped.length) return "Paste a magnet URI starting with magnet:?xt=urn:btih:";
    return null;
  }

  function addUrl(source: string): string | null {
    const trimmed = source.trim();
    if (!trimmed) return "Paste an HTTP(S) URL to a .torrent file";
    if (isMagnetUri(trimmed)) return "Use Magnet to add magnet URIs";
    const gen = sessionGen.current;
    const pending = createPendingAdd("url", urlBasename(trimmed), defaults, {
      source: trimmed,
      status: "loading",
    });
    setQueue((prev) => [...prev, pending]);
    selectNewItems([pending]);
    setError(null);
    revealPanel();
    void resolveUrl(pending.id, trimmed, gen);
    return null;
  }

  function retryItem(item: PendingAdd) {
    const gen = sessionGen.current;
    setQueue((prev) =>
      prev.map((row) =>
        row.id === item.id ? { ...row, status: "loading", error: undefined } : row
      )
    );
    setError(null);
    if (item.kind === "file" && item.file) void resolveFile(item.id, item.file, gen);
    else if (item.kind === "magnet") void resolveMagnet(item.id, item.path || item.source, gen);
    else void resolveUrl(item.id, item.source, gen);
  }

  async function addFileUrlBatch(items: PendingAdd[]): Promise<string[]> {
    if (!items.length) return [];
    const result = await rpc("web.add_torrents", [
      items.map((item) => ({ path: item.path, options: optionsFromPending(item) })),
    ]);
    return [
      ...extractAddedTorrentIds(result),
      ...items.flatMap((item) => torrentIdsFromAddForm({ infoHash: item.infoHash })),
    ];
  }

  async function submit() {
    const toAdd = readyAdds(queue);
    if (!toAdd.length) return;
    if (toAdd.some((item) => !item.path)) {
      setError("Wait for the torrent contents to load, or add the file again");
      return;
    }
    const { fresh, existing } = splitAlreadyInSession(toAdd, existingTorrentIds);
    if (existing.length) {
      const existingIds = new Set(existing.map((item) => item.id));
      setQueue((prev) =>
        prev.map((item) =>
          existingIds.has(item.id)
            ? { ...item, status: "error" as const, error: ALREADY_IN_SESSION_ERROR }
            : item
        )
      );
      if (!fresh.length) {
        const message = alreadyInSessionMessage(existing.length);
        setError(message);
        toast.error(message);
        return;
      }
    }
    const notifyIds: string[] = [];
    const succeededIds = new Set<string>();
    const wantsNotify = fresh.some((item) => item.notifyOnComplete);
    if (wantsNotify) {
      void requestNotifyIfNeeded();
      beginNotifyAdd();
    }
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { fileNotify, fileSilent, magnets } = addSubmitBatches(fresh);
      async function addFileUrlGroup(items: PendingAdd[], watch: boolean) {
        if (!items.length) return;
        const ids = await addFileUrlBatch(items);
        for (const item of items) succeededIds.add(item.id);
        if (watch) notifyIds.push(...ids);
      }
      await addFileUrlGroup(fileNotify, true);
      await addFileUrlGroup(fileSilent, false);
      for (const item of magnets) {
        if (!isMagnetUri(item.path)) throw new DelugeError("Invalid magnet URI");
        const result = await rpc("core.add_torrent_magnet", [item.path, optionsFromPending(item)]);
        const ids = [
          ...extractAddedTorrentIds(result),
          ...torrentIdsFromAddForm({ magnetText: item.path, infoHash: item.infoHash }),
        ];
        succeededIds.add(item.id);
        if (item.notifyOnComplete) notifyIds.push(...ids);
      }
      if (wantsNotify) registerNotifyTorrentIds(notifyIds, { seedIncomplete: true });
      if (existing.length) {
        const message = addPartialFailureMessage(
          fresh.length,
          alreadyInSessionMessage(existing.length)
        );
        setError(alreadyInSessionMessage(existing.length));
        toast.error(message);
      } else {
        toast.success(addSuccessToast(fresh.length));
        onOpenChange(false);
      }
      onAdded?.();
    } catch (err) {
      if (wantsNotify) {
        if (notifyIds.length) registerNotifyTorrentIds(notifyIds, { seedIncomplete: true });
        else cancelNotifyAdd();
      }
      if (succeededIds.size) {
        setQueue((prev) => remainingAfterPartialAdd(prev, succeededIds));
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of succeededIds) next.delete(id);
          return next;
        });
        onAdded?.();
      }
      const message = addPartialFailureMessage(
        succeededIds.size,
        errMessage(err, "Failed to add torrent")
      );
      setError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
    <input
      ref={fileInputRef}
      id="add-torrent-file"
      type="file"
      multiple
      accept=".torrent,application/x-bittorrent"
      className="hidden"
      tabIndex={-1}
      onChange={(event) => {
        addFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
      }}
    />
    {open ? (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "focus-out") {
          details.cancel();
          return;
        }
        if (!next && (sourcePrompt || busy || submittingRef.current)) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            className={ADD_TOOLBAR_TRIGGER_CLASS}
            title={label}
            aria-label={label}
          />
        }
      >
        <Plus />
        <span className="hidden xl:inline">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={ADD_POPOVER_CLASS}
        initialFocus={locationInputRef}
      >
        <PopoverTitle className="sr-only">Add torrent</PopoverTitle>
        <form
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            if (canAdd) void submit();
          }}
          onKeyDown={(event) => {
            if (event.defaultPrevented) return;
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            if (!(event.target instanceof HTMLInputElement)) return;
            if (event.target.id === "add-source-url" || event.target.id === "add-source-magnet") return;
            event.preventDefault();
            if (canAdd) event.currentTarget.requestSubmit();
          }}
        >
          {error ? (
            <AddErrorAlert
              message={error}
              className="rounded-none border-x-0 border-t-0 bg-destructive/10 px-4 py-2.5"
            />
          ) : null}
          <div className={cn(PREF_DIALOG_SPLIT_CLASS, "min-h-0 flex-1")}>
            <QueuePane
              queue={queue}
              selected={selected}
              fileDragOver={fileDragOver}
              addSourceRef={addSourceRef}
              onClickRow={clickQueueRow}
              onToggle={(id, checked) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (checked) next.add(id);
                  else next.delete(id);
                  return next;
                });
                rangeAnchorRef.current = id;
              }}
              onRemove={(id) => removeIds(new Set([id]))}
              onRetry={retryItem}
              onPickFiles={() => fileInputRef.current?.click()}
              onPickMagnet={() => setSourcePrompt("magnet")}
              onPickUrl={() => setSourcePrompt("url")}
              onFileDrag={(over) => setFileDragOver(over)}
              onDropFiles={(files) => {
                setFileDragOver(false);
                addFiles(files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <PropertiesPane
              items={selectedItems}
              locationInputRef={locationInputRef}
              advancedOpen={advancedOpen}
              onAdvancedOpen={setAdvancedOpen}
              caps={caps}
              canAdd={canAdd}
              addLabel={addButtonLabel(ready.length, busy)}
              onCancel={() => onOpenChange(false)}
              onNotifyChange={applyNotify}
              onNotifyGesture={() => void requestNotifyIfNeeded()}
              onOptions={patchSelectedOptions}
              onPriorities={(priorities) =>
                updateSelected((item) => ({ ...item, priorities }))
              }
            />
          </div>
        </form>
      </PopoverContent>
    </Popover>
    ) : (
    <div className="inline-flex items-center">
      <Button
        type="button"
        className={cn(ADD_TOOLBAR_TRIGGER_CLASS, "rounded-r-none")}
        title={label}
        aria-label={label}
        onClick={pickDefaultAdd}
      >
        <Plus />
        <span className="hidden xl:inline">{label}</span>
      </Button>
      <DropdownMenu open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              className="h-8 rounded-l-none border-l border-primary-foreground/25 px-1.5"
              aria-label="More ways to add a torrent"
              title="Magnet or URL"
            />
          }
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <AddSourceMenuItems
            onPickFiles={pickDefaultAdd}
            onPickMagnet={() => setSourcePrompt("magnet")}
            onPickUrl={() => setSourcePrompt("url")}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    )}
    <SourcePromptDialog
      kind={sourcePrompt}
      onClose={() => setSourcePrompt(null)}
      onAddMagnet={addMagnetText}
      onAddUrl={addUrl}
    />
    </>
  );
}

function AddSourceMenuItems({
  onPickFiles,
  onPickMagnet,
  onPickUrl,
}: {
  onPickFiles: () => void;
  onPickMagnet: () => void;
  onPickUrl: () => void;
}) {
  return (
    <>
      <DropdownMenuItem onClick={onPickFiles}>
        <File /> File
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => queueMicrotask(onPickMagnet)}>
        <Magnet /> Magnet
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => queueMicrotask(onPickUrl)}>
        <Link /> URL
      </DropdownMenuItem>
    </>
  );
}

function SourcePromptDialog({
  kind,
  onClose,
  onAddMagnet,
  onAddUrl,
}: {
  kind: "magnet" | "url" | null;
  onClose: () => void;
  onAddMagnet: (text: string) => string | null;
  onAddUrl: (text: string) => string | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<"magnet" | "url">("magnet");
  const inputRef = useRef<HTMLInputElement>(null);
  const magnetRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!kind) return;
    setActiveKind(kind);
    setValue("");
    setError(null);
  }, [kind]);

  const isMagnet = activeKind === "magnet";

  function submit() {
    const message = isMagnet ? onAddMagnet(value) : onAddUrl(value);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  }

  return (
    <Dialog open={kind != null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="z-[60] min-w-0 gap-3 sm:max-w-md"
        initialFocus={isMagnet ? magnetRef : inputRef}
      >
        <DialogHeader>
          <DialogTitle>{isMagnet ? "Add magnet" : "Add URL"}</DialogTitle>
          <DialogDescription>
            {isMagnet
              ? "Paste one or more magnet URIs, one per line."
              : "Paste an HTTP(S) URL to a .torrent file."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }}
        >
          {isMagnet ? (
            <Textarea
              ref={magnetRef}
              id="add-source-magnet"
              value={value}
              placeholder="magnet:?xt=urn:btih:…"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "add-source-error" : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
          ) : (
            <Input
              ref={inputRef}
              id="add-source-url"
              value={value}
              placeholder="https://example.com/file.torrent"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "add-source-error" : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
          )}
          {error ? <AddErrorAlert id="add-source-error" message={error} /> : null}
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QueuePane({
  queue,
  selected,
  fileDragOver,
  addSourceRef,
  onClickRow,
  onToggle,
  onRemove,
  onRetry,
  onPickFiles,
  onPickMagnet,
  onPickUrl,
  onFileDrag,
  onDropFiles,
}: {
  queue: PendingAdd[];
  selected: Set<string>;
  fileDragOver: boolean;
  addSourceRef: RefObject<HTMLButtonElement | null>;
  onClickRow: (id: string, event: MouseEvent) => void;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
  onRetry: (item: PendingAdd) => void;
  onPickFiles: () => void;
  onPickMagnet: () => void;
  onPickUrl: () => void;
  onFileDrag: (over: boolean) => void;
  onDropFiles: (files: File[]) => void;
}) {
  return (
    <div
      className={cn(
        "flex max-h-52 min-h-0 w-full min-w-0 shrink-0 grow-0 flex-col overflow-hidden border-b bg-sidebar text-sidebar-foreground sm:max-h-none sm:w-[15.5rem] sm:min-w-[15.5rem] sm:max-w-[15.5rem] sm:flex-none sm:border-r sm:border-b-0",
        fileDragOver && "bg-sidebar-accent/80"
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        onFileDrag(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        onFileDrag(true);
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        onFileDrag(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div
        role="listbox"
        aria-label="Torrents to add"
        aria-multiselectable="true"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          !queue.length && "flex items-center justify-center"
        )}
      >
        {queue.length ? (
          queue.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isSelected}
                aria-label={item.label}
                className={cn(
                  "flex min-w-0 cursor-pointer items-start gap-2 px-3 py-2 text-left",
                  isSelected
                    ? "bg-sidebar-foreground/6 font-medium text-sidebar-foreground"
                    : "hover:bg-sidebar-accent/60"
                )}
                onClick={(event) => onClickRow(item.id, event)}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={isSelected}
                  aria-label={`Select ${item.label}`}
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={(value) => onToggle(item.id, Boolean(value))}
                />
                <div className="min-w-0 flex-1">
                  <p className="min-w-0 truncate text-sm font-medium" title={item.label}>
                    {item.label}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{sourceHint(item)}</p>
                  {item.status === "error" && item.error ? (
                    <p className="mt-0.5 truncate text-[11px] text-destructive" title={item.error}>
                      {item.error}
                    </p>
                  ) : null}
                </div>
                {item.status === "loading" ? (
                  <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
                {item.status === "error" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="shrink-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRetry(item);
                    }}
                  >
                    Retry
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={`Remove ${item.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item.id);
                  }}
                >
                  <X />
                </Button>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Drop .torrent files here, or add a file, magnet, or URL below.
          </p>
        )}
      </div>
      <div className="shrink-0 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                ref={addSourceRef}
                id="add-torrent-source"
                type="button"
                variant="outline"
                className="w-full justify-between"
              />
            }
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus />
              Add torrent
            </span>
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <AddSourceMenuItems
              onPickFiles={onPickFiles}
              onPickMagnet={onPickMagnet}
              onPickUrl={onPickUrl}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AddDialogActions({
  canAdd,
  addLabel,
  onCancel,
}: {
  canAdd: boolean;
  addLabel: string;
  onCancel: () => void;
}) {
  return (
    <DialogFooter className="m-0 shrink-0 rounded-none bg-popover p-3 sm:p-4">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={!canAdd}>
        {addLabel}
      </Button>
    </DialogFooter>
  );
}

function AdvancedSwitch({
  label,
  mixed,
  checked,
  onCheckedChange,
}: {
  label: string;
  mixed: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-sm leading-snug">
      <span className="min-w-0">
        {label}
        {mixed ? <span className="text-muted-foreground"> (mixed)</span> : null}
      </span>
      <Switch
        size="sm"
        checked={!mixed && checked}
        data-mixed={mixed || undefined}
        aria-checked={mixed ? "mixed" : checked}
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}

function PropertiesPane({
  items,
  locationInputRef,
  advancedOpen,
  onAdvancedOpen,
  caps,
  canAdd,
  addLabel,
  onCancel,
  onNotifyChange,
  onNotifyGesture,
  onOptions,
  onPriorities,
}: {
  items: PendingAdd[];
  locationInputRef: RefObject<HTMLInputElement | null>;
  advancedOpen: boolean;
  onAdvancedOpen: (open: boolean) => void;
  caps: ReturnType<typeof clientCapabilities>;
  canAdd: boolean;
  addLabel: string;
  onCancel: () => void;
  onNotifyChange: (checked: boolean) => void;
  onNotifyGesture: () => void;
  onOptions: (partial: Partial<PendingAddForm>) => void;
  onPriorities: (next: number[]) => void;
}) {
  if (!items.length) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-6">
          <p className="text-sm text-muted-foreground">No torrent file added.</p>
        </div>
        <AddDialogActions canAdd={canAdd} addLabel={addLabel} onCancel={onCancel} />
      </div>
    );
  }

  const notify = mixedField(items, (item) => item.notifyOnComplete);
  const location = mixedField(items, (item) => item.options.download_location);
  const moveCompleted = mixedField(items, (item) => item.options.move_completed);
  const movePath = mixedField(items, (item) => item.options.move_completed_path);
  const addPaused = mixedField(items, (item) => item.options.add_paused);
  const sequential = mixedField(items, (item) => item.options.sequential_download);
  const firstLast = mixedField(items, (item) => item.options.prioritize_first_last_pieces);
  const maxDown = mixedField(items, (item) => item.options.max_download_speed);
  const maxUp = mixedField(items, (item) => item.options.max_upload_speed);
  const single = items.length === 1 ? items[0]! : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-4 py-3">
      <p className="text-sm font-medium">
        {items.length === 1 ? "Editing torrent" : `Editing ${items.length} torrents`}
      </p>
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="add-download-location">Download location</Label>
          <Input
            ref={locationInputRef}
            id="add-download-location"
            value={location.mixed ? "" : location.value}
            placeholder={location.mixed ? "Multiple values" : undefined}
            onChange={(event) => onOptions({ download_location: event.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <div className="flex min-h-7 items-center gap-2">
            <label
              className="flex min-h-7 items-center justify-between gap-3 text-sm leading-snug min-w-0 flex-1"
              onPointerDown={() => {
                if (!notify.value || notify.mixed) onNotifyGesture();
              }}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <Bell className="size-4 shrink-0 text-muted-foreground" />
                Notify when this download finishes
                {notify.mixed ? <span className="text-muted-foreground">(mixed)</span> : null}
              </span>
              <Switch
                size="sm"
                checked={!notify.mixed && notify.value}
                data-mixed={notify.mixed || undefined}
                aria-checked={notify.mixed ? "mixed" : notify.value}
                onKeyDown={(event) => {
                  if (event.key !== " " && event.key !== "Enter") return;
                  if (!notify.value || notify.mixed) onNotifyGesture();
                }}
                onCheckedChange={onNotifyChange}
                aria-describedby="add-notify-hint"
              />
            </label>
            <NotifyTestButton />
          </div>
          <span id="add-notify-hint" className="sr-only">
            Send a browser notification when this torrent finishes downloading.
          </span>
        </div>
      </div>
      <TorrentPreviewCard
        name={single?.label ?? ""}
        tree={single?.tree ?? null}
        priorities={single?.priorities ?? []}
        onPriorities={onPriorities}
        loading={single?.status === "loading"}
        loadingLabel={
          single?.kind === "file"
            ? "Uploading and reading torrent…"
            : single?.kind === "url"
              ? "Downloading torrent…"
              : "Reading magnet…"
        }
        locked={items.length > 1}
      />
      <section>
        <h3 className="mb-1.5">
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls="add-advanced-fields"
            onClick={() => onAdvancedOpen(!advancedOpen)}
            className="flex w-full items-center gap-1.5 text-left text-sm font-medium text-muted-foreground"
          >
            {advancedOpen ? (
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">Advanced</span>
          </button>
        </h3>
        <div
          id="add-advanced-fields"
          hidden={!advancedOpen}
          className={advancedOpen ? "grid min-w-0 gap-2.5" : "hidden"}
        >
          {caps.kind === "deluge" ? (
            <div className="grid min-w-0 gap-2">
              <AdvancedSwitch
                label="Move completed"
                mixed={moveCompleted.mixed}
                checked={moveCompleted.value}
                onCheckedChange={(checked) => onOptions({ move_completed: checked })}
              />
              <Input
                id="add-move-completed"
                aria-label="Move completed path"
                placeholder={movePath.mixed ? "Multiple values" : "Move completed path"}
                value={movePath.mixed ? "" : movePath.value}
                disabled={moveCompleted.mixed || !moveCompleted.value}
                onChange={(event) => onOptions({ move_completed_path: event.target.value })}
              />
            </div>
          ) : null}
          <AdvancedSwitch
            label="Add in paused state"
            mixed={addPaused.mixed}
            checked={addPaused.value}
            onCheckedChange={(checked) => onOptions({ add_paused: checked })}
          />
          {caps.sequentialDownload ? (
            <AdvancedSwitch
              label="Sequential download"
              mixed={sequential.mixed}
              checked={sequential.value}
              onCheckedChange={(checked) => onOptions({ sequential_download: checked })}
            />
          ) : null}
          {caps.prioritizeFirstLast ? (
            <AdvancedSwitch
              label="Prioritize first and last pieces"
              mixed={firstLast.mixed}
              checked={firstLast.value}
              onCheckedChange={(checked) => onOptions({ prioritize_first_last_pieces: checked })}
            />
          ) : null}
          <div className="grid min-w-0 gap-2">
            <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-3">
              <Label htmlFor="add-max-down" className="text-sm font-normal leading-snug">
                Max download
              </Label>
              <Input
                id="add-max-down"
                value={maxDown.mixed ? "" : maxDown.value}
                placeholder={maxDown.mixed ? "Multiple values" : undefined}
                aria-describedby="add-speed-hint"
                onChange={(event) => onOptions({ max_download_speed: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-3">
              <Label htmlFor="add-max-up" className="text-sm font-normal leading-snug">
                Max upload
              </Label>
              <Input
                id="add-max-up"
                value={maxUp.mixed ? "" : maxUp.value}
                placeholder={maxUp.mixed ? "Multiple values" : undefined}
                aria-describedby="add-speed-hint"
                onChange={(event) => onOptions({ max_upload_speed: event.target.value })}
              />
            </div>
            <p id="add-speed-hint" className="text-[11px] leading-snug text-muted-foreground">
              KiB/s, −1 unlimited
            </p>
          </div>
        </div>
      </section>
    </div>
    <AddDialogActions canAdd={canAdd} addLabel={addLabel} onCancel={onCancel} />
    </div>
  );
}

function TorrentPreviewCard({
  name,
  tree,
  priorities,
  onPriorities,
  loading,
  loadingLabel,
  locked,
}: {
  name: string;
  tree: TorrentInfoDir | null;
  priorities: number[];
  onPriorities: (next: number[]) => void;
  loading: boolean;
  loadingLabel: string;
  locked?: boolean;
}) {
  const fileCount = tree ? infoFileIndexes(tree).length : 0;
  const emptyTree = !loading && !tree;
  const status = locked
    ? "—"
    : tree
      ? `${fileCount} file${fileCount === 1 ? "" : "s"} · ${formatBytes(infoTreeSize(tree))}`
      : name
        ? "File list is available after metadata is downloaded."
        : "—";
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-md border">
      <div
        className={cn(
          "min-h-40 max-h-56 min-w-0 overflow-auto bg-muted/30 px-2 py-1 sm:min-h-56",
          (locked || loading || emptyTree) && "flex items-center justify-center"
        )}
      >
        {locked ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            File priorities can’t be changed when several torrents are selected.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {loadingLabel}
          </div>
        ) : tree ? (
          Object.entries(tree.contents).map(([childName, child]) => (
            <AddFilesTree
              key={childName}
              name={childName}
              node={child}
              path={childName}
              depth={0}
              showFileGutter={fileCount > 1}
              priorities={priorities}
              onPriorities={onPriorities}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">File list will appear here</p>
        )}
      </div>
      <div className="min-w-0 shrink-0 rounded-b-md border-t bg-sidebar px-2 py-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{status}</span>
      </div>
    </div>
  );
}

function AddFilesTree({
  name,
  node,
  path,
  depth,
  showFileGutter,
  priorities,
  onPriorities,
}: {
  name: string;
  node: TorrentInfoNode;
  path: string;
  depth: number;
  showFileGutter: boolean;
  priorities: number[];
  onPriorities: (next: number[]) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  if (node.type === "file") {
    const value = String(priorities[node.index] ?? 4);
    return (
      <div className="flex min-w-0 items-center gap-1.5 py-1 text-sm">
        {showFileGutter ? <span className="inline-block size-6 shrink-0" aria-hidden /> : null}
        <FileKindIcon name={name} />
        <span className="min-w-0 flex-1 truncate" title={path}>
          {name}
        </span>
        <span className="tabular shrink-0 text-right text-xs text-muted-foreground">
          {formatBytes(node.length)}
        </span>
        <FilePrioritySelect
          value={value}
          onChange={(next) => onPriorities(setPrioritiesForIndexes(priorities, [node.index], next))}
        />
      </div>
    );
  }
  const indexes = infoFileIndexes(node);
  const shared = commonPriority(priorities, indexes);
  return (
    <div className="min-w-0 text-sm">
      <div className="flex min-w-0 items-center gap-1.5 py-1">
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <FolderTreeIcon open={open} />
        <span className="min-w-0 flex-1 truncate font-medium" title={path}>
          {name}
        </span>
        <span className="tabular shrink-0 text-right text-xs text-muted-foreground">
          {formatBytes(infoTreeSize(node))}
        </span>
        <FilePrioritySelect
          value={shared == null ? "mixed" : String(shared)}
          mixed={shared == null}
          onChange={(next) => onPriorities(setPrioritiesForIndexes(priorities, indexes, next))}
        />
      </div>
      <div className={cn(open ? "ml-3 min-w-0 overflow-hidden border-l pl-3" : "hidden")}>
        {Object.entries(node.contents).map(([childName, child]) => (
          <AddFilesTree
            key={childName}
            name={childName}
            node={child}
            path={`${path}/${childName}`}
            depth={depth + 1}
            showFileGutter={showFileGutter}
            priorities={priorities}
            onPriorities={onPriorities}
          />
        ))}
      </div>
    </div>
  );
}
