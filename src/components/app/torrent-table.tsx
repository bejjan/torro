"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  FolderInput,
  Gauge,
  Inbox,
  ListOrdered,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  cloneElement,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { HighlightText } from "@/components/app/highlight-text";
import { DragResizeHandle } from "@/components/app/drag-resize-handle";
import { StateBadge, stateBarClass } from "@/components/app/state-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  formatBytes,
  formatCompactDate,
  formatDuration,
  formatLimit,
  formatProgress,
  formatQueue,
  formatTorrentEta,
  formatTorrentRate,
  formatRatio,
  formatSwarmCount,
} from "@/lib/deluge/format";
import {
  COLUMN_REORDER_DRAG_THRESHOLD,
  TORRENT_COLUMNS,
  columnDropEdge,
  dropIndexFromX,
  isIdentityColumnDrop,
  type TorrentColumn,
  type TorrentColumnId,
} from "@/lib/deluge/torrent-columns";
import {
  TORRENT_FILTER_EMPTY_HINT,
  TORRENT_FILTER_EMPTY_TITLE,
  TORRENT_SEARCH_EMPTY_HINT,
  torrentSearchEmptyTitle,
} from "@/lib/deluge/torrent-empty-state";
import type { ClientKind } from "@/lib/deluge/client";
import type { TorrentSortKey } from "@/lib/deluge/torrent-list";
import type { TorrentStatus } from "@/lib/deluge/types";
import {
  applyVisibleSelection,
  idsBetween,
  moveListSelection,
  resolveRangeAnchor,
  visibleSelectionState,
} from "@/lib/deluge/selection";
import {
  TORRENT_CONNECTION_LIMIT_PRESETS,
  TORRENT_SPEED_LIMIT_PRESETS_KIB,
  TORRENT_UPLOAD_SLOT_LIMIT_PRESETS,
  torrentAutoManagedLabel,
  torrentAutoManagedRadioValue,
  torrentLimitCustomMarks,
  torrentLimitMenuCaps,
  torrentLimitRadioValue,
} from "@/lib/deluge/torrent-limit-menu";
import { torrentIsPaused } from "@/lib/deluge/torrent-pause-resume";
import { SELECT_COLUMN_ID } from "@/lib/deluge/ui-layout";
import { cn } from "@/lib/utils";

/** Fixed row height keeps scrolling smooth and avoids measuring 1000+ rows. */
export const TORRENT_ROW_HEIGHT = 36;
const ROW_OVERSCAN = 10;
const TORRENT_SKELETON_ROWS = 14;
const TORRENT_SKELETON_NAME_WIDTHS = ["w-[72%]", "w-[58%]", "w-[81%]", "w-[64%]"] as const;

type TorrentRowTone = {
  striped: boolean;
  selected: boolean;
  selectedAbove?: boolean;
  selectedBelow?: boolean;
};

/**
 * Finder-style zebra + inset rounded selection. Header stays full-bleed; body
 * highlight is inset via the overlay (`left-1.5` / `right-1.5`). Do not use a
 * thick side-border gutter — `border-left-width` / `border-right-width` clips
 * `border-radius` so the curve looks cut off. Do not round first/last `<td>`
 * either: the checkbox column is ~32–40×36px, so `rounded-md` on that cell
 * reads as a pill. Paint one continuous `rounded-md` overlay behind the row.
 * Content gutter is padding, matching header `pl-3.5` / `pr-3.5`.
 */
export function torrentRowClassName(_tone: TorrentRowTone): string {
  return cn(
    "group relative isolate cursor-default [transform:translateZ(0)]",
    // Overlay is the last `td` (out of flow). Content cells stack above it.
    "[&>td:not([data-row-highlight])]:relative [&>td:not([data-row-highlight])]:z-10"
  );
}

/** Full-row highlight: `rounded-md` (`--radius-md`, same as buttons), not cell corners. */
export function torrentRowHighlightClassName({
  striped,
  selected,
  selectedAbove = false,
  selectedBelow = false,
}: TorrentRowTone): string {
  const mergeTop = selected && selectedAbove;
  const mergeBottom = selected && selectedBelow;
  return cn(
    "pointer-events-none absolute inset-y-0 left-1.5 right-1.5 z-0 block border-0 p-0",
    mergeTop && mergeBottom
      ? "rounded-none"
      : mergeTop
        ? "rounded-b-md"
        : mergeBottom
          ? "rounded-t-md"
          : "rounded-md",
    !selected && striped && "bg-muted/50",
    selected && "bg-primary/10"
  );
}

export type TorrentRowEntry = [id: string, torrent: TorrentStatus];

