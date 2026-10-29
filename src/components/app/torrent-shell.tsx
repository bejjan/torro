"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Info,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Server,
  Settings,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AboutDialog } from "@/components/app/about-dialog";
import { Brand } from "@/components/app/brand";
import { ConnectionManager } from "@/components/app/connection-manager";
import { DragResizeHandle } from "@/components/app/drag-resize-handle";
import { FilterSidebar, type SidebarFilters } from "@/components/app/filter-sidebar";
import { PreferencesDialog } from "@/components/app/preferences-dialog";
import { SessionMonitor } from "@/components/app/session-monitor";
import { SessionProgressFavicon } from "@/components/app/session-progress-favicon";
import { ThemeMenuSub } from "@/components/app/theme-toggle";
import { TorrentDetails } from "@/components/app/torrent-details";
import { AddTorrentDialog } from "@/components/app/add-torrent-dialog";
import { MoveTorrentDialog, RemoveTorrentDialog } from "@/components/app/torrent-dialogs";
import { TorrentTable } from "@/components/app/torrent-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  INSPECTOR_DIALOG_CLASS,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { clientCapabilities, getStoredClientKind, rpc } from "@/lib/deluge/client";
import { isSessionExpiredMessage } from "@/lib/deluge/session-expired";
import { formatBytes, formatRate } from "@/lib/deluge/format";
import { GRID_KEYS } from "@/lib/deluge/keys";
import { processDownloadFinishedNotifications, resetNotifyCompleteMemory } from "@/lib/notify-complete";
import {
  LABEL_RPC,
  isLabelPluginEnabled,
  isUnknownMethodMessage,
  labelRpcErrorMessage,
} from "@/lib/deluge/label-plugin";
import {
  addTorrentShortcutTitle,
  classifyEscapeTarget,
  decideAddTorrentShortcutAction,
  decideEscapeSelectionAction,
  decideTorrentSearchFindAction,
  DEFAULT_ADD_TORRENT_LABEL,
  DEFAULT_TORRENT_SEARCH_PLACEHOLDER,
  hasOpenDismissibleOverlay,
  isMacPlatform,
  torrentSearchPlaceholder,
  torrentSearchShortcutTitle,
  TORRENT_SEARCH_SELECTOR,
} from "@/lib/deluge/escape-selection";
import {
  FILTER_DOWNLOADING,
  clampSidebarSelection,
  filterTorrentMap,
  selectSidebarState,
  sidebarFilterTreeFromTorrents,
  sidebarSessionCatalog,
} from "@/lib/deluge/sidebar-filters";
import {
  applyColumnVisibility,
  defaultTorrentColumnOrder,
  defaultVisibleTorrentColumns,
  loadTorrentColumnOrder,
  loadTorrentColumnVisibility,
  moveColumnBefore,
  saveTorrentColumnOrder,
  saveTorrentColumnVisibility,
  sameColumnOrder,
  visibleTorrentColumns,
  type TorrentColumnId,
} from "@/lib/deluge/torrent-columns";
import {
  filterAndSortTorrents,
  type TorrentSortKey,
} from "@/lib/deluge/torrent-list";
import type { SessionStats, TorrentStatus, UiUpdate } from "@/lib/deluge/types";
import { mergeUiUpdate } from "@/lib/deluge/ui-merge";
import { pruneActiveId, pruneSelectedIds } from "@/lib/deluge/selection";
import {
  SELECT_COLUMN_ID,
  SIDEBAR_DEFAULT_WIDTH,
  DETAILS_DEFAULT_DOCK,
  DETAILS_DEFAULT_HEIGHT,
  DETAILS_DEFAULT_WIDTH,
  DETAILS_MIN_HEIGHT,
  DETAILS_MIN_WIDTH,
  clampColumnWidth,
  clampDetailsHeight,
  clampDetailsWidth,
  clampSidebarWidth,
  columnWidthFor,
  loadDetailsDock,
  loadDetailsHeight,
  loadDetailsWidth,
  loadSidebarWidth,
  loadTorrentColumnWidths,
  saveDetailsDock,
  saveDetailsHeight,
  saveDetailsWidth,
  saveSidebarWidth,
  saveTorrentColumnWidths,
  type DetailsDock,
} from "@/lib/deluge/ui-layout";
import { sessionFaviconDownloadProgress } from "@/lib/deluge/session-favicon";
import {
  isSessionMonitorChipVisible,
  nextRateSamples,
  type SessionRateSample,
} from "@/lib/deluge/session-monitor";
import {
  DEFAULT_DOCUMENT_TITLE,
  holdLastSessionRates,
  isWebSessionSpeedVisible,
  isWebSidebarVisible,
  sessionSpeedDocumentTitle,
  writeDocumentTitleIfChanged,
} from "@/lib/deluge/web-config";
import { cn } from "@/lib/utils";

