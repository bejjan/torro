"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  FolderInput,
  ListOrdered,
  MoreHorizontal,
  PanelBottom,
  PanelRight,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FileTree } from "@/components/app/torrent-file-tree";
import { OptionsForm } from "@/components/app/torrent-options-form";
import { PeerCountry } from "@/components/app/peer-country";
import { StateBadge, stateBarClass } from "@/components/app/state-badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rpc } from "@/lib/deluge/client";
import { OPTIONS_KEYS, STATUS_KEYS } from "@/lib/deluge/keys";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatProgress,
  formatRate,
  formatRatio,
  formatTorrentEta,
  formatTorrentRate,
  formatSwarmCount,
} from "@/lib/deluge/format";
import { normalizeTorrentStatus } from "@/lib/deluge/torrent-name";
import type { DetailsDock } from "@/lib/deluge/ui-layout";
import { torrentIsPaused } from "@/lib/deluge/torrent-pause-resume";
import { overlayTorrentStatus } from "@/lib/deluge/ui-merge";
import type { FileNode, TorrentPeer, TorrentStatus, TorrentTracker } from "@/lib/deluge/types";
import { cn } from "@/lib/utils";

// Underlined tabs: the marker sits on the divider above the tab content, so the
// strip reads as "views of what is below" rather than as a menu bar. State
// changes are instant (no hover or selection fade).
const INSPECTOR_TAB_CLASS =
  "h-full flex-none rounded-none border-0 px-0.5 text-[13px] text-muted-foreground transition-none after:transition-none hover:text-foreground focus-visible:ring-inset data-active:text-foreground group-data-horizontal/tabs:after:bottom-0";

// Header buttons change state instantly too.
const INSPECTOR_BUTTON_CLASS = "transition-none";

const DETAILS_STATUS_POLL_MS = 5000;
const DETAILS_PEERS_POLL_MS = 4000;
const DETAILS_EXTRA_POLL_MS = 8000;