export type TorrentTableProps = {
  torrents: TorrentRowEntry[];
  selected: Set<string>;
  activeId: string | null;
  sortKey: TorrentSortKey;
  sortDir: "asc" | "desc";
  search: string;
  shownColumns: TorrentColumn[];
  visibleColumnIds: Set<TorrentColumnId>;
  tableMinWidth: number;
  widthFor: (id: string) => number;
  labels: string[];
  clientKind: ClientKind;
  loading: boolean;
  hasUi: boolean;
  mobile: boolean;
  onToggleSort: (key: TorrentSortKey) => void;
  onResizeColumn: (id: string, dx: number) => void;
  onReorderColumns: (draggedId: TorrentColumnId, beforeId: TorrentColumnId | null) => void;
  onSetColumnVisible: (id: TorrentColumnId, visible: boolean) => void;
  onSelectedChange: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  onActiveIdChange: (id: string | null) => void;
  onOpenDetails: (id: string) => void;
  onAct: (method: string, torrentIds?: string[]) => void;
  onSetLabel: (label: string, torrentIds?: string[]) => void;
  onSetOptions: (options: Record<string, unknown>, torrentIds?: string[]) => void;
  onRemove: (torrentIds: string[]) => void;
  onMove: (torrentIds: string[]) => void;
};

type RowHandlers = {
  clickRow: (id: string, e: MouseEvent) => void;
  selectForContext: (id: string) => string[];
  toggleChecked: (id: string, checked: boolean) => void;
  openDetails: (id: string) => void;
  act: (method: string, torrentIds?: string[]) => void;
  setLabel: (label: string, torrentIds?: string[]) => void;
  setOptions: (options: Record<string, unknown>, torrentIds?: string[]) => void;
  remove: (torrentIds: string[]) => void;
  move: (torrentIds: string[]) => void;
};

/** If the row is already selected, operate on the full selection; otherwise only that row. */
export function contextActionIds(selected: Set<string>, rowId: string): string[] {
  return selected.has(rowId) ? [...selected] : [rowId];
}

/** Torrents the context menu will apply limit actions to. */
export function contextLimitTorrents(
  rowId: string,
  row: TorrentStatus,
  selected: Set<string>,
  torrentById: ReadonlyMap<string, TorrentStatus>
): TorrentStatus[] {
  const ids = contextActionIds(selected, rowId);
  const subjects: TorrentStatus[] = [];
  for (const actionId of ids) {
    const subject = actionId === rowId ? row : torrentById.get(actionId);
    if (subject) subjects.push(subject);
  }
  return subjects.length > 0 ? subjects : [row];
}

