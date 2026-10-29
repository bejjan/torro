"use client";

import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ADMIN_DEMO_DEFAULT_COUNT,
  ADMIN_DEMO_MAX_COUNT,
  type StoredAdminDemo,
  clampAdminDemoConfig,
  defaultStoredAdminDemo,
  getStoredAdminDemo,
  setStoredAdminDemo,
} from "@/lib/demo/admin-catalog";
import {
  type ClientKind,
  clientDisplayName,
  clientUsesUsername,
  getStoredClientKind,
  getStoredQbittorrentUrl,
  getStoredQbittorrentUsername,
  getStoredTlsInsecure,
  getStoredTransmissionUrl,
  getStoredTransmissionUsername,
  getStoredWebUrl,
  rpc,
  setStoredClientKind,
  setStoredQbittorrentUrl,
  setStoredQbittorrentUsername,
  setStoredTlsInsecure,
  setStoredTransmissionUrl,
  setStoredTransmissionUsername,
  setStoredWebUrl,
} from "@/lib/deluge/client";
import {
  DEFAULT_WEB_PORT,
  extractExplicitPort as extractDelugePort,
  normalizeDelugeWebUrl,
  stripExplicitPort,
} from "@/lib/deluge/web-url";
import {
  DEFAULT_QBITTORRENT_PORT,
  extractExplicitPort as extractQbittorrentPort,
  normalizeQbittorrentWebUrl,
  suggestedQbittorrentPort,
} from "@/lib/qbittorrent/url";
import {
  DEFAULT_TRANSMISSION_PORT,
  extractExplicitPort as extractTransmissionPort,
  normalizeTransmissionRpcUrl,
} from "@/lib/transmission/url";
import { cn } from "@/lib/utils";
import delugeIcon from "../../../public/clients/deluge.png";
import qbittorrentIcon from "../../../public/clients/qbittorrent.png";
import transmissionIcon from "../../../public/clients/transmission.png";

type LoginView = "connect" | "demo";
type DemoCatalog = "sample" | "loadtest";

const CLIENT_OPTIONS: { id: ClientKind; label: string; icon: { src: string } }[] = [
  { id: "deluge", label: "Deluge", icon: delugeIcon },
  { id: "transmission", label: "Transmission", icon: transmissionIcon },
  { id: "qbittorrent", label: "qBittorrent", icon: qbittorrentIcon },
];

function initialKind(): ClientKind {
  return typeof window === "undefined" ? "deluge" : getStoredClientKind();
}

function initialDelugeUrl(): string {
  return typeof window === "undefined" ? "" : stripExplicitPort(getStoredWebUrl());
}

function initialTransmissionUrl(): string {
  return typeof window === "undefined" ? "" : stripExplicitPort(getStoredTransmissionUrl());
}

function initialDelugePort(): string {
  return extractDelugePort(typeof window === "undefined" ? "" : getStoredWebUrl()) || String(DEFAULT_WEB_PORT);
}

function initialTransmissionPort(): string {
  return (
    extractTransmissionPort(typeof window === "undefined" ? "" : getStoredTransmissionUrl()) ||
    String(DEFAULT_TRANSMISSION_PORT)
  );
}

function initialQbittorrentUrl(): string {
  return typeof window === "undefined" ? "" : stripExplicitPort(getStoredQbittorrentUrl());
}

function initialQbittorrentPort(): string {
  return suggestedQbittorrentPort(typeof window === "undefined" ? "" : getStoredQbittorrentUrl());
}

function initialUsername(kind: ClientKind): string {
  if (typeof window === "undefined") return "";
  return kind === "qbittorrent" ? getStoredQbittorrentUsername() : getStoredTransmissionUsername();
}

function initialAdmin(): StoredAdminDemo {
  return typeof window === "undefined" ? defaultStoredAdminDemo() : getStoredAdminDemo();
}

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function extractTypedPort(kind: ClientKind, value: string): string | null {
  if (kind === "transmission") return extractTransmissionPort(value);
  if (kind === "qbittorrent") return extractQbittorrentPort(value);
  return extractDelugePort(value);
}

function defaultPortFor(kind: ClientKind): string {
  if (kind === "transmission") return String(DEFAULT_TRANSMISSION_PORT);
  if (kind === "qbittorrent") return String(DEFAULT_QBITTORRENT_PORT);
  return String(DEFAULT_WEB_PORT);
}