export function TorrentDetails({
  torrentId,
  torrent,
  className,
  variant = "panel",
  dock,
  onDockChange,
  onAct,
  onRemove,
  onMove,
  onClose,
}: {
  torrentId: string | null;
  torrent: TorrentStatus | null;
  className?: string;
  variant?: "panel" | "dialog";
  dock?: DetailsDock;
  onDockChange?: (dock: DetailsDock) => void;
  onAct?: (method: string, torrentIds?: string[]) => void;
  onRemove?: (torrentIds: string[]) => void;
  onMove?: (torrentIds: string[]) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState("status");
  const [files, setFiles] = useState<FileNode | null>(null);
  const [peers, setPeers] = useState<TorrentPeer[]>([]);
  const [trackers, setTrackers] = useState<TorrentTracker[] | null>(null);
  const [detail, setDetail] = useState<TorrentStatus | null>(torrent);
  const loadGen = useRef(0);
  const filesSeq = useRef(0);
  const filesInFlight = useRef<string | null>(null);
  const [filesSettled, setFilesSettled] = useState(false);
  const detailTorrentId = useRef<string | null>(torrentId);
  const tabRef = useRef(tab);
  // Declared before the effect that calls loadDetails, so it reads the new tab.
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    const sameTorrent = detailTorrentId.current === torrentId && torrentId != null;
    detailTorrentId.current = torrentId;
    setDetail((prev) => overlayTorrentStatus(prev, torrent, sameTorrent));
    if (!sameTorrent) {
      filesSeq.current += 1;
      filesInFlight.current = null;
      setFiles(null);
      setFilesSettled(false);
      setPeers([]);
      setTrackers(null);
    }
  }, [torrent, torrentId]);

  const loadDetails = useCallback(async (options?: { refreshFiles?: boolean }) => {
    if (!torrentId) {
      filesSeq.current += 1;
      filesInFlight.current = null;
      setFiles(null);
      setFilesSettled(false);
      setPeers([]);
      setTrackers(null);
      return;
    }
    const gen = ++loadGen.current;
    const currentTab = tabRef.current;
    try {
      const jobs: Promise<void>[] = [];
      jobs.push(
        rpc<TorrentStatus>("web.get_torrent_status", [
          torrentId,
          [...STATUS_KEYS, ...OPTIONS_KEYS],
        ]).then((status) => {
          if (gen !== loadGen.current) return;
          setDetail(normalizeTorrentStatus(status));
        })
      );
      // A tree of thousands of files is a large JSON. A later poll must not
      // discard that response, or the list stays empty until one finishes in time.
      if (currentTab === "files" && (options?.refreshFiles || filesInFlight.current !== torrentId)) {
        const seq = ++filesSeq.current;
        filesInFlight.current = torrentId;
        jobs.push(
          (async () => {
            try {
              const tree = await rpc<FileNode>("web.get_torrent_files", [torrentId]);
              if (seq !== filesSeq.current || detailTorrentId.current !== torrentId) return;
              setFiles(tree);
            } finally {
              if (seq !== filesSeq.current) return;
              filesInFlight.current = null;
              setFilesSettled(true);
            }
          })()
        );
      }
      if (currentTab === "peers") {
        jobs.push(
          rpc<{ peers?: TorrentPeer[] }>("web.get_torrent_status", [torrentId, ["peers"]]).then(
            (status) => {
              if (gen !== loadGen.current) return;
              setPeers(status.peers || []);
            }
          )
        );
      }
      if (currentTab === "trackers") {
        jobs.push(
          rpc<{ trackers?: TorrentTracker[] }>("web.get_torrent_status", [
            torrentId,
            ["trackers"],
          ]).then((status) => {
            if (gen !== loadGen.current) return;
            setTrackers(status.trackers || []);
          })
        );
      }
      await Promise.all(jobs);
    } catch {
      /* polling shell still has grid fields */
    }
  }, [torrentId]);

  useEffect(() => {
    void loadDetails();
    const interval =
      tab === "peers"
        ? DETAILS_PEERS_POLL_MS
        : tab === "files" || tab === "trackers"
          ? DETAILS_EXTRA_POLL_MS
          : DETAILS_STATUS_POLL_MS;
    const id = setInterval(() => void loadDetails(), interval);
    return () => {
      loadGen.current += 1;
      clearInterval(id);
    };
  }, [loadDetails, tab]);

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className={cn("@container flex h-full min-h-0 min-w-0 flex-col gap-0", className)}
    >
      {variant === "dialog" ? (
        <InspectorStatusBar
          name={detail?.name || "Inspector"}
          onClose={onClose}
          actions={
            <InspectorActions
              torrentId={torrentId}
              paused={torrentIsPaused(detail?.state)}
              onAct={onAct}
              onRemove={onRemove}
              onMove={onMove}
            />
          }
        />
      ) : (
        <DetailsHeader
          name={detail?.name || "Details"}
          dock={dock ?? "bottom"}
          onDockChange={onDockChange}
          onClose={onClose}
        />
      )}
      <InspectorTabs dense={variant !== "dialog"} />
      {torrentId && detail ? (
        <>
          <TabsContent
            value="status"
            className={cn("min-h-0 min-w-0 overflow-auto", variant === "dialog" ? "p-4" : "p-3")}
          >
            <StatusGrid torrent={detail} large={variant === "dialog"} />
          </TabsContent>
          <TabsContent
            value="files"
            className={cn("min-h-0 min-w-0 overflow-auto", variant === "dialog" ? "p-4" : "p-3")}
          >
            {files ? (
              <FileTree
                key={torrentId}
                node={files}
                torrentId={torrentId}
                name={detail.name}
                onApplied={() => loadDetails({ refreshFiles: true })}
              />
            ) : (
              <Muted>{filesSettled ? "No files" : "Loading files…"}</Muted>
            )}
          </TabsContent>
          <TabsContent
            value="peers"
            className={cn("min-h-0 min-w-0 overflow-auto", variant === "dialog" ? "p-4" : "p-3")}
          >
            <PeerTable peers={peers} />
          </TabsContent>
          <TabsContent
            value="options"
            className={cn("min-h-0 min-w-0 overflow-auto", variant === "dialog" ? "p-4" : "p-3")}
          >
            <OptionsForm
              key={`${torrentId}:${typeof detail.max_connections === "number" || typeof detail.max_upload_slots === "number" ? "ready" : "pending"}`}
              torrentId={torrentId}
              torrent={detail}
            />
          </TabsContent>
          <TabsContent
            value="trackers"
            className={cn("min-h-0 min-w-0 overflow-auto", variant === "dialog" ? "p-4" : "p-3")}
          >
            <TrackersForm key={torrentId} torrentId={torrentId} trackers={trackers} onChange={setTrackers} />
          </TabsContent>
        </>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground",
            variant === "dialog" ? "px-4" : "px-3"
          )}
        >
          Select a torrent to inspect status, files, peers, and options.
        </div>
      )}
    </Tabs>
  );
}

