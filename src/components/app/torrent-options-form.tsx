"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { LocationInput } from "@/components/app/location-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocationHistory } from "@/hooks/use-location-history";
import { clientCapabilities, getStoredClientKind, rpc } from "@/lib/deluge/client";
import { buildTorrentOptionsPayload, optionLimitInput } from "@/lib/deluge/torrent-options";
import type { TorrentStatus } from "@/lib/deluge/types";
import { cn } from "@/lib/utils";

export function OptionsForm({ torrentId, torrent }: { torrentId: string; torrent: TorrentStatus }) {
  const uid = useId();
  const kind = getStoredClientKind();
  const caps = clientCapabilities(kind);
  const deluge = kind === "deluge";
  const [maxDown, setMaxDown] = useState(String(torrent.max_download_speed));
  const [maxUp, setMaxUp] = useState(String(torrent.max_upload_speed));
  const [maxConn, setMaxConn] = useState(optionLimitInput(torrent.max_connections));
  const [maxSlots, setMaxSlots] = useState(optionLimitInput(torrent.max_upload_slots));
  const [auto, setAuto] = useState(Boolean(torrent.is_auto_managed));
  const [stopRatio, setStopRatio] = useState(Boolean(torrent.stop_at_ratio));
  const [ratio, setRatio] = useState(String(torrent.stop_ratio ?? ""));
  const [removeAt, setRemoveAt] = useState(Boolean(torrent.remove_at_ratio));
  const [move, setMove] = useState(Boolean(torrent.move_completed));
  const [movePath, setMovePath] = useState(torrent.move_completed_path ?? "");
  const [superSeed, setSuperSeed] = useState(Boolean(torrent.super_seeding));
  const [firstLast, setFirstLast] = useState(Boolean(torrent.prioritize_first_last));
  const locationHistory = useLocationHistory();

  async function save() {
    try {
      await rpc("core.set_torrent_options", [
        [torrentId],
        buildTorrentOptionsPayload({
          maxDownloadSpeed: maxDown,
          maxUploadSpeed: maxUp,
          maxConnections: maxConn,
          maxUploadSlots: maxSlots,
          isAutoManaged: auto,
          stopAtRatio: stopRatio,
          stopRatio: ratio,
          removeAtRatio: removeAt,
          moveCompleted: move,
          moveCompletedPath: movePath,
          superSeeding: superSeed,
          prioritizeFirstLast: firstLast,
        }),
      ]);
      if (deluge && move) locationHistory.remember([movePath]);
      toast.success("Options saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <form
      className="grid min-w-0 grid-cols-1 gap-2.5 @min-[440px]:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <OptionSection title="Speed limits">
        <OptionRow htmlFor={`${uid}-down`} label="Max download">
          <NumInput
            id={`${uid}-down`}
            value={maxDown}
            onChange={setMaxDown}
            suffix="KiB/s"
            title="−1 unlimited"
          />
        </OptionRow>
        <OptionRow htmlFor={`${uid}-up`} label="Max upload">
          <NumInput
            id={`${uid}-up`}
            value={maxUp}
            onChange={setMaxUp}
            suffix="KiB/s"
            title="−1 unlimited"
          />
        </OptionRow>
        {deluge ? (
          <>
            <OptionRow htmlFor={`${uid}-conn`} label="Connections">
              <NumInput
                id={`${uid}-conn`}
                value={maxConn}
                onChange={setMaxConn}
                placeholder="Unlimited"
                title="−1 unlimited"
              />
            </OptionRow>
            <OptionRow htmlFor={`${uid}-slots`} label="Upload slots">
              <NumInput
                id={`${uid}-slots`}
                value={maxSlots}
                onChange={setMaxSlots}
                placeholder="Unlimited"
                title="−1 unlimited"
              />
            </OptionRow>
          </>
        ) : null}
      </OptionSection>

      <OptionSection title="Queue / ratio">
        <OptionRow htmlFor={`${uid}-stop`} label="Stop at ratio">
          <Switch id={`${uid}-stop`} size="sm" checked={Boolean(stopRatio)} onCheckedChange={setStopRatio} />
        </OptionRow>
        <OptionRow htmlFor={`${uid}-ratio`} label="Stop ratio">
          <NumInput
            id={`${uid}-ratio`}
            value={ratio}
            onChange={setRatio}
            disabled={!stopRatio}
          />
        </OptionRow>
        {deluge ? (
          <OptionRow htmlFor={`${uid}-remove`} label="Remove at ratio">
            <Switch
              id={`${uid}-remove`}
              size="sm"
              checked={Boolean(removeAt)}
              onCheckedChange={setRemoveAt}
              disabled={!stopRatio}
            />
          </OptionRow>
        ) : null}
      </OptionSection>

      {deluge ? (
      <OptionSection title="Location">
        <OptionRow htmlFor={`${uid}-move`} label="Move completed">
          <Switch id={`${uid}-move`} size="sm" checked={Boolean(move)} onCheckedChange={setMove} />
        </OptionRow>
        <div className="grid min-w-0 gap-1">
          <Label htmlFor={`${uid}-move-path`} className="text-xs font-normal text-muted-foreground">
            Completed path
          </Label>
          <LocationInput
            id={`${uid}-move-path`}
            value={movePath}
            disabled={!move}
            onValueChange={setMovePath}
            locations={locationHistory.locations}
            onForget={locationHistory.forget}
            inputClassName="h-7 min-w-0 w-full font-mono text-xs"
          />
        </div>
      </OptionSection>
      ) : null}

      <OptionSection title="Flags">
        <OptionRow
          htmlFor={`${uid}-auto`}
          label={
            kind === "transmission"
              ? "Honor session limits"
              : kind === "qbittorrent"
                ? "Automatic Torrent Management"
                : "Auto managed"
          }
        >
          <Switch id={`${uid}-auto`} size="sm" checked={Boolean(auto)} onCheckedChange={setAuto} />
        </OptionRow>
        <OptionRow htmlFor={`${uid}-private`} label="Private">
          <Switch id={`${uid}-private`} size="sm" checked={Boolean(torrent.private)} disabled />
        </OptionRow>
        {caps.superSeeding || caps.prioritizeFirstLast ? (
          <>
            {caps.superSeeding ? (
              <OptionRow htmlFor={`${uid}-super`} label="Super seeding">
                <Switch id={`${uid}-super`} size="sm" checked={Boolean(superSeed)} onCheckedChange={setSuperSeed} />
              </OptionRow>
            ) : null}
            {caps.prioritizeFirstLast ? (
              <OptionRow htmlFor={`${uid}-first-last`} label="Prioritize first/last">
                <Switch id={`${uid}-first-last`} size="sm" checked={Boolean(firstLast)} onCheckedChange={setFirstLast} />
              </OptionRow>
            ) : null}
          </>
        ) : null}
      </OptionSection>

      <div className="col-span-full">
        <Button type="submit" size="sm">
          Apply
        </Button>
      </div>
    </form>
  );
}

function OptionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-md border border-border bg-muted/40 p-2.5 dark:bg-muted/25">
      <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function OptionRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-7 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
      <Label htmlFor={htmlFor} className="min-w-0 text-sm font-normal leading-snug">
        {label}
      </Label>
      <div className="min-w-0 shrink-0 justify-self-end">{children}</div>
    </div>
  );
}

function NumInput({
  id,
  value,
  onChange,
  suffix,
  title,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  title?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Input
        id={id}
        value={value}
        title={title}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-7 w-[5.5rem] min-w-0 max-w-full tabular text-right")}
      />
      {suffix ? <span className="w-10 shrink-0 text-xs text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}
