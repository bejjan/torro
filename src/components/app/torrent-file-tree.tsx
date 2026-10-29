"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FileKindIcon, FolderTreeIcon } from "@/components/app/file-tree-icons";
import { FilePrioritySelect } from "@/components/app/file-priority-select";
import { rpc } from "@/lib/deluge/client";
import { defaultFolderExpanded, isHugeFileTree } from "@/lib/deluge/file-tree-view";
import { canonicalizeFilePriority, compactFilePriorities } from "@/lib/deluge/files-tree";
import { formatBytes, formatProgress } from "@/lib/deluge/format";
import type { FileNode } from "@/lib/deluge/types";
import { cn } from "@/lib/utils";

export function FileTree({
  node,
  torrentId,
  name,
  onApplied,
}: {
  node: FileNode;
  torrentId: string;
  name: string;
  onApplied: () => Promise<void>;
}) {
  const huge = isHugeFileTree(node);
  return (
    <div className="min-w-0">
      <FileTreeNode
        node={node}
        torrentId={torrentId}
        name={name}
        path=""
        depth={0}
        huge={huge}
        onApplied={onApplied}
      />
    </div>
  );
}

function FileTreeNode({
  node,
  torrentId,
  name,
  path,
  depth,
  huge,
  onApplied,
}: {
  node: FileNode;
  torrentId: string;
  name: string;
  path: string;
  depth: number;
  huge: boolean;
  onApplied: () => Promise<void>;
}) {
  const [open, setOpen] = useState(() => defaultFolderExpanded(depth, huge));
  const leafScrollRef = useRef<HTMLDivElement>(null);
  const entries = node.type === "dir" ? Object.entries(node.contents) : [];
  const showRow = node.type === "dir" && Boolean(path);
  const showChildren = node.type === "dir" && (!showRow || open);
  const leavesOnly = entries.length > 0 && entries.every(([, child]) => child.type === "file");
  const virtualize = leavesOnly && entries.length > 80 && showChildren;
  // useVirtualizer returns unstable function identities; skip React Compiler memoization of this body.
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer owns the long file list
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => leafScrollRef.current,
    estimateSize: () => 32,
    overscan: 16,
    enabled: virtualize,
  });
  const summary = useMemo(() => {
    if (node.type === "file") return null;
    const files: Extract<FileNode, { type: "file" }>[] = [];
    walkFiles(node, (f) => files.push(f));
    const first = files[0];
    const shared =
      first &&
      files.every((f) => canonicalizeFilePriority(f.priority) === canonicalizeFilePriority(first.priority))
        ? canonicalizeFilePriority(first.priority)
        : null;
    return { indexes: files.map((f) => f.index), shared, size: fileTreeSize(node) };
  }, [node]);

  if (node.type === "file") {
    return (
      <TreeRow
        icon={<FileKindIcon name={name} />}
        name={name}
        size={node.size}
        progress={node.progress}
        action={
          <FilePrioritySelect
            value={node.priority}
            onChange={(priority) => {
              void setFilePriorities(torrentId, [node.index], priority, onApplied);
            }}
          />
        }
      />
    );
  }

  if (!summary) return null;

  return (
    <div className="min-w-0 text-sm">
      {showRow ? (
        <TreeRow
          leading={
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-expanded={open}
              aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          }
          icon={<FolderTreeIcon open={open} />}
          name={name}
          nameClass="font-medium"
          size={summary.size}
          action={
            <FilePrioritySelect
              value={summary.shared ?? "mixed"}
              mixed={summary.shared == null}
              onChange={(priority) => {
                void setFilePriorities(torrentId, summary.indexes, priority, onApplied);
              }}
            />
          }
        />
      ) : null}
      {showChildren ? (
        virtualize ? (
          <div
            ref={leafScrollRef}
            className={showRow ? "ml-3 max-h-80 min-w-0 overflow-auto border-l pl-3" : "max-h-80 min-w-0 overflow-auto"}
          >
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const [childName, child] = entries[item.index]!;
                return (
                  <div
                    key={childName}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <FileTreeNode
                      node={child}
                      torrentId={torrentId}
                      name={childName}
                      path={`${path}/${childName}`}
                      depth={depth + 1}
                      huge={huge}
                      onApplied={onApplied}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={showRow ? "ml-3 min-w-0 overflow-hidden border-l pl-3" : "min-w-0"}>
            {entries.map(([childName, child]) => (
              <FileTreeNode
                key={childName}
                node={child}
                torrentId={torrentId}
                name={childName}
                path={`${path}/${childName}`}
                depth={depth + 1}
                huge={huge}
                onApplied={onApplied}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function TreeRow({
  leading,
  icon,
  name,
  nameClass,
  size,
  progress,
  action,
}: {
  leading?: ReactNode;
  icon: ReactNode;
  name: string;
  nameClass?: string;
  size: number;
  progress?: number;
  action: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 py-1 text-sm">
      {leading}
      {icon}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className={cn("min-w-0 truncate", nameClass)} title={name}>
          {name}
        </div>
        <div className="flex min-w-0 gap-x-2 text-[11px] tabular text-muted-foreground @min-[420px]:hidden">
          <span>{formatBytes(size)}</span>
          {progress != null ? <span>{formatProgress(progress * 100)}</span> : null}
        </div>
      </div>
      <span className="tabular hidden shrink-0 text-right text-xs text-muted-foreground @min-[420px]:inline">
        {formatBytes(size)}
      </span>
      {progress != null ? (
        <span className="tabular hidden shrink-0 text-right text-xs @min-[420px]:inline">
          {formatProgress(progress * 100)}
        </span>
      ) : null}
      {action}
    </div>
  );
}

async function setFilePriorities(
  torrentId: string,
  indexes: number[],
  priority: number,
  onApplied: () => Promise<void>
) {
  try {
    const tree = await rpc<FileNode>("web.get_torrent_files", [torrentId]);
    const prios: number[] = [];
    const indexSet = new Set(indexes);
    walkFiles(tree, (f) => {
      prios[f.index] = indexSet.has(f.index) ? priority : f.priority;
    });
    await rpc("core.set_torrent_file_priorities", [torrentId, compactFilePriorities(prios)]);
    await onApplied();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Priority failed");
  }
}

function walkFiles(node: FileNode, visit: (f: Extract<FileNode, { type: "file" }>) => void) {
  if (node.type === "file") visit(node);
  else Object.values(node.contents).forEach((c) => walkFiles(c, visit));
}

function fileTreeSize(node: FileNode): number {
  if (node.type === "file") return node.size;
  return Object.values(node.contents).reduce((sum, child) => sum + fileTreeSize(child), 0);
}
