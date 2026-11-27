"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LocationInput } from "@/components/app/location-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocationHistory } from "@/hooks/use-location-history";
import { rpc } from "@/lib/deluge/client";
import { rememberRemovedTorrentIds } from "@/lib/notify-complete";

export { AddTorrentDialog, ADD_POPOVER_CLASS } from "@/components/app/add-torrent-dialog";

export function RemoveTorrentDialog({
  open,
  onOpenChange,
  ids,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  onRemoved: () => void;
}) {
  const [removeData, setRemoveData] = useState(false);

  useEffect(() => {
    if (open) setRemoveData(false);
  }, [open]);

  async function confirm() {
    try {
      if (ids.length === 1) {
        await rpc("core.remove_torrent", [ids[0], removeData]);
      } else {
        await rpc("core.remove_torrents", [ids, removeData]);
      }
      toast.success(ids.length > 1 ? "Torrents removed" : "Torrent removed");
      rememberRemovedTorrentIds(ids);
      onRemoved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {ids.length} torrent{ids.length === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This removes the torrent from Deluge. Downloaded files stay unless you choose to delete
            them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={removeData} onCheckedChange={(v) => setRemoveData(v === true)} />
          Also delete downloaded files
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void confirm()}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MoveTorrentDialog({
  open,
  onOpenChange,
  ids,
  currentPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  currentPath: string;
}) {
  const [path, setPath] = useState(currentPath);
  const locationHistory = useLocationHistory(open);

  useEffect(() => {
    if (open) setPath(currentPath);
  }, [open, currentPath]);

  async function submit() {
    try {
      await rpc("core.move_storage", [ids, path]);
      locationHistory.remember([path]);
      toast.success("Moving storage");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move storage</DialogTitle>
          <DialogDescription>New download location for the selected torrents.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="move-storage-path">Path</Label>
          <LocationInput
            id="move-storage-path"
            value={path}
            onValueChange={setPath}
            locations={locationHistory.locations}
            onForget={locationHistory.forget}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()}>Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