export const TorrentTable = memo(function TorrentTable({
  torrents,
  selected,
  activeId,
  sortKey,
  sortDir,
  search,
  shownColumns,
  visibleColumnIds,
  tableMinWidth,
  widthFor,
  labels,
  clientKind,
  loading,
  hasUi,
  mobile,
  onToggleSort,
  onResizeColumn,
  onReorderColumns,
  onSetColumnVisible,
  onSelectedChange,
  onActiveIdChange,
  onOpenDetails,
  onAct,
  onSetLabel,
  onSetOptions,
  onRemove,
  onMove,
}: TorrentTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rangeAnchorIdRef = useRef<string | null>(null);
  const ids = useMemo(() => torrents.map(([id]) => id), [torrents]);
  const torrentById = useMemo(() => new Map(torrents), [torrents]);
  const headerSelect = visibleSelectionState(ids, selected);
  const colCount = shownColumns.length + 1;

  const handlersRef = useRef<RowHandlers>(null!);
  handlersRef.current = {
    clickRow(id, e) {
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey) {
        onSelectedChange((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        rangeAnchorIdRef.current = id;
        onActiveIdChange(id);
        return;
      }
      if (e.shiftKey) {
        const anchorId = resolveRangeAnchor(ids, rangeAnchorIdRef.current, activeId);
        if (anchorId) {
          rangeAnchorIdRef.current = anchorId;
          onSelectedChange(new Set(idsBetween(ids, anchorId, id)));
          onActiveIdChange(id);
          return;
        }
      }
      rangeAnchorIdRef.current = id;
      onSelectedChange(new Set([id]));
      onActiveIdChange(id);
      if (mobile) onOpenDetails(id);
    },
    selectForContext(id) {
      const actionIds = contextActionIds(selected, id);
      if (!selected.has(id)) onSelectedChange(new Set(actionIds));
      rangeAnchorIdRef.current = id;
      onActiveIdChange(id);
      return actionIds;
    },
    toggleChecked(id, checked) {
      onSelectedChange((prev) => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
      rangeAnchorIdRef.current = id;
      onActiveIdChange(id);
    },
    openDetails(id) {
      rangeAnchorIdRef.current = id;
      onActiveIdChange(id);
      onOpenDetails(id);
    },
    act: onAct,
    setLabel: onSetLabel,
    setOptions: onSetOptions,
    remove: onRemove,
    move: onMove,
  };

  const shownColumnsRef = useRef(shownColumns);
  shownColumnsRef.current = shownColumns;
  const headerCellsRef = useRef(new Map<string, HTMLTableCellElement>());
  const suppressSortRef = useRef(false);
  const reorderSessionRef = useRef(false);
  const [dragId, setDragId] = useState<TorrentColumnId | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const setHeaderCell = useCallback((id: string, node: HTMLTableCellElement | null) => {
    if (node) headerCellsRef.current.set(id, node);
    else headerCellsRef.current.delete(id);
  }, []);

  const startReorder = useCallback(
    (id: TorrentColumnId, event: ReactPointerEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (reorderSessionRef.current) return;
      if (shownColumnsRef.current.length < 2) return;

      reorderSessionRef.current = true;
      const startX = event.clientX;
      const startY = event.clientY;
      const target = event.currentTarget;
      const pointerId = "pointerId" in event ? event.pointerId : undefined;
      let dragging = false;
      let currentDrop: number | null = null;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      const measureDrop = (clientX: number) => {
        const mids: number[] = [];
        for (const column of shownColumnsRef.current) {
          const el = headerCellsRef.current.get(column.id);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          mids.push(rect.left + rect.width / 2);
        }
        return dropIndexFromX(mids, clientX);
      };

      const move = (clientX: number, clientY: number, ev?: PointerEvent) => {
        if (!dragging) {
          if (Math.hypot(clientX - startX, clientY - startY) < COLUMN_REORDER_DRAG_THRESHOLD) return;
          dragging = true;
          setDragId(id);
          document.body.style.cursor = "grabbing";
          document.body.style.userSelect = "none";
          if (pointerId != null) {
            try {
              target.setPointerCapture(pointerId);
            } catch {
              /* synthetic pointers may reject capture */
            }
          }
        }
        if (ev) ev.preventDefault();
        const nextDrop = measureDrop(clientX);
        currentDrop = nextDrop;
        setDropIndex(nextDrop);
      };

      const onPointerMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY, ev);
      const onMouseMove = (ev: globalThis.MouseEvent) => move(ev.clientX, ev.clientY);
      const stop = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", stop);
        if (pointerId != null && target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        reorderSessionRef.current = false;
        if (dragging) {
          suppressSortRef.current = true;
          window.setTimeout(() => {
            suppressSortRef.current = false;
          }, 0);
          const from = shownColumnsRef.current.findIndex((column) => column.id === id);
          const drop = currentDrop ?? from;
          if (from >= 0 && !isIdentityColumnDrop(from, drop)) {
            const beforeId =
              drop >= shownColumnsRef.current.length
                ? null
                : shownColumnsRef.current[drop]?.id ?? null;
            onReorderColumns(id, beforeId);
          }
          setDragId(null);
          setDropIndex(null);
        }
      };

      if (pointerId != null) {
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
      } else {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", stop);
      }
    },
    [onReorderColumns]
  );

  const onHeaderSortClick = useCallback(
    (key: TorrentSortKey) => {
      if (suppressSortRef.current) {
        suppressSortRef.current = false;
        return;
      }
      onToggleSort(key);
    },
    [onToggleSort]
  );

  // useVirtualizer returns unstable function identities; skip React Compiler memoization of this body.
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer owns scroll; parent TorrentTable is memoized
  const virtualizer = useVirtualizer({
    count: torrents.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TORRENT_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    getItemKey: (index) => torrents[index]?.[0] ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const scrollRowIntoView = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index, { align: "auto" });
    },
    [virtualizer]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, [contenteditable=true]"))) return;

      const lastIndex = ids.length - 1;
      if (lastIndex < 0) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onSelectedChange(new Set(ids));
        return;
      }

      const current = activeId ? ids.indexOf(activeId) : -1;

      const moveTo = (index: number, shift: boolean) => {
        const moved = moveListSelection({
          ids,
          activeId,
          anchorId: rangeAnchorIdRef.current,
          nextIndex: index,
          shift,
        });
        if (!moved) return;
        rangeAnchorIdRef.current = moved.anchorId;
        onSelectedChange(new Set(moved.selected));
        onActiveIdChange(moved.activeId);
        scrollRowIntoView(ids.indexOf(moved.activeId));
      };

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveTo(current < 0 ? 0 : current + 1, e.shiftKey);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveTo(current < 0 ? 0 : current - 1, e.shiftKey);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        moveTo(0, e.shiftKey);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        moveTo(lastIndex, e.shiftKey);
        return;
      }
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / TORRENT_ROW_HEIGHT) - 1);
        moveTo(current < 0 ? 0 : current + (e.key === "PageDown" ? page : -page), e.shiftKey);
        return;
      }
      if (e.key === "Enter" && activeId) {
        e.preventDefault();
        onOpenDetails(activeId);
        return;
      }
      if (e.key === " " && activeId) {
        e.preventDefault();
        handlersRef.current.toggleChecked(activeId, !selected.has(activeId));
      }
    },
    [activeId, ids, onActiveIdChange, onOpenDetails, onSelectedChange, scrollRowIntoView, selected]
  );

  if (loading && !hasUi) {
    return (
      <TorrentListSkeleton
        shownColumns={shownColumns}
        tableMinWidth={tableMinWidth}
        widthFor={widthFor}
      />
    );
  }

  if (torrents.length === 0) {
    const query = search.trim();
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Inbox className="size-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium" title={query ? torrentSearchEmptyTitle(search, false) : undefined}>
          {query ? torrentSearchEmptyTitle(search) : TORRENT_FILTER_EMPTY_TITLE}
        </p>
        <p className="text-sm text-muted-foreground">
          {query ? TORRENT_SEARCH_EMPTY_HINT : TORRENT_FILTER_EMPTY_HINT}
        </p>
      </div>
    );
  }

  const dragFromIndex = dragId ? shownColumns.findIndex((column) => column.id === dragId) : -1;

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-auto outline-none focus:outline-none"
      tabIndex={0}
      aria-label="Torrent list"
      onKeyDown={onKeyDown}
    >
      <table
        className="table-fixed border-separate border-spacing-0 text-sm"
        // Pixel sum of <col> widths. width:100% redistributes leftover viewport space
        // across columns, so resizing one header shrinks/grows the others.
        style={{ width: tableMinWidth }}
      >
        <colgroup>
          <col style={{ width: widthFor(SELECT_COLUMN_ID) }} />
          {shownColumns.map((column) => (
            <col key={column.id} style={{ width: widthFor(column.id) }} />
          ))}
        </colgroup>
        <thead className={cn("sticky top-0 z-10 bg-background [&_th]:border-b", dragId && "touch-none")}>
          <ContextMenu>
            <ContextMenuTrigger render={<tr className="text-left text-xs" />}>
              <th className="relative py-2 pr-2 pl-3.5">
                <Checkbox
                  checked={headerSelect.checked}
                  indeterminate={headerSelect.indeterminate}
                  onCheckedChange={(v) => {
                    onSelectedChange((prev) => applyVisibleSelection(prev, ids, Boolean(v)));
                  }}
                />
                <DragResizeHandle
                  ariaLabel="Resize selection column"
                  onDelta={(dx) => onResizeColumn(SELECT_COLUMN_ID, dx)}
                />
              </th>
              {shownColumns.map((column, index) => {
                const dropEdge =
                  dragFromIndex >= 0 && dropIndex != null
                    ? columnDropEdge(index, dropIndex, dragFromIndex, shownColumns.length)
                    : null;
                return (
                  <Th
                    key={column.id}
                    columnId={column.id}
                    onClick={() => onHeaderSortClick(column.sortKey)}
                    active={sortKey === column.sortKey}
                    dir={sortDir}
                    dragging={dragId === column.id}
                    dropEdge={dropEdge}
                    headerRef={(node) => setHeaderCell(column.id, node)}
                    onReorderPointerDown={(event) => startReorder(column.id, event)}
                    onResize={(dx) => onResizeColumn(column.id, dx)}
                    last={index === shownColumns.length - 1}
                  >
                    {column.label}
                  </Th>
                );
              })}
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-52" side="bottom" align="start">
              {/* GroupLabel throws without Group: "MenuGroupContext is missing". */}
              <ContextMenuGroup>
                <ContextMenuLabel>Columns</ContextMenuLabel>
                {TORRENT_COLUMNS.map((column) => (
                  <ContextMenuCheckboxItem
                    key={column.id}
                    checked={visibleColumnIds.has(column.id)}
                    disabled={!column.hideable}
                    onCheckedChange={(checked) => onSetColumnVisible(column.id, checked)}
                  >
                    {column.label === "#" ? "# Queue" : column.label}
                  </ContextMenuCheckboxItem>
                ))}
              </ContextMenuGroup>
            </ContextMenuContent>
          </ContextMenu>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {virtualRows.map((virtualRow) => {
            const entry = torrents[virtualRow.index];
            if (!entry) return null;
            const [id, torrent] = entry;
            const prevId = torrents[virtualRow.index - 1]?.[0];
            const nextId = torrents[virtualRow.index + 1]?.[0];
            return (
              <TorrentRow
                key={id}
                torrentId={id}
                torrent={torrent}
                striped={virtualRow.index % 2 === 1}
                selected={selected.has(id)}
                selectedIds={selected}
                torrentById={torrentById}
                selectedAbove={!!prevId && selected.has(prevId)}
                selectedBelow={!!nextId && selected.has(nextId)}
                shownColumns={shownColumns}
                query={search}
                labels={labels}
                clientKind={clientKind}
                handlersRef={handlersRef}
                height={virtualRow.size}
              />
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
});

function TorrentListSkeleton({
  shownColumns,
  tableMinWidth,
  widthFor,
}: {
  shownColumns: TorrentColumn[];
  tableMinWidth: number;
  widthFor: (id: string) => number;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto" aria-busy="true" aria-label="Torrent list">
      <span className="sr-only">Loading torrents</span>
      <table
        className="table-fixed border-separate border-spacing-0 text-sm"
        style={{ width: tableMinWidth }}
      >
        <colgroup>
          <col style={{ width: widthFor(SELECT_COLUMN_ID) }} />
          {shownColumns.map((column) => (
            <col key={column.id} style={{ width: widthFor(column.id) }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background [&_th]:border-b">
          <tr className="text-left text-xs">
            <th className="relative py-2 pr-2 pl-3.5">
              <div className="size-4 animate-pulse rounded-md bg-muted" />
            </th>
            {shownColumns.map((column, index) => (
              <th
                key={column.id}
                className={cn(
                  "truncate py-2 font-medium text-muted-foreground",
                  index === shownColumns.length - 1 ? "pr-3.5 pl-2" : "px-2"
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: TORRENT_SKELETON_ROWS }, (_, row) => {
            const striped = row % 2 === 1;
            return (
              <tr
                key={row}
                className={torrentRowClassName({ striped, selected: false })}
                style={{ height: TORRENT_ROW_HEIGHT }}
              >
                <td className="overflow-hidden py-1.5 pr-2 pl-3.5 whitespace-nowrap">
                  <div className="size-4 animate-pulse rounded-md bg-muted" />
                </td>
                {shownColumns.map((column, index) => (
                  <td
                    key={column.id}
                    className={cn(
                      "max-w-0 min-w-0 overflow-hidden px-2 py-1.5 align-middle",
                      index === shownColumns.length - 1 && "pr-3.5"
                    )}
                  >
                    <TorrentSkeletonCell column={column} row={row} />
                  </td>
                ))}
                <td
                  aria-hidden
                  data-row-highlight=""
                  className={torrentRowHighlightClassName({ striped, selected: false })}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TorrentSkeletonCell({ column, row }: { column: TorrentColumn; row: number }) {
  if (column.id === "progress") {
    return <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />;
  }
  if (column.id === "status") {
    return <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />;
  }
  if (column.id === "name") {
    return (
      <div
        className={cn(
          "h-3 animate-pulse rounded-md bg-muted",
          TORRENT_SKELETON_NAME_WIDTHS[row % TORRENT_SKELETON_NAME_WIDTHS.length]
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "h-3 animate-pulse rounded-md bg-muted",
        column.numeric ? "ml-auto w-10" : "w-[55%]"
      )}
    />
  );
}

const TorrentRow = memo(function TorrentRow({
  torrentId,
  torrent,
  striped,
  selected,
  selectedIds,
  torrentById,
  selectedAbove,
  selectedBelow,
  shownColumns,
  query,
  labels,
  clientKind,
  handlersRef,
  height,
}: {
  torrentId: string;
  torrent: TorrentStatus;
  striped: boolean;
  selected: boolean;
  selectedIds: Set<string>;
  torrentById: ReadonlyMap<string, TorrentStatus>;
  selectedAbove: boolean;
  selectedBelow: boolean;
  shownColumns: TorrentColumn[];
  query: string;
  labels: string[];
  clientKind: ClientKind;
  handlersRef: { current: RowHandlers };
  height: number;
}) {
  const id = torrentId;
  const limitCaps = torrentLimitMenuCaps(clientKind);
  const customLimits = torrentLimitCustomMarks(
    contextLimitTorrents(id, torrent, selectedIds, torrentById),
    limitCaps
  );
  const applyOptions = (options: Record<string, unknown>) => {
    handlersRef.current.setOptions(options, handlersRef.current.selectForContext(id));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <tr
            className={torrentRowClassName({
              striped,
              selected,
              selectedAbove,
              selectedBelow,
            })}
            style={{ height }}
            onClick={(e) => handlersRef.current.clickRow(id, e)}
            onContextMenu={() => {
              handlersRef.current.selectForContext(id);
            }}
            onDoubleClick={() => handlersRef.current.openDetails(id)}
          />
        }
      >
        <td className="overflow-hidden py-1.5 pr-2 pl-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => {
              handlersRef.current.toggleChecked(id, Boolean(v));
            }}
          />
        </td>
        {shownColumns.map((column, index) => (
          <TorrentColumnCell
            key={column.id}
            column={column}
            torrent={torrent}
            query={query}
            last={index === shownColumns.length - 1}
          />
        ))}
        <td
          aria-hidden
          data-row-highlight=""
          className={torrentRowHighlightClassName({
            striped,
            selected,
            selectedAbove,
            selectedBelow,
          })}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem
          onClick={() => {
            handlersRef.current.selectForContext(id);
            handlersRef.current.openDetails(id);
          }}
        >
          <AppWindow /> Open inspector...
        </ContextMenuItem>
        <ContextMenuSeparator />
        {torrentIsPaused(torrent.state) ? (
          <ContextMenuItem
            onClick={() => {
              handlersRef.current.act("core.resume_torrent", handlersRef.current.selectForContext(id));
            }}
          >
            <Play /> Resume
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={() => {
              handlersRef.current.act("core.pause_torrent", handlersRef.current.selectForContext(id));
            }}
          >
            <Pause /> Pause
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <ListOrdered /> Queue
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onClick={() =>
                handlersRef.current.act("core.queue_top", handlersRef.current.selectForContext(id))
              }
            >
              <ChevronsUp /> Top
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                handlersRef.current.act("core.queue_up", handlersRef.current.selectForContext(id))
              }
            >
              <ArrowUp /> Up
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                handlersRef.current.act("core.queue_down", handlersRef.current.selectForContext(id))
              }
            >
              <ArrowDown /> Down
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                handlersRef.current.act("core.queue_bottom", handlersRef.current.selectForContext(id))
              }
            >
              <ChevronsDown /> Bottom
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger mark={customLimits.any ? <CustomLimitMark /> : undefined}>
            <Gauge /> Limits
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            {limitCaps.downloadSpeed ? (
              <LimitPresetSubmenu
                label="D/L Speed Limit"
                presets={TORRENT_SPEED_LIMIT_PRESETS_KIB}
                unit="KiB/s"
                current={torrent.max_download_speed}
                custom={customLimits.downloadSpeed}
                onSelect={(value) => applyOptions({ max_download_speed: value })}
              />
            ) : null}
            {limitCaps.uploadSpeed ? (
              <LimitPresetSubmenu
                label="U/L Speed Limit"
                presets={TORRENT_SPEED_LIMIT_PRESETS_KIB}
                unit="KiB/s"
                current={torrent.max_upload_speed}
                custom={customLimits.uploadSpeed}
                onSelect={(value) => applyOptions({ max_upload_speed: value })}
              />
            ) : null}
            {limitCaps.connections ? (
              <LimitPresetSubmenu
                label="Connection Limit"
                presets={TORRENT_CONNECTION_LIMIT_PRESETS}
                current={torrent.max_connections}
                custom={customLimits.connections}
                onSelect={(value) => applyOptions({ max_connections: value })}
              />
            ) : null}
            {limitCaps.uploadSlots ? (
              <LimitPresetSubmenu
                label="Upload Slot Limit"
                presets={TORRENT_UPLOAD_SLOT_LIMIT_PRESETS}
                current={torrent.max_upload_slots}
                custom={customLimits.uploadSlots}
                onSelect={(value) => applyOptions({ max_upload_slots: value })}
              />
            ) : null}
            {limitCaps.autoManaged ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>{torrentAutoManagedLabel(clientKind)}</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuRadioGroup
                    value={torrentAutoManagedRadioValue(Boolean(torrent.is_auto_managed))}
                    onValueChange={(value) => {
                      const enabled = value === "on";
                      applyOptions({ is_auto_managed: enabled, auto_managed: enabled });
                    }}
                  >
                    <ContextMenuRadioItem
                      value="on"
                      onClick={() => applyOptions({ is_auto_managed: true, auto_managed: true })}
                    >
                      On
                    </ContextMenuRadioItem>
                    <ContextMenuRadioItem
                      value="off"
                      onClick={() => applyOptions({ is_auto_managed: false, auto_managed: false })}
                    >
                      Off
                    </ContextMenuRadioItem>
                  </ContextMenuRadioGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : null}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem
          onClick={() => {
            handlersRef.current.move(handlersRef.current.selectForContext(id));
          }}
        >
          <FolderInput /> Move storage…
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            handlersRef.current.act("core.force_recheck", handlersRef.current.selectForContext(id))
          }
        >
          <RefreshCw /> Force recheck
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Label</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onClick={() => handlersRef.current.setLabel("", handlersRef.current.selectForContext(id))}
            >
              No label
            </ContextMenuItem>
            {labels.map((lab) => (
              <ContextMenuItem
                key={lab}
                onClick={() => handlersRef.current.setLabel(lab, handlersRef.current.selectForContext(id))}
              >
                {lab}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => {
            handlersRef.current.remove(handlersRef.current.selectForContext(id));
          }}
        >
          <Trash2 /> Remove...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

function CustomLimitMark() {
  return (
    <>
      <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Custom" aria-hidden />
      <span className="sr-only">Custom</span>
    </>
  );
}

function LimitPresetSubmenu({
  label,
  presets,
  unit,
  current,
  custom,
  onSelect,
}: {
  label: string;
  presets: readonly number[];
  unit?: string;
  current: number;
  custom: boolean;
  onSelect: (value: number) => void;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger mark={custom ? <CustomLimitMark /> : undefined}>{label}</ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuRadioGroup
          value={torrentLimitRadioValue(current, presets)}
          onValueChange={(value) => onSelect(Number(value))}
        >
          {presets.map((preset) => (
            <ContextMenuRadioItem
              key={preset}
              value={String(preset)}
              onClick={() => onSelect(preset)}
            >
              {unit ? `${preset} ${unit}` : String(preset)}
            </ContextMenuRadioItem>
          ))}
          <ContextMenuRadioItem value="-1" onClick={() => onSelect(-1)}>
            Unlimited
          </ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function Th({
  children,
  columnId,
  onClick,
  active,
  dir,
  dragging,
  dropEdge,
  headerRef,
  onReorderPointerDown,
  onResize,
  last = false,
}: {
  children: React.ReactNode;
  columnId: TorrentColumnId;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  dragging: boolean;
  dropEdge: "before" | "after" | null;
  headerRef: (node: HTMLTableCellElement | null) => void;
  onReorderPointerDown: (event: ReactPointerEvent<HTMLTableCellElement> | MouseEvent<HTMLTableCellElement>) => void;
  onResize: (dx: number) => void;
  last?: boolean;
}) {
  return (
    <th
      ref={headerRef}
      data-column-id={columnId}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      aria-grabbed={dragging || undefined}
      className={cn(
        "relative overflow-visible cursor-default p-0 select-none",
        dragging && "cursor-grabbing",
        active ? "bg-muted/40 text-foreground" : "text-muted-foreground"
      )}
      onPointerDown={onReorderPointerDown}
      onMouseDown={onReorderPointerDown}
      onClick={(e) => {
        if (e.button !== 0) return;
        onClick();
      }}
    >
      {dropEdge === "before" ? (
        <span
          aria-hidden
          data-drop-indicator="before"
          className="pointer-events-none absolute inset-y-0 left-0 z-30 w-0.5 -translate-x-1/2 bg-primary"
        />
      ) : null}
      {dropEdge === "after" ? (
        <span
          aria-hidden
          data-drop-indicator="after"
          className="pointer-events-none absolute inset-y-0 right-0 z-30 w-0.5 translate-x-1/2 bg-primary"
        />
      ) : null}
      <button
        type="button"
        draggable={false}
        className={cn(
          "flex w-full max-w-full cursor-default items-center gap-1 truncate py-2",
          last ? "pr-3.5 pl-2" : "px-2",
          dragging && "opacity-50",
          active ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
        )}
      >
        {children}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="size-3 shrink-0 text-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-3 shrink-0 text-foreground" aria-hidden />
          )
        ) : null}
      </button>
      <DragResizeHandle ariaLabel="Resize column" onDelta={onResize} />
    </th>
  );
}

function formatAvail(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "∞";
  return value.toFixed(3);
}

const EMPTY_CELL = "—";

/** Full cell string for an overflow tooltip, or undefined for empty placeholders. */
export function overflowTooltipLabel(text: string): string | undefined {
  if (!text || text === EMPTY_CELL) return undefined;
  return text;
}

/** Lazy overflow check — measure on hover, not by observing every virtualized cell. */
export function cellTextOverflows(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth;
}

function torrentColumnCellText(column: TorrentColumn, t: TorrentStatus): string {
  switch (column.id) {
    case "queue":
      return formatQueue(t.queue);
    case "name":
      return t.name;
    case "size":
      return formatBytes(t.total_wanted);
    case "progress":
      return formatProgress(t.progress);
    case "status":
      return t.state;
    case "down":
      return formatTorrentRate(t.download_payload_rate);
    case "up":
      return formatTorrentRate(t.upload_payload_rate);
    case "eta":
      return formatTorrentEta(t.eta, t.progress);
    case "ratio":
      return formatRatio(t.ratio);
    case "seeds":
      return formatSwarmCount(t.num_seeds, t.total_seeds);
    case "peers":
      return formatSwarmCount(t.num_peers, t.total_peers);
    case "label":
      return t.label || EMPTY_CELL;
    case "avail":
      return formatAvail(t.distributed_copies);
    case "added":
      return formatCompactDate(t.time_added);
    case "tracker":
      return t.tracker_host || EMPTY_CELL;
    case "save_path":
      return t.download_location || EMPTY_CELL;
    case "downloaded":
      return formatBytes(t.total_done);
    case "uploaded":
      return formatBytes(t.total_uploaded);
    case "remaining":
      return formatBytes(t.total_remaining);
    case "complete_seen":
      return formatCompactDate(t.last_seen_complete);
    case "completed":
      return formatCompactDate(t.completed_time);
    case "auto_managed":
      return t.is_auto_managed ? "Yes" : "No";
    case "down_limit":
      return formatLimit(t.max_download_speed);
    case "up_limit":
      return formatLimit(t.max_upload_speed);
    case "seeds_peers":
      return formatAvail(t.seeds_peers_ratio);
    case "last_transfer":
      return formatDuration(t.time_since_transfer);
  }
}

/**
 * Tooltip with the full untruncated string, only when the node actually clips.
 * Measured on pointer enter / open — not with a ResizeObserver per cell.
 * Error status already has its own Tooltip; skip nesting.
 */
function OverflowTooltip({
  text,
  className,
  children,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  const label = overflowTooltipLabel(text);
  const overflowingRef = useRef(false);
  const [open, setOpen] = useState(false);

  if (!label) {
    return <div className={className}>{children}</div>;
  }

  return (
    <TooltipProvider delay={400}>
      <Tooltip
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            return;
          }
          if (overflowingRef.current) setOpen(true);
        }}
      >
        <TooltipTrigger
          delay={400}
          render={
            <div
              className={className}
              onPointerEnter={(event) => {
                overflowingRef.current = cellTextOverflows(event.currentTarget);
              }}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-left whitespace-normal break-words">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const TorrentColumnCell = memo(function TorrentColumnCell({
  column,
  torrent: t,
  query,
  last,
}: {
  column: TorrentColumn;
  torrent: TorrentStatus;
  query: string;
  last?: boolean;
}) {
  const text = torrentColumnCellText(column, t);
  const hit = (value: string) => <HighlightText text={value} query={query} />;
  const cell = (() => {
    switch (column.id) {
      case "queue":
        return <td className="px-2 py-1.5 tabular text-muted-foreground">{hit(text)}</td>;
      case "name":
        return <td className="px-2 py-1.5 font-medium">{hit(text)}</td>;
      case "size":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "progress":
        return (
          <td className="px-2 py-1.5">
            <div className="flex min-w-0 w-full flex-1 items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div
                  className={cn("h-full rounded-full", stateBarClass(t.state))}
                  style={{ width: `${Math.min(100, t.progress)}%` }}
                />
              </div>
              <span className="shrink-0 tabular text-xs">
                <OverflowTooltip text={text} className="truncate">
                  {hit(text)}
                </OverflowTooltip>
              </span>
            </div>
          </td>
        );
      case "status":
        return (
          <td className="px-2 py-1.5">
            <StateBadge state={t.state} message={t.message}>
              {hit(text)}
            </StateBadge>
          </td>
        );
      case "down":
        return (
          <td className="px-2 py-1.5 tabular text-[color:var(--downloading)]">{hit(text)}</td>
        );
      case "up":
        return (
          <td className="px-2 py-1.5 tabular text-[color:var(--seeding)]">{hit(text)}</td>
        );
      case "eta":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "ratio":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "seeds":
        return <td className="px-2 py-1.5 tabular text-muted-foreground">{hit(text)}</td>;
      case "peers":
        return <td className="px-2 py-1.5 tabular text-muted-foreground">{hit(text)}</td>;
      case "label":
        return <td className="px-2 py-1.5 text-muted-foreground">{hit(text)}</td>;
      case "avail":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "added":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "tracker":
        return <td className="px-2 py-1.5 text-muted-foreground">{hit(text)}</td>;
      case "save_path":
        return <td className="px-2 py-1.5 text-muted-foreground">{hit(text)}</td>;
      case "downloaded":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "uploaded":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "remaining":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "complete_seen":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "completed":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "auto_managed":
        return <td className="px-2 py-1.5 text-muted-foreground">{hit(text)}</td>;
      case "down_limit":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "up_limit":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "seeds_peers":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
      case "last_transfer":
        return <td className="px-2 py-1.5 tabular">{hit(text)}</td>;
    }
  })();
  if (!cell) return null;
  const typed = cell as ReactElement<{ className?: string; children?: React.ReactNode }>;
  const isProgress = column.id === "progress";
  // Error badges already ship a Tooltip; nesting another trigger fights Base UI hover.
  const tooltipText = column.id === "status" && t.state === "Error" ? "" : isProgress ? "" : text;
  return cloneElement(typed, {
    className: cn(
      typed.props.className,
      // table-layout:fixed still lets min-content wrap; max-w-0 + nowrap/ellipsis clips to the col width.
      "max-w-0 min-w-0 overflow-hidden align-middle",
      column.numeric && "font-mono text-xs",
      !isProgress && "text-ellipsis whitespace-nowrap",
      last && "pr-3.5"
    ),
    children: (
      <OverflowTooltip
        text={tooltipText}
        className={cn(
          "min-w-0",
          // flex + text-overflow:ellipsis clips without drawing dots; progress needs flex for the bar.
          isProgress ? "flex h-full w-full items-center" : "truncate"
        )}
      >
        {typed.props.children}
      </OverflowTooltip>
    ),
  });
});