function InspectorStatusBar({
  name,
  onClose,
  actions,
}: {
  name: string;
  onClose?: () => void;
  actions?: ReactNode;
}) {
  // Narrow: the name and Close share the first row and the actions wrap below.
  // From 36rem the actions sit beside the name, before Close.
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden bg-background px-3 py-2">
      <div className="order-1 min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 truncate text-sm font-medium" title={name}>
          {name}
        </div>
      </div>
      {actions ? (
        <div className="order-3 flex min-w-0 basis-full items-center gap-1 @min-[36rem]:order-2 @min-[36rem]:basis-auto">
          {actions}
          <Separator
            orientation="vertical"
            className="ml-1 hidden h-4 data-vertical:self-center @min-[36rem]:block"
          />
        </div>
      ) : null}
      {onClose ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close inspector"
          className={cn(
            "order-2 shrink-0 text-muted-foreground @min-[36rem]:order-3",
            INSPECTOR_BUTTON_CLASS
          )}
          onClick={onClose}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

function DetailsTitle({ name }: { name: string }) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      <div className="truncate text-sm font-medium" title={name}>
        {name}
      </div>
    </div>
  );
}

function DetailsHeader({
  name,
  dock,
  onDockChange,
  onClose,
}: {
  name: string;
  dock: DetailsDock;
  onDockChange?: (dock: DetailsDock) => void;
  onClose?: () => void;
}) {
  const title = <DetailsTitle name={name} />;
  const controls = (
    <div className="flex shrink-0 items-center">
      {onDockChange ? <DetailsDockControl dock={dock} onDockChange={onDockChange} /> : null}
      {onClose ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close details"
          className="text-muted-foreground"
          onClick={onClose}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden px-2 py-1">
      {onDockChange ? (
        <ContextMenu>
          <ContextMenuTrigger className="min-w-0 flex-1 overflow-hidden">
            {title}
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-56" side="bottom" align="end">
          <ContextMenuRadioGroup
            value={dock}
            onValueChange={(value) => {
              if (value === "bottom" || value === "right") {
                window.setTimeout(() => onDockChange(value), 200);
              }
            }}
          >
              <ContextMenuRadioItem value="bottom">
                <PanelBottom />
                Display at bottom
              </ContextMenuRadioItem>
              <ContextMenuRadioItem value="right">
                <PanelRight />
                Display on the right
              </ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        title
      )}
      {controls}
    </div>
  );
}

function DetailsDockControl({
  dock,
  onDockChange,
}: {
  dock: DetailsDock;
  onDockChange: (dock: DetailsDock) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex shrink-0 items-center self-stretch pr-1 pl-0.5">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Details layout"
              className="text-muted-foreground"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuRadioGroup
            value={dock}
            onValueChange={(value) => {
              if (value === "bottom" || value === "right") {
                setMenuOpen(false);
                window.setTimeout(() => onDockChange(value), 200);
              }
            }}
          >
            <DropdownMenuRadioItem value="bottom">
              <PanelBottom />
              Display at bottom
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">
              <PanelRight />
              Display on the right
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function InspectorTabs({ dense }: { dense?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-x-auto overscroll-x-contain border-b bg-background",
        dense ? "px-2" : "px-3"
      )}
    >
      <TabsList variant="line" className="h-8 w-max justify-start gap-4 p-0">
        <TabsTrigger value="status" className={INSPECTOR_TAB_CLASS}>
          Status
        </TabsTrigger>
        <TabsTrigger value="files" className={INSPECTOR_TAB_CLASS}>
          Files
        </TabsTrigger>
        <TabsTrigger value="peers" className={INSPECTOR_TAB_CLASS}>
          Peers
        </TabsTrigger>
        <TabsTrigger value="options" className={INSPECTOR_TAB_CLASS}>
          Options
        </TabsTrigger>
        <TabsTrigger value="trackers" className={INSPECTOR_TAB_CLASS}>
          Trackers
        </TabsTrigger>
      </TabsList>
    </div>
  );
}

// Pause/Resume is the one labelled action; the rest sit behind "More actions",
// in the same order and with the same icons as the torrent row context menu.
function InspectorActions({
  torrentId,
  paused,
  onAct,
  onRemove,
  onMove,
}: {
  torrentId: string | null;
  paused: boolean;
  onAct?: (method: string, torrentIds?: string[]) => void;
  onRemove?: (torrentIds: string[]) => void;
  onMove?: (torrentIds: string[]) => void;
}) {
  const ids = torrentId ? [torrentId] : [];
  const disabled = !ids.length;

  return (
    <>
      {paused ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={INSPECTOR_BUTTON_CLASS}
          onClick={() => onAct?.("core.resume_torrent", ids)}
        >
          <Play data-icon="inline-start" />
          Resume
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={INSPECTOR_BUTTON_CLASS}
          onClick={() => onAct?.("core.pause_torrent", ids)}
        >
          <Pause data-icon="inline-start" />
          Pause
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
              disabled={disabled}
              className={cn("text-muted-foreground", INSPECTOR_BUTTON_CLASS)}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ListOrdered /> Queue
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => onAct?.("core.queue_top", ids)}>
                <ChevronsUp /> Top
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAct?.("core.queue_up", ids)}>
                <ArrowUp /> Up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAct?.("core.queue_down", ids)}>
                <ArrowDown /> Down
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAct?.("core.queue_bottom", ids)}>
                <ChevronsDown /> Bottom
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => onMove?.(ids)}>
            <FolderInput /> Move storage…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAct?.("core.force_recheck", ids)}>
            <RefreshCw /> Force recheck
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onRemove?.(ids)}>
            <Trash2 /> Remove...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function statusTypeClass(large?: boolean) {
  return large ? "text-sm @min-[36rem]:text-[15px]" : "text-sm";
}