function submitFormOnInputEnter(event: React.KeyboardEvent<HTMLFormElement>, busy: boolean) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  if (!(event.target instanceof HTMLInputElement)) return;
  event.preventDefault();
  if (!busy) event.currentTarget.requestSubmit();
}

function optionRowClass(selected: boolean, align: "center" | "start" = "center") {
  return cn(
    "flex w-full cursor-pointer gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
    align === "start" ? "items-start" : "items-center",
    "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    selected ? "border-primary/40 bg-muted/60" : "border-border hover:bg-muted/30"
  );
}

function optionTileClass(selected: boolean) {
  return cn(
    "flex w-full min-w-0 cursor-pointer flex-col items-center gap-2 rounded-lg border px-2 py-2 text-center transition-colors",
    "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    selected ? "border-primary bg-muted/40" : "border-border hover:bg-muted/25"
  );
}

function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  layout = "stack",
}: {
  label: string;
  value: T;
  options: { id: T; align?: "center" | "start"; children: React.ReactNode }[];
  onChange: (next: T) => void;
  layout?: "stack" | "tiles";
}) {
  const ids = options.map((option) => option.id);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = ids.indexOf(value);
    if (index < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      onChange(ids[(index + 1) % ids.length]);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(ids[(index - 1 + ids.length) % ids.length]);
    }
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label>{label}</Label>
      <div
        role="radiogroup"
        aria-label={label}
        className={layout === "tiles" ? "grid grid-cols-3 gap-1.5" : "grid gap-1.5"}
        onKeyDown={onKeyDown}
      >
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={
                layout === "tiles" ? optionTileClass(selected) : optionRowClass(selected, option.align)
              }
              onClick={() => onChange(option.id)}
            >
              {option.children}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClientPicker({
  kind,
  onChange,
}: {
  kind: ClientKind;
  onChange: (next: ClientKind) => void;
}) {
  return (
    <OptionGroup
      label="Client"
      value={kind}
      onChange={onChange}
      layout="tiles"
      options={CLIENT_OPTIONS.map((option) => ({
        id: option.id,
        children: (
          <>
            <img
              src={option.icon.src}
              alt=""
              width={40}
              height={40}
              className="size-10 object-contain"
            />
            <span className="text-center text-xs font-semibold leading-tight">{option.label}</span>
          </>
        ),
      }))}
    />
  );
}

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [view, setView] = useState<LoginView>("connect");
  const [kind, setKind] = useState<ClientKind>(initialKind);
  const [delugeUrl, setDelugeUrl] = useState(initialDelugeUrl);
  const [delugePort, setDelugePort] = useState(initialDelugePort);
  const [txUrl, setTxUrl] = useState(initialTransmissionUrl);
  const [txPort, setTxPort] = useState(initialTransmissionPort);
  const [qbUrl, setQbUrl] = useState(initialQbittorrentUrl);
  const [qbPort, setQbPort] = useState(initialQbittorrentPort);
  const [username, setUsername] = useState(() => initialUsername(initialKind()));
  const [password, setPassword] = useState("");
  const [tlsInsecure, setTlsInsecure] = useState(
    () => typeof window !== "undefined" && getStoredTlsInsecure()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState<StoredAdminDemo>(initialAdmin);
  const [demoCatalog, setDemoCatalog] = useState<DemoCatalog>(() =>
    initialAdmin().enabled ? "loadtest" : "sample"
  );

  function persistAdmin(next: StoredAdminDemo) {
    const clamped = { ...clampAdminDemoConfig(next), open: Boolean(next.open) };
    setAdmin(clamped);
    setStoredAdminDemo(clamped);
  }

  const url = kind === "transmission" ? txUrl : kind === "qbittorrent" ? qbUrl : delugeUrl;
  const port = kind === "transmission" ? txPort : kind === "qbittorrent" ? qbPort : delugePort;

  function onKindChange(next: ClientKind) {
    setKind(next);
    setStoredClientKind(next);
    setUsername(initialUsername(next));
    setError(null);
  }

  function setUrlValue(next: string) {
    if (kind === "transmission") setTxUrl(next);
    else if (kind === "qbittorrent") setQbUrl(next);
    else setDelugeUrl(next);
  }

  function setPortValue(next: string) {
    if (kind === "transmission") setTxPort(next);
    else if (kind === "qbittorrent") setQbPort(next);
    else setDelugePort(next);
  }

  function onUrlChange(next: string) {
    setUrlValue(next);
  }

  function onUrlBlur() {
    const typedPort = extractTypedPort(kind, url);
    if (!typedPort) return;
    setPortValue(typedPort);
    setUrlValue(stripExplicitPort(url));
  }

  function onPortChange(next: string) {
    setPortValue(next);
  }

  async function finishLogin(opts: {
    target: string;
    demo: boolean;
    adminNext: StoredAdminDemo;
    passwordValue: string;
  }) {
    setStoredClientKind(kind);
    setStoredTlsInsecure(tlsInsecure);
    persistAdmin(opts.adminNext);
    if (!opts.demo) {
      if (kind === "transmission") {
        setStoredTransmissionUrl(opts.target);
        setStoredTransmissionUsername(username);
      } else if (kind === "qbittorrent") {
        setStoredQbittorrentUrl(opts.target);
        setStoredQbittorrentUsername(username);
      } else {
        setStoredWebUrl(opts.target);
      }
    } else if (kind === "transmission") {
      setStoredTransmissionUsername(username);
    } else if (kind === "qbittorrent") {
      setStoredQbittorrentUsername(username);
    }
    try {
      if (opts.adminNext.enabled) await yieldToPaint();
      const ok = await rpc<boolean>("auth.login", [opts.passwordValue]);
      if (!ok) {
        setError(clientUsesUsername(kind) ? "Incorrect username or password." : "Incorrect password.");
        return;
      }
      toast.success(
        opts.adminNext.enabled
          ? `Signed in to demo (${opts.adminNext.count.toLocaleString()} torrents)`
          : opts.demo
            ? "Signed in to demo"
            : "Signed in"
      );
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConnectSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const typedPort = extractTypedPort(kind, url);
    if (typedPort) setPortValue(typedPort);
    const host = stripExplicitPort(url);
    setUrlValue(host);
    const usePort = typedPort || port.trim() || defaultPortFor(kind);
    let target = host.trim();
    if (!target) {
      setError("Enter a Web URL.");
      setBusy(false);
      return;
    }
    try {
      target =
        kind === "transmission"
          ? normalizeTransmissionRpcUrl(target, usePort)
          : kind === "qbittorrent"
            ? normalizeQbittorrentWebUrl(target, usePort)
            : normalizeDelugeWebUrl(target, usePort);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Invalid ${clientDisplayName(kind)} URL`);
      setBusy(false);
      return;
    }
    await finishLogin({
      target,
      demo: false,
      adminNext: { ...admin, enabled: false },
      passwordValue: password,
    });
  }

  async function onDemoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const loadtest = demoCatalog === "loadtest";
    const adminNext: StoredAdminDemo = {
      ...clampAdminDemoConfig({ ...admin, enabled: loadtest }),
      open: false,
    };
    await finishLogin({
      target: "",
      demo: true,
      adminNext,
      passwordValue: password || "deluge",
    });
  }

  function openDemo() {
    setError(null);
    setView("demo");
  }

  return (
    <div className="relative flex min-h-svh min-w-0 flex-col items-center justify-center overflow-y-auto bg-background px-3 py-8 sm:px-4 sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.45_0_0/0.08),transparent_55%)]" />
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="relative my-auto flex w-full min-w-0 max-w-[25rem] flex-col items-center gap-4">
        <Brand markClassName="size-9" />
        <Card className="w-full min-w-0 py-6 ring-1 ring-primary/15 [--card-spacing:--spacing(5)]">
        <CardHeader className="gap-2">
          <div className="flex min-h-8 min-w-0 items-center gap-2">
            {view === "demo" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Back"
                onClick={() => {
                  setError(null);
                  setView("connect");
                }}
              >
                <ChevronLeft />
              </Button>
            ) : null}
            <CardTitle className="text-xl">{view === "demo" ? "Demo" : "Sign in"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {view === "demo" ? (
            <form
              className="flex min-w-0 flex-col gap-3.5"
              onSubmit={onDemoSubmit}
              onKeyDown={(event) => submitFormOnInputEnter(event, busy)}
            >
              <ClientPicker kind={kind} onChange={onKindChange} />
              <OptionGroup
                label="Catalog"
                value={demoCatalog}
                onChange={setDemoCatalog}
                options={[
                  {
                    id: "sample",
                    align: "start",
                    children: (
                      <span>
                        <span className="block text-sm font-medium">Sample library</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Built-in handful of torrents. No daemon.
                        </span>
                      </span>
                    ),
                  },
                  {
                    id: "loadtest",
                    align: "start",
                    children: (
                      <span>
                        <span className="block text-sm font-medium">Load test</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Generated catalog. Default {ADMIN_DEMO_DEFAULT_COUNT.toLocaleString()}{" "}
                          torrents, up to {ADMIN_DEMO_MAX_COUNT.toLocaleString()}.
                        </span>
                      </span>
                    ),
                  },
                ]}
              />
              {demoCatalog === "loadtest" ? (
                <DemoLoadtestFields admin={admin} onChange={persistAdmin} />
              ) : null}
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" disabled={busy} className="h-10 w-full">
                {busy ? <Loader2 className="animate-spin" /> : null}
                {busy
                  ? demoCatalog === "loadtest"
                    ? `Generating ${admin.count.toLocaleString()} torrents…`
                    : "Starting demo…"
                  : "Start demo"}
              </Button>
            </form>
          ) : (
            <form
              className="flex min-w-0 flex-col gap-3.5"
              onSubmit={onConnectSubmit}
              onKeyDown={(event) => submitFormOnInputEnter(event, busy)}
            >
              <ClientPicker kind={kind} onChange={onKindChange} />
              <div className="grid min-w-0 gap-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                  <Label htmlFor="daemon-url">Web URL</Label>
                  <Label htmlFor="daemon-port">Port</Label>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                  <Input
                    id="daemon-url"
                    placeholder={kind === "deluge" ? "http://192.168.1.10" : "http://127.0.0.1"}
                    value={url}
                    onChange={(e) => onUrlChange(e.target.value)}
                    onBlur={onUrlBlur}
                    autoComplete="url"
                    inputMode="url"
                    className="min-w-0"
                  />
                  <Input
                    id="daemon-port"
                    placeholder={defaultPortFor(kind)}
                    value={port}
                    onChange={(e) => onPortChange(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${clientDisplayName(kind)} port`}
                  />
                </div>
              </div>
              {clientUsesUsername(kind) ? (
                <div className="grid grid-cols-2 items-end gap-2">
                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor="daemon-username">Username</Label>
                    <Input
                      id="daemon-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      className="min-w-0"
                    />
                  </div>
                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor="daemon-password">Password</Label>
                    <Input
                      id="daemon-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      autoFocus
                      className="min-w-0"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="daemon-password">Password</Label>
                  <Input
                    id="daemon-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>
              )}
              <label className="flex items-center justify-between gap-3 text-sm leading-snug">
                <span>Allow self-signed TLS</span>
                <Switch
                  checked={tlsInsecure}
                  onCheckedChange={(v) => setTlsInsecure(v === true)}
                />
              </label>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  className="h-10 min-w-0 flex-1"
                  onClick={openDemo}
                >
                  Demo mode
                </Button>
                <Button type="submit" disabled={busy} className="h-10 min-w-0 flex-1">
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function DemoLoadtestFields({
  admin,
  onChange,
}: {
  admin: StoredAdminDemo;
  onChange: (next: StoredAdminDemo) => void;
}) {
  function patch(partial: Partial<StoredAdminDemo>) {
    onChange({ ...admin, ...partial });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="admin-torrent-count" className="text-xs text-muted-foreground">
            Torrent count
          </Label>
          <Input
            id="admin-torrent-count"
            type="number"
            min={1}
            max={ADMIN_DEMO_MAX_COUNT}
            value={admin.count}
            onChange={(e) => patch({ count: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="admin-rng-seed" className="text-xs text-muted-foreground">
            RNG seed
          </Label>
          <Input
            id="admin-rng-seed"
            type="number"
            value={admin.seed}
            onChange={(e) => patch({ seed: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="admin-seeding" className="text-xs text-muted-foreground">
            Seeding %
          </Label>
          <Input
            id="admin-seeding"
            type="number"
            min={0}
            max={100}
            value={admin.seedingPct}
            onChange={(e) => patch({ seedingPct: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="admin-downloading" className="text-xs text-muted-foreground">
            Downloading %
          </Label>
          <Input
            id="admin-downloading"
            type="number"
            min={0}
            max={100}
            value={admin.downloadingPct}
            onChange={(e) => patch({ downloadingPct: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="admin-paused" className="text-xs text-muted-foreground">
            Paused %
          </Label>
          <Input
            id="admin-paused"
            type="number"
            min={0}
            max={100}
            value={admin.pausedPct}
            onChange={(e) => patch({ pausedPct: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Leftover percent becomes checking, queued, and error. Same seed rebuilds the same catalog
        after reload.
      </p>
    </div>
  );
}