/** Full catalog poll. One second of every torrent is enough to saturate a home link. */
const GRID_POLL_MS = 2000;

export function TorrentShell({
  onLogout,
}: {
  onLogout: () => void;
}) {
  const caps = clientCapabilities(
    typeof window === "undefined" ? "deluge" : getStoredClientKind()
  );
  const mobile = useIsMobile();
  const [ui, setUi] = useState<UiUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<SidebarFilters>({
    state: "All",
    tracker: "",
    label: "__all__",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<TorrentSortKey>("queue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [addOpen, setAddOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const pickDefaultAddRef = useRef<(() => void) | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hostsOpen, setHostsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelPluginEnabled, setLabelPluginEnabled] = useState<boolean | null>(null);
  const [showZeroFilters, setShowZeroFilters] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSessionSpeed, setShowSessionSpeed] = useState(true);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<TorrentColumnId>>(
    defaultVisibleTorrentColumns
  );
  const [columnOrder, setColumnOrder] = useState<TorrentColumnId[]>(defaultTorrentColumnOrder);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [detailsHeight, setDetailsHeight] = useState(DETAILS_DEFAULT_HEIGHT);
  const [detailsWidth, setDetailsWidth] = useState(DETAILS_DEFAULT_WIDTH);
  const [detailsDock, setDetailsDock] = useState<DetailsDock>(DETAILS_DEFAULT_DOCK);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const splitRef = useRef<HTMLDivElement>(null);
  const mainColRef = useRef<HTMLDivElement>(null);
  const searchValueRef = useRef(search);
  const selectedRef = useRef(selected);
  const activeIdRef = useRef(activeId);
  const addOpenRef = useRef(addOpen);
  const wantSearchFocusRef = useRef(false);
  const pollGen = useRef(0);
  const pollInFlight = useRef(false);
  const uiRevision = useRef<number | null>(null);
  const switchingHosts = useRef(false);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;
  const lastRatesRef = useRef({ download: 0, upload: 0 });
  const [rateSamples, setRateSamples] = useState<SessionRateSample[]>([]);
  const [searchFieldTitle, setSearchFieldTitle] = useState<string | undefined>(undefined);
  const [searchPlaceholder, setSearchPlaceholder] = useState(DEFAULT_TORRENT_SEARCH_PLACEHOLDER);
  const [addTorrentLabel, setAddTorrentLabel] = useState(DEFAULT_ADD_TORRENT_LABEL);
  searchValueRef.current = search;
  selectedRef.current = selected;
  activeIdRef.current = activeId;
  addOpenRef.current = addOpen;

  useEffect(() => {
    const isMac = isMacPlatform(navigator.userAgent);
    setSearchFieldTitle(torrentSearchShortcutTitle(isMac));
    setSearchPlaceholder(torrentSearchPlaceholder(isMac));
    setAddTorrentLabel(addTorrentShortcutTitle(isMac));
    setVisibleColumnIds(loadTorrentColumnVisibility());
    setColumnOrder(loadTorrentColumnOrder());
    setSidebarWidth(loadSidebarWidth());
    setDetailsHeight(loadDetailsHeight());
    setDetailsWidth(loadDetailsWidth());
    setDetailsDock(loadDetailsDock());
    setColumnWidths(loadTorrentColumnWidths());
  }, []);

  const shownColumns = useMemo(
    () => visibleTorrentColumns(visibleColumnIds, columnOrder),
    [visibleColumnIds, columnOrder]
  );

  const widthFor = useCallback(
    (id: string) => columnWidthFor(id, columnWidths),
    [columnWidths]
  );

  const tableMinWidth = useMemo(() => {
    return widthFor(SELECT_COLUMN_ID) + shownColumns.reduce((sum, column) => sum + widthFor(column.id), 0);
  }, [shownColumns, widthFor]);

  const resizeColumn = useCallback((id: string, dx: number) => {
    setColumnWidths((prev) => {
      const next = {
        ...prev,
        [id]: clampColumnWidth(columnWidthFor(id, prev) + dx, id),
      };
      saveTorrentColumnWidths(next);
      return next;
    });
  }, []);

  const resizeSidebar = useCallback((dx: number) => {
    const containerWidth = splitRef.current?.getBoundingClientRect().width;
    setSidebarWidth((width) => {
      const next = clampSidebarWidth(width + dx, containerWidth);
      saveSidebarWidth(next);
      return next;
    });
  }, []);

  const resizeDetails = useCallback((dy: number) => {
    const containerHeight = mainColRef.current?.getBoundingClientRect().height;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : undefined;
    setDetailsHeight((height) => {
      // Top-edge handle: pointer up (negative dy) grows the bottom panel.
      const next = clampDetailsHeight(height - dy, viewportHeight, containerHeight);
      saveDetailsHeight(next);
      return next;
    });
  }, []);

  const resizeDetailsWidth = useCallback((dx: number) => {
    const containerWidth = mainColRef.current?.getBoundingClientRect().width;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : undefined;
    setDetailsWidth((width) => {
      // Left-edge handle: pointer left (negative dx) grows the right panel.
      const next = clampDetailsWidth(width - dx, viewportWidth, containerWidth);
      saveDetailsWidth(next);
      return next;
    });
  }, []);

  const changeDetailsDock = useCallback((dock: DetailsDock) => {
    setDetailsDock(dock);
    saveDetailsDock(dock);
  }, []);

  const setColumnVisible = useCallback((id: TorrentColumnId, visible: boolean) => {
    setVisibleColumnIds((prev) => {
      const next = applyColumnVisibility(prev, id, visible);
      saveTorrentColumnVisibility(next);
      return next;
    });
  }, []);

  const reorderColumn = useCallback((draggedId: TorrentColumnId, beforeId: TorrentColumnId | null) => {
    setColumnOrder((prev) => {
      const next = moveColumnBefore(prev, draggedId, beforeId);
      if (sameColumnOrder(next, prev)) return prev;
      saveTorrentColumnOrder(next);
      return next;
    });
  }, []);

  const applyWebUi = useCallback((web: Record<string, unknown> | null | undefined) => {
    setShowZeroFilters(Boolean(web?.sidebar_show_zero));
    setShowSidebar(isWebSidebarVisible(web));
    setShowSessionSpeed(isWebSessionSpeedVisible(web));
  }, []);

  const poll = useCallback(async () => {
    if (switchingHosts.current || pollInFlight.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const gen = ++pollGen.current;
    pollInFlight.current = true;
    try {
      const result = await rpc<UiUpdate>("web.update_ui", [[...GRID_KEYS], {}], {
        uiRevision: uiRevision.current,
      });
      if (switchingHosts.current || gen !== pollGen.current) return;
      if (typeof result.revision === "number") {
        uiRevision.current = result.connected ? result.revision : null;
      }
      setUi((prev) => mergeUiUpdate(prev, result));
      const held = holdLastSessionRates(lastRatesRef.current, result.stats);
      lastRatesRef.current = held;
      setRateSamples((prev) => nextRateSamples(prev, held, result.connected));
      setError(null);
      if (!result.connected) setError("Daemon disconnected");
    } catch (err) {
      if (switchingHosts.current || gen !== pollGen.current) return;
      const message = err instanceof Error ? err.message : "Update failed";
      if (isSessionExpiredMessage(message)) {
        pollGen.current += 1;
        onLogoutRef.current();
        return;
      }
      setError(message);
    } finally {
      pollInFlight.current = false;
      if (!switchingHosts.current && gen === pollGen.current) setLoading(false);
    }
  }, []);

  const beginHostSwitch = useCallback(() => {
    switchingHosts.current = true;
    pollGen.current += 1;
    uiRevision.current = null;
    setUi(null);
    setSelected(new Set());
    setActiveId(null);
    setDetailsOpen(false);
    setLabels([]);
    setLoading(true);
    setError(null);
    setRateSamples([]);
    lastRatesRef.current = { download: 0, upload: 0 };
    resetNotifyCompleteMemory();
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), GRID_POLL_MS);
    return () => {
      pollGen.current += 1;
      clearInterval(id);
    };
  }, [poll]);

  useEffect(() => {
    let cancelled = false;
    async function recheckSession() {
      if (document.visibilityState === "hidden") return;
      try {
        const ok = await rpc<boolean>("auth.check_session");
        if (cancelled) return;
        if (!ok) {
          onLogoutRef.current();
          return;
        }
        void poll();
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!cancelled && isSessionExpiredMessage(message)) onLogoutRef.current();
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void recheckSession();
    };
    const onPageShow = () => {
      void recheckSession();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const refreshLabels = useCallback(async () => {
    try {
      let enabled = false;
      try {
        const plugins = await rpc<{ enabled_plugins?: string[] }>("web.get_plugins");
        enabled = isLabelPluginEnabled(plugins);
      } catch {
        const list = await rpc<string[]>("core.get_enabled_plugins");
        enabled = isLabelPluginEnabled(list);
      }
      setLabelPluginEnabled(enabled);
      if (!enabled) {
        setLabels([]);
        return;
      }
      setLabels(await rpc<string[]>(LABEL_RPC.getLabels));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (isUnknownMethodMessage(message)) setLabelPluginEnabled(false);
      setLabels([]);
    }
  }, []);

  const finishHostSwitch = useCallback(() => {
    switchingHosts.current = false;
    setHostsOpen(false);
    void refreshLabels();
    void rpc<Record<string, unknown>>("web.get_config")
      .then((web) => applyWebUi(web))
      .catch(() => {
        setShowZeroFilters(false);
        setShowSidebar(true);
      });
    void poll();
  }, [applyWebUi, poll, refreshLabels]);

  const abortHostSwitch = useCallback(() => {
    switchingHosts.current = false;
    void poll();
  }, [poll]);

  useEffect(() => {
    if (prefsOpen) return;
    let cancelled = false;
    void refreshLabels();
    void rpc<Record<string, unknown>>("web.get_config")
      .then((web) => {
        if (!cancelled) applyWebUi(web);
      })
      .catch(() => {
        if (!cancelled) {
          setShowZeroFilters(false);
          setShowSidebar(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [prefsOpen, applyWebUi, refreshLabels]);

  const sidebarFilterTree = useMemo(
    () => sidebarFilterTreeFromTorrents(Object.values(ui?.torrents ?? {}), filters),
    [ui?.torrents, filters]
  );
  const sessionCatalog = useMemo(
    () => sidebarSessionCatalog(Object.values(ui?.torrents ?? {})),
    [ui?.torrents]
  );
  const sidebarLoading = loading && !ui;
  const visibleTorrents = useMemo(
    () => filterTorrentMap(ui?.torrents, filters),
    [ui?.torrents, filters]
  );

  useEffect(() => {
    const tree = sidebarFilterTree;
    setFilters((prev) => {
      const next = clampSidebarSelection(
        prev,
        tree.state ?? [],
        tree.tracker_host ?? [],
        tree.label ?? [],
        showZeroFilters,
        labels
      );
      if (next.state === prev.state && next.tracker === prev.tracker && next.label === prev.label) {
        return prev;
      }
      return next;
    });
  }, [sidebarFilterTree, showZeroFilters, labels]);

  useEffect(() => {
    const map = ui?.torrents;
    if (!map) return;
    setSelected((prev) => pruneSelectedIds(prev, map));
    setActiveId((id) => pruneActiveId(id, map));
    processDownloadFinishedNotifications(map);
  }, [ui?.torrents]);

  const torrents = useMemo(
    () => filterAndSortTorrents(visibleTorrents, search, sortKey, sortDir),
    [visibleTorrents, search, sortKey, sortDir]
  );

  const selectedIds = useMemo(() => [...selected], [selected]);
  const primary = activeId && ui?.torrents?.[activeId] ? activeId : selectedIds[0] ?? null;
  const primaryTorrent = primary ? (ui?.torrents?.[primary] as TorrentStatus | undefined) : null;
  const stats = ui?.stats as SessionStats | null;
  const rates = holdLastSessionRates(lastRatesRef.current, stats);
  lastRatesRef.current = rates;
  const downloadRate = rates.download;
  const uploadRate = rates.upload;
  const speedTitle = sessionSpeedDocumentTitle(downloadRate, uploadRate, showSessionSpeed);
  const faviconProgress = useMemo(
    () => sessionFaviconDownloadProgress(Object.values(ui?.torrents ?? {})),
    [ui?.torrents]
  );

  useEffect(() => {
    writeDocumentTitleIfChanged(document, speedTitle);
  }, [speedTitle]);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, []);

  const toggleSort = useCallback((key: TorrentSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "queue" ? "asc" : "desc");
    }
  }, [sortKey]);

  const act = useCallback(
    async (method: string, torrentIds?: string[]) => {
      const ids = torrentIds ?? [...selected];
      if (!ids.length) return;
      try {
        await rpc(method, [ids]);
        await poll();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        if (isSessionExpiredMessage(message)) {
          onLogoutRef.current();
          return;
        }
        toast.error(message);
      }
    },
    [poll, selected]
  );

  const setLabel = useCallback(
    async (label: string, torrentIds?: string[]) => {
      const ids = torrentIds ?? [...selected];
      if (!ids.length) return;
      try {
        for (const id of ids) await rpc(LABEL_RPC.setTorrent, [id, label]);
        await poll();
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (isSessionExpiredMessage(message)) {
          onLogoutRef.current();
          return;
        }
        toast.error(labelRpcErrorMessage(err, "Label failed"));
      }
    },
    [poll, selected]
  );

  const setOptions = useCallback(
    async (options: Record<string, unknown>, torrentIds?: string[]) => {
      const ids = torrentIds ?? [...selected];
      if (!ids.length) return;
      try {
        await rpc("core.set_torrent_options", [ids, options]);
        await poll();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        if (isSessionExpiredMessage(message)) {
          onLogoutRef.current();
          return;
        }
        toast.error(message);
      }
    },
    [poll, selected]
  );

  const openDetails = useCallback((id: string) => {
    setActiveId(id);
    setDetailsOpen(true);
  }, []);

  useEffect(() => {
    if (!detailsOpen) return;
    if (!activeId || !ui?.torrents?.[activeId]) setDetailsOpen(false);
  }, [detailsOpen, activeId, ui?.torrents]);

  const openRemove = useCallback((torrentIds: string[]) => {
    setSelected(new Set(torrentIds));
    setRemoveOpen(true);
  }, []);

  const openMove = useCallback((torrentIds: string[]) => {
    setSelected(new Set(torrentIds));
    setMoveOpen(true);
  }, []);

  async function logout() {
    try {
      await rpc("auth.delete_session");
    } catch {
      /* still leave */
    }
    onLogout();
  }

  const onLabelsChanged = useCallback(() => {
    void refreshLabels();
    void poll();
  }, [refreshLabels, poll]);

  useEffect(() => {
    if (!wantSearchFocusRef.current) return;
    if (focusVisibleTorrentSearch()) wantSearchFocusRef.current = false;
  }, [searchExpanded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const overlayOpen = hasOpenDismissibleOverlay(document);
      const targetKind = classifyEscapeTarget(event.target);
      const isMac = isMacPlatform(navigator.userAgent);
      const shortcutInput = {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        overlayOpen,
        targetKind,
        isMac,
      };
      const findAction = decideTorrentSearchFindAction(shortcutInput);
      if (findAction === "focus-search") {
        event.preventDefault();
        if (focusVisibleTorrentSearch()) return;
        wantSearchFocusRef.current = true;
        setSearchExpanded(true);
        return;
      }
      if (decideAddTorrentShortcutAction(shortcutInput) === "open-add") {
        event.preventDefault();
        if (!addOpenRef.current) pickDefaultAddRef.current?.();
        return;
      }
      const action = decideEscapeSelectionAction({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        overlayOpen,
        targetKind,
        search: searchValueRef.current,
        selectedCount: selectedRef.current.size,
        hasActiveId: activeIdRef.current != null,
      });
      if (action === "none") return;
      event.preventDefault();
      if (action === "clear-search") {
        setSearch("");
        return;
      }
      setSelected(new Set());
      setActiveId(null);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  const downloadPath =
    primaryTorrent?.download_location || "/home/deluge/Downloads";

  const table = (
    <TorrentTable
      torrents={torrents}
      selected={selected}
      activeId={activeId}
      sortKey={sortKey}
      sortDir={sortDir}
      search={search}
      shownColumns={shownColumns}
      visibleColumnIds={visibleColumnIds}
      tableMinWidth={tableMinWidth}
      widthFor={widthFor}
      labels={labels}
      clientKind={caps.kind}
      loading={loading}
      hasUi={Boolean(ui)}
      mobile={mobile}
      onToggleSort={toggleSort}
      onResizeColumn={resizeColumn}
      onReorderColumns={reorderColumn}
      onSetColumnVisible={setColumnVisible}
      onSelectedChange={setSelected}
      onActiveIdChange={setActiveId}
      onOpenDetails={openDetails}
      onAct={act}
      onSetLabel={setLabel}
      onSetOptions={setOptions}
      onRemove={openRemove}
      onMove={openMove}
    />
  );

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <SessionProgressFavicon progress={faviconProgress} />
      <header className="flex min-h-10 min-w-0 shrink-0 items-center gap-1 border-b px-1.5 py-1.5 sm:gap-2 sm:px-2 md:px-3">
        {searchExpanded ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label="Close search"
              onClick={() => setSearchExpanded(false)}
            >
              <X />
            </Button>
            <SearchField
              autoFocus
              value={search}
              onChange={setSearch}
              title={searchFieldTitle}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1"
            />
          </div>
        ) : null}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1",
            "sm:grid sm:flex-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-2",
            searchExpanded ? "max-sm:shrink-0" : "flex-1"
          )}
        >
          <div className={cn("flex min-w-0 items-center gap-1 sm:gap-2", searchExpanded && "max-sm:hidden")}>
            {mobile ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => setSidebarOpen(true)}
                aria-label="Filters"
              >
                <PanelLeft />
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />}>
                <Menu />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">
                <DropdownMenuItem className="whitespace-nowrap" onClick={() => setAboutOpen(true)}>
                  <Info /> About torro
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="whitespace-nowrap" onClick={() => setPrefsOpen(true)}>
                  <Settings /> Preferences…
                </DropdownMenuItem>
                {caps.connectionManager ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="whitespace-nowrap" onClick={() => setHostsOpen(true)}>
                      <Server /> Connection Manager…
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <ThemeMenuSub />
                <DropdownMenuSeparator />
                <DropdownMenuItem className="whitespace-nowrap" onClick={() => void logout()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Brand
              className="min-w-0 shrink"
              markClassName="size-6"
              wordmarkClassName="hidden sm:inline"
            />
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            title={searchFieldTitle}
            placeholder={searchPlaceholder}
            className="relative w-[min(20rem,30vw)] xl:w-[min(24rem,36vw)] max-sm:hidden"
          />
          <div className="ml-auto flex min-w-0 items-center justify-end gap-1 sm:ml-0 sm:gap-2">
            {isSessionMonitorChipVisible(ui?.connected) ? (
              <SessionMonitor
                downloadRate={downloadRate}
                uploadRate={uploadRate}
                samples={rateSamples}
                stats={stats}
                torrents={ui?.torrents}
                showDht={caps.dhtNodes}
                className={cn(searchExpanded && "max-sm:hidden")}
              />
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("relative shrink-0 sm:hidden", searchExpanded && "hidden")}
              aria-label="Search torrents"
              aria-expanded={false}
              onClick={() => setSearchExpanded(true)}
            >
              <Search />
              {search ? (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden />
              ) : null}
            </Button>
            <AddTorrentDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              sourceMenuOpen={addMenuOpen}
              onSourceMenuOpenChange={setAddMenuOpen}
              pickDefaultAddRef={pickDefaultAddRef}
              defaultPath={downloadPath}
              label={addTorrentLabel}
              onAdded={() => {
                setFilters((prev) => selectSidebarState(prev, FILTER_DOWNLOADING));
                void poll();
              }}
            />
          </div>
        </div>
      </header>

      {error ? (
        <div className="min-w-0 border-b bg-destructive/10 px-3 py-1.5 text-sm break-words text-destructive">
          {error}
        </div>
      ) : null}

      <div ref={splitRef} className="flex min-h-0 flex-1">
        {!mobile && showSidebar ? (
          <div
            className="relative min-h-0 min-w-0 shrink-0 self-stretch"
            style={{ width: sidebarWidth }}
          >
            <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
              <FilterSidebar
                filters={sidebarFilterTree}
                selected={filters}
                onSelect={setFilters}
                showZero={showZeroFilters}
                labelPluginEnabled={labelPluginEnabled}
                definedLabels={labels}
                sessionStates={sessionCatalog.states}
                sessionTrackers={sessionCatalog.trackers}
                sessionLabels={sessionCatalog.labels}
                onLabelsChanged={onLabelsChanged}
                showLabelGroup={caps.kind === "deluge" || Boolean(ui?.filters?.label)}
                loading={sidebarLoading}
                className="h-full min-w-0"
              />
            </aside>
            <DragResizeHandle
              variant="sidebar"
              ariaLabel="Resize filter sidebar"
              onDelta={resizeSidebar}
            />
          </div>
        ) : null}
        <div
          ref={mainColRef}
          className={cn(
            "flex min-h-0 min-w-0 flex-1",
            !mobile && detailsDock === "right" && primary ? "flex-row" : "flex-col"
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{table}</div>
          {!mobile && primary ? (
            <div
              className={cn(
                "relative min-h-0 min-w-0 shrink-0",
                detailsDock === "right" ? "self-stretch border-l" : "border-t"
              )}
              data-details-dock={detailsDock}
              style={
                detailsDock === "right"
                  ? { width: detailsWidth, minWidth: DETAILS_MIN_WIDTH }
                  : { height: detailsHeight, minHeight: DETAILS_MIN_HEIGHT, maxHeight: "70vh" }
              }
            >
              <DragResizeHandle
                variant={detailsDock === "right" ? "sidebar" : "row"}
                edge={detailsDock === "right" ? "start" : "end"}
                ariaLabel="Resize torrent details"
                onDelta={detailsDock === "right" ? resizeDetailsWidth : resizeDetails}
              />
              <div className="h-full min-h-0 overflow-hidden">
                <TorrentDetails
                  torrentId={primary}
                  torrent={primaryTorrent ?? null}
                  className="h-full"
                  variant="panel"
                  dock={detailsDock}
                  onDockChange={changeDetailsDock}
                  onClose={() => {
                    setActiveId(null);
                    setSelected(new Set());
                    setDetailsOpen(false);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="min-w-0 shrink-0 border-t bg-sidebar text-xs text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 overflow-x-auto px-2 py-1.5 sm:px-3">
          <span className="shrink-0">
            {torrents.length} torrent{torrents.length === 1 ? "" : "s"}
            {selectedIds.length ? ` · ${selectedIds.length} selected` : ""}
          </span>
          {showSessionSpeed ? (
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-[color:var(--downloading)] tabular">↓ {formatRate(downloadRate)}</span>
              <span className="text-[color:var(--seeding)] tabular">↑ {formatRate(uploadRate)}</span>
            </span>
          ) : null}
          <span className="shrink-0">Connections {stats?.num_connections ?? 0}</span>
          {caps.dhtNodes ? <span className="shrink-0">DHT {stats?.dht_nodes ?? 0}</span> : null}
          <span className="shrink-0">Free {formatBytes(stats?.free_space ?? 0)}</span>
          <span className="min-w-0 max-w-full truncate font-mono sm:ml-auto">{stats?.external_ip || ""}</span>
        </div>
      </footer>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[min(18rem,100%)] p-0">
          <SheetHeader className="p-3">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <FilterSidebar
            filters={sidebarFilterTree}
            selected={filters}
            onSelect={(next) => {
              setFilters(next);
              setSidebarOpen(false);
            }}
            showZero={showZeroFilters}
            labelPluginEnabled={labelPluginEnabled}
            definedLabels={labels}
            sessionStates={sessionCatalog.states}
            sessionTrackers={sessionCatalog.trackers}
            sessionLabels={sessionCatalog.labels}
            onLabelsChanged={onLabelsChanged}
            showLabelGroup={caps.kind === "deluge" || Boolean(ui?.filters?.label)}
            loading={sidebarLoading}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent
          showCloseButton={false}
          className={INSPECTOR_DIALOG_CLASS}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{primaryTorrent?.name || "Inspector"}</DialogTitle>
          </DialogHeader>
          <TorrentDetails
            torrentId={primary}
            torrent={primaryTorrent ?? null}
            className="h-full min-h-0"
            variant="dialog"
            onAct={act}
            onRemove={openRemove}
            onMove={openMove}
            onClose={() => setDetailsOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <RemoveTorrentDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        ids={selectedIds}
        onRemoved={() => setSelected(new Set())}
      />
      <MoveTorrentDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        ids={selectedIds}
        currentPath={downloadPath}
      />
      <PreferencesDialog
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
        onWebConfigChange={applyWebUi}
      />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      {caps.connectionManager ? (
      <Dialog open={hostsOpen} onOpenChange={setHostsOpen}>
        <DialogContent className="max-w-3xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Connection Manager</DialogTitle>
          </DialogHeader>
          <ConnectionManager
            embedded
            onConnecting={beginHostSwitch}
            onConnected={finishHostSwitch}
            onConnectFailed={abortHostSwitch}
          />
        </DialogContent>
      </Dialog>
      ) : null}
    </div>
  );
}

function focusVisibleTorrentSearch(): boolean {
  const nodes = document.querySelectorAll<HTMLInputElement>(TORRENT_SEARCH_SELECTOR);
  for (const node of nodes) {
    if (node.getClientRects().length === 0) continue;
    node.focus();
    node.select();
    return true;
  }
  return false;
}

function SearchField({
  value,
  onChange,
  className,
  autoFocus,
  title,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  autoFocus?: boolean;
  title?: string;
  placeholder: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-torrent-search=""
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search torrents"
        title={title}
        autoFocus={autoFocus}
        className="h-8 min-w-0 pl-7"
      />
    </div>
  );
}