function StatusGrid({ torrent, large }: { torrent: TorrentStatus; large?: boolean }) {
  const type = statusTypeClass(large);
  return (
    <div className="grid min-w-0 divide-y">
      <StatusGroup title="Transfer" type={type}>
        <div className="grid min-w-0 gap-1.5">
          <StatusFieldList type={type}>
            <StatusRow label="Progress" value={formatProgress(torrent.progress)} type={type} />
          </StatusFieldList>
          <div className="h-1.5 min-w-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
            <div
              className={cn("h-full rounded-full", stateBarClass(torrent.state))}
              style={{ width: `${Math.min(100, Math.max(0, torrent.progress))}%` }}
            />
          </div>
        </div>
        <StatusFieldList type={type}>
          <StatusRow label="Downloaded" value={formatBytes(torrent.total_payload_download)} type={type} />
          <StatusRow label="Uploaded" value={formatBytes(torrent.total_payload_upload)} type={type} />
          <StatusRow label="Download speed" value={formatTorrentRate(torrent.download_payload_rate)} type={type} />
          <StatusRow label="Upload speed" value={formatTorrentRate(torrent.upload_payload_rate)} type={type} />
        </StatusFieldList>
      </StatusGroup>
      <StatusGroup title="State" type={type}>
        <StatusFieldList type={type}>
          <StatusRow label="Name" value={torrent.name} wrap type={type} />
          <StatusRow
            label="State"
            value={<StateBadge state={torrent.state} message={torrent.message} />}
            type={type}
          />
          <StatusRow
            label="Size"
            value={`${formatBytes(torrent.total_done)} / ${formatBytes(torrent.total_wanted)}`}
            type={type}
          />
          <StatusRow label="ETA" value={formatTorrentEta(torrent.eta, torrent.progress)} type={type} />
          <StatusRow label="Ratio" value={formatRatio(torrent.ratio)} type={type} />
          <StatusRow label="Seeds" value={formatSwarmCount(torrent.num_seeds, torrent.total_seeds)} type={type} />
          <StatusRow label="Peers" value={formatSwarmCount(torrent.num_peers, torrent.total_peers)} type={type} />
          <StatusRow label="Availability" value={torrent.distributed_copies.toFixed(3)} type={type} />
          <StatusRow label="Label" value={torrent.label || "—"} type={type} />
          <StatusRow label="Owner" value={torrent.owner || "—"} type={type} />
        </StatusFieldList>
      </StatusGroup>
      <StatusGroup title="Times" type={type}>
        <StatusFieldList type={type}>
          <StatusRow label="Added" value={formatDate(torrent.time_added)} type={type} />
          <StatusRow label="Completed" value={formatDate(torrent.completed_time)} type={type} />
          <StatusRow label="Active time" value={formatDuration(torrent.active_time)} type={type} />
          <StatusRow label="Seeding time" value={formatDuration(torrent.seeding_time)} type={type} />
        </StatusFieldList>
      </StatusGroup>
      <StatusGroup title="Paths" type={type}>
        <StatusFieldList type={type}>
          <StatusRow label="Tracker" value={torrent.tracker_host} wrap type={type} />
          <StatusRow label="Tracker status" value={torrent.tracker_status} wrap type={type} />
          <StatusRow label="Download folder" value={torrent.download_location} wrap type={type} />
        </StatusFieldList>
      </StatusGroup>
      <StatusGroup title="Info" type={type}>
        <StatusFieldList type={type}>
          <StatusRow
            label="Pieces"
            value={`${torrent.num_pieces} × ${formatBytes(torrent.piece_length, 0)}`}
            type={type}
          />
          <StatusRow label="Message" value={torrent.message || "—"} wrap type={type} />
          <StatusRow label="Comment" value={torrent.comment || "—"} wrap type={type} />
          <StatusRow label="Creator" value={torrent.creator || "—"} wrap type={type} />
        </StatusFieldList>
      </StatusGroup>
    </div>
  );
}

