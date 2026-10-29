"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  FolderInput,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const QUICK_INSPECT_TAB_CLASS =
  "h-7 flex-none rounded-lg border-0 bg-transparent px-2.5 text-[13px] font-normal text-muted-foreground shadow-none after:hidden hover:bg-muted/50 hover:text-muted-foreground data-active:border-transparent data-active:bg-muted data-active:font-normal data-active:text-foreground data-active:shadow-none data-active:hover:bg-muted data-active:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-none dark:hover:text-muted-foreground dark:data-active:border-transparent dark:data-active:bg-muted dark:data-active:hover:text-foreground";

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
  const [trackers, setTrackers] = useState<TorrentTracker[]>([]);
  const [detail, setDetail] = useState<TorrentStatus | null>(torrent);
  const loadGen = useRef(0);
  const detailTorrentId = useRef<string | null>(torrentId);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    const sameTorrent = detailTorrentId.current === torrentId && torrentId != null;
    detailTorrentId.current = torrentId;
    setDetail((prev) => overlayTorrentStatus(prev, torrent, sameTorrent));
    if (!sameTorrent) {
      setFiles(null);
      setPeers([]);
      setTrackers([]);
    }
  }, [torrent, torrentId]);

  const loadDetails = useCallback(async () => {
    if (!torrentId) {
      setFiles(null);
      setPeers([]);
      setTrackers([]);
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
      if (currentTab === "files") {
        jobs.push(
          rpc<FileNode>("web.get_torrent_files", [torrentId]).then((tree) => {
            if (gen !== loadGen.current) return;
            setFiles(tree);
          })
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
        <InspectorStatusBar name={detail?.name || "Inspector"} onClose={onClose} />
      ) : (
        <DetailsHeader
          name={detail?.name || "Details"}
          dock={dock ?? "bottom"}
          onDockChange={onDockChange}
          onClose={onClose}
        />
      )}
      <InspectorTabs
        actions={
          variant === "dialog" ? (
            <InspectorActionBar
              torrentId={torrentId}
              paused={torrentIsPaused(detail?.state)}
              onAct={onAct}
              onRemove={onRemove}
              onMove={onMove}
            />
          ) : undefined
        }
      />
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
                onApplied={loadDetails}
              />
            ) : (
              <Muted>No files</Muted>
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

function InspectorStatusBar({ name, onClose }: { name: string; onClose?: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden bg-background px-3 py-2">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 truncate text-sm font-medium" title={name}>
          {name}
        </div>
      </div>
      {onClose ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close inspector"
          className="shrink-0 text-muted-foreground"
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

function InspectorTabs({ actions }: { actions?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col border-b bg-background @min-[36rem]:flex-row @min-[36rem]:items-center @min-[36rem]:gap-2 @min-[36rem]:pl-1.5 @min-[36rem]:pr-3">
      <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain px-1.5 @min-[36rem]:px-0">
        <TabsList className="h-8 w-max items-center justify-start gap-0.5 rounded-none bg-transparent p-0">
          <TabsTrigger value="status" className={QUICK_INSPECT_TAB_CLASS}>
            Status
          </TabsTrigger>
          <TabsTrigger value="files" className={QUICK_INSPECT_TAB_CLASS}>
            Files
          </TabsTrigger>
          <TabsTrigger value="peers" className={QUICK_INSPECT_TAB_CLASS}>
            Peers
          </TabsTrigger>
          <TabsTrigger value="options" className={QUICK_INSPECT_TAB_CLASS}>
            Options
          </TabsTrigger>
          <TabsTrigger value="trackers" className={QUICK_INSPECT_TAB_CLASS}>
            Trackers
          </TabsTrigger>
        </TabsList>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-px overflow-x-auto overscroll-x-contain border-t px-2 py-1 @min-[36rem]:border-t-0 @min-[36rem]:px-0 @min-[36rem]:py-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function InspectorActionBar({
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
        <InspectorAction
          label="Resume"
          disabled={disabled}
          onClick={() => onAct?.("core.resume_torrent", ids)}
        >
          <Play />
        </InspectorAction>
      ) : (
        <InspectorAction
          label="Pause"
          disabled={disabled}
          onClick={() => onAct?.("core.pause_torrent", ids)}
        >
          <Pause />
        </InspectorAction>
      )}
      <Separator orientation="vertical" className="mx-1 h-4" />
      <InspectorAction
        label="Queue top"
        disabled={disabled}
        onClick={() => onAct?.("core.queue_top", ids)}
      >
        <ChevronsUp />
      </InspectorAction>
      <InspectorAction
        label="Queue up"
        disabled={disabled}
        onClick={() => onAct?.("core.queue_up", ids)}
      >
        <ArrowUp />
      </InspectorAction>
      <InspectorAction
        label="Queue down"
        disabled={disabled}
        onClick={() => onAct?.("core.queue_down", ids)}
      >
        <ArrowDown />
      </InspectorAction>
      <InspectorAction
        label="Queue bottom"
        disabled={disabled}
        onClick={() => onAct?.("core.queue_bottom", ids)}
      >
        <ChevronsDown />
      </InspectorAction>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <InspectorAction
        label="Move storage"
        disabled={disabled}
        onClick={() => onMove?.(ids)}
      >
        <FolderInput />
      </InspectorAction>
      <InspectorAction
        label="Force recheck"
        disabled={disabled}
        onClick={() => onAct?.("core.force_recheck", ids)}
      >
        <RefreshCw />
      </InspectorAction>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <InspectorAction
        label="Remove"
        variant="destructive"
        disabled={disabled}
        onClick={() => onRemove?.(ids)}
      >
        <Trash2 />
      </InspectorAction>
    </>
  );
}

function InspectorAction({
  label,
  variant = "ghost",
  disabled,
  onClick,
  children,
}: {
  label: string;
  variant?: "ghost" | "destructive";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size="icon-xs"
            aria-label={label}
            disabled={disabled}
            className={variant === "destructive" ? undefined : "text-muted-foreground"}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
  trackers: TorrentTracker[];
  onChange: (t: TorrentTracker[]) => void;
}) {
  const [url, setUrl] = useState("");

  async function save(next: TorrentTracker[]) {
    try {
      await rpc("core.set_torrent_trackers", [torrentId, next]);
      onChange(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tracker update failed");
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
            {trackers.map((t) => (
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
          onClick={() => {
            if (!url.trim()) return;
            void save([...trackers, { url: url.trim(), tier: 0 }]);
            setUrl("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