function StatusGroup({
  title,
  type,
  children,
}: {
  title: string;
  type: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2 py-4 first:pt-0 last:pb-0">
      <h3 className={cn("font-semibold text-foreground", type)}>{title}</h3>
      {children}
    </section>
  );
}

function StatusFieldList({ children, type }: { children: React.ReactNode; type: string }) {
  return (
    <dl className={cn("grid min-w-0 grid-cols-[38%_1fr] gap-x-3 gap-y-1.5", type)}>
      {children}
    </dl>
  );
}

function StatusRow({
  label,
  value,
  wrap,
  type,
}: {
  label: string;
  value: React.ReactNode;
  wrap?: boolean;
  type: string;
}) {
  const text = typeof value === "string" ? value : undefined;
  return (
    <>
      <dt className={cn("min-w-0 text-left text-muted-foreground", type)}>{label}</dt>
      <dd
        className={cn("min-w-0 text-left tabular", type, wrap ? "break-all" : "truncate")}
        title={text}
      >
        {value}
      </dd>
    </>
  );
}

function PeerTable({ peers }: { peers: TorrentPeer[] }) {
  if (!peers.length) return <Muted>No connected peers.</Muted>;
  return (
    <div className="min-w-0">
      <ul className="grid gap-2 @min-[520px]:hidden">
        {peers.map((p, i) => (
          <li
            key={`${p.ip}-${i}`}
            className="min-w-0 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 dark:bg-muted/25"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <PeerCountry country={p.country} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={p.ip}>
                {p.ip}
              </span>
              {p.seed ? <span className="shrink-0 text-[11px] text-muted-foreground">Seed</span> : null}
            </div>
            <div className="mt-0.5 min-w-0 truncate text-xs text-muted-foreground" title={p.client}>
              {p.client}
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 text-xs tabular">
              <span>{formatProgress(p.progress * 100)}</span>
              <span>↓ {formatRate(p.down_speed)}</span>
              <span>↑ {formatRate(p.up_speed)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 overflow-x-auto @min-[520px]:block">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">IP</th>
              <th className="py-1 pr-2 font-medium">Client</th>
              <th className="py-1 pr-2 font-medium">Country</th>
              <th className="py-1 pr-2 font-medium">Progress</th>
              <th className="py-1 pr-2 font-medium">Down</th>
              <th className="py-1 pr-2 font-medium">Up</th>
              <th className="hidden py-1 font-medium @min-[640px]:table-cell">Seed</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p, i) => (
              <tr key={`${p.ip}-${i}`} className="border-t">
                <td className="max-w-[9rem] truncate py-1 pr-2 font-mono text-xs" title={p.ip}>
                  {p.ip}
                </td>
                <td className="max-w-[10rem] truncate py-1 pr-2" title={p.client}>
                  {p.client}
                </td>
                <td className="py-1 pr-2">
                  <PeerCountry country={p.country} />
                </td>
                <td className="py-1 pr-2 tabular">{formatProgress(p.progress * 100)}</td>
                <td className="py-1 pr-2 tabular">{formatRate(p.down_speed)}</td>
                <td className="py-1 pr-2 tabular">{formatRate(p.up_speed)}</td>
                <td className="hidden py-1 @min-[640px]:table-cell">{p.seed ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrackersForm({
  torrentId,
  trackers,
  onChange,
}: {
  torrentId: string;
  /** `null` until the daemon's list has loaded for this torrent. */
  trackers: TorrentTracker[] | null;
  onChange: (t: TorrentTracker[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // `set_torrent_trackers` replaces the whole list, so build it from what the daemon has now,
  // never from local state that may be empty or stale.
  async function addTracker(newUrl: string) {
    setBusy(true);
    try {
      const status = await rpc<{ trackers?: TorrentTracker[] }>("web.get_torrent_status", [
        torrentId,
        ["trackers"],
      ]);
      const current = status.trackers ?? [];
      if (current.some((t) => t.url === newUrl)) {
        onChange(current);
        setUrl("");
        return;
      }
      const next = [...current, { url: newUrl, tier: 0 }];
      await rpc("core.set_torrent_trackers", [torrentId, next]);
      onChange(next);
      setUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tracker update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-12" />
          </colgroup>
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">URL</th>
              <th className="py-1 font-medium">Tier</th>
            </tr>
          </thead>
          <tbody>
            {trackers == null ? (
              <tr className="border-t">
                <td colSpan={2} className="py-1 text-xs text-muted-foreground">
                  Loading trackers…
                </td>
              </tr>
            ) : null}
            {(trackers ?? []).map((t) => (
              <tr key={t.url} className="border-t">
                <td className="min-w-0 truncate py-1 pr-2 font-mono text-xs" title={t.url}>
                  {t.url}
                </td>
                <td className="py-1 tabular">{t.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex min-w-0 flex-col gap-2 @min-[400px]:flex-row">
        <Input
          className="min-w-0 w-full"
          placeholder="udp://tracker.example:6969/announce"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          variant="outline"
          className="shrink-0 @min-[400px]:self-auto"
          disabled={trackers == null || busy || !url.trim()}
          onClick={() => {
            const next = url.trim();
            if (!next) return;
            void addTracker(next);
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
