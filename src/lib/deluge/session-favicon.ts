import { FILTER_DOWNLOADING } from "./sidebar-filters";

export const SESSION_FAVICON_SIZE = 64;
export const STATIC_FAVICON_HREF = "/icon.png";
export const SESSION_FAVICON_MIN_INTERVAL_MS = 250;
export const SESSION_FAVICON_MARK = "data-session-progress-favicon";
export const SESSION_FAVICON_RING_WIDTH = 7;
export const SESSION_FAVICON_RING_INSET = 6;
/** Unfinished arc. Black at 12% opacity so the red plate shows through. */
export const SESSION_FAVICON_RING_TRACK = "rgba(0,0,0,0.12)";
export const SESSION_FAVICON_RING_PROGRESS = "#ffffff";
/** Red plate from `public/logo.svg`, without the logo mark. */
export const SESSION_FAVICON_BG = "#FF0020";
/** Corner radius of the 64px logo plate. */
export const SESSION_FAVICON_BG_RADIUS = 16;

export type SessionFaviconTorrent = {
  state?: string;
  progress?: number;
};

/** Mean progress of torrents currently downloading. `null` when none are. */
export function sessionFaviconDownloadProgress(
  torrents: Iterable<SessionFaviconTorrent>
): number | null {
  let sum = 0;
  let count = 0;
  for (const torrent of torrents) {
    if (torrent.state !== FILTER_DOWNLOADING) continue;
    const progress = torrent.progress;
    if (typeof progress !== "number" || !Number.isFinite(progress)) continue;
    sum += Math.min(100, Math.max(0, progress));
    count += 1;
  }
  if (count === 0) return null;
  return sum / count;
}

/** Stable 1% key so we skip `link[rel=icon]` writes on tiny progress jitter. */
export function sessionFaviconDrawKey(progress: number | null): string {
  if (progress == null || !Number.isFinite(progress)) return "";
  return String(Math.round(Math.min(100, Math.max(0, progress))));
}

export function shouldRedrawSessionFavicon({
  prevKey,
  nextKey,
  lastDrawAt,
  now,
  minIntervalMs = SESSION_FAVICON_MIN_INTERVAL_MS,
}: {
  prevKey: string;
  nextKey: string;
  lastDrawAt: number;
  now: number;
  minIntervalMs?: number;
}): boolean {
  if (nextKey === prevKey) return false;
  if (lastDrawAt > 0 && now - lastDrawAt < minIntervalMs) return false;
  return true;
}

export type SessionFaviconContext = {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  roundRect(x: number, y: number, w: number, h: number, radii?: number): void;
  fill(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void;
  stroke(): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap | string;
};

/** Structural canvas; real `HTMLCanvasElement` is assignable. */
export type SessionFaviconCanvas = {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: CanvasRenderingContext2DSettings
  ): SessionFaviconContext | null;
};

export function sessionFaviconRingRadius(size: number): number {
  return size / 2 - SESSION_FAVICON_RING_WIDTH / 2 - SESSION_FAVICON_RING_INSET;
}

export function sessionFaviconCornerRadius(size: number): number {
  return (size / SESSION_FAVICON_SIZE) * SESSION_FAVICON_BG_RADIUS;
}

export function drawSessionFavicon(
  canvas: SessionFaviconCanvas,
  progress: number | null
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = SESSION_FAVICON_BG;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, sessionFaviconCornerRadius(size));
  ctx.fill();
  if (progress == null || !Number.isFinite(progress)) return true;

  const cx = size / 2;
  const cy = size / 2;
  const radius = sessionFaviconRingRadius(size);
  const start = -Math.PI / 2;
  const clamped = Math.min(100, Math.max(0, progress));
  const span = (clamped / 100) * Math.PI * 2;

  ctx.lineCap = "round";
  ctx.lineWidth = SESSION_FAVICON_RING_WIDTH;
  ctx.strokeStyle = SESSION_FAVICON_RING_TRACK;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (span <= 0) return true;

  ctx.strokeStyle = SESSION_FAVICON_RING_PROGRESS;
  ctx.beginPath();
  if (clamped >= 99.95) {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  } else {
    ctx.arc(cx, cy, radius, start, start + span);
  }
  ctx.stroke();
  return true;
}

export type SessionFaviconLink = {
  rel?: string;
  type?: string;
  href?: string;
  sizes?: string;
  getAttribute?(name: string): string | null;
  setAttribute?(name: string, value: string): void;
};

/** Structural document; real `Document` is assignable. */
export type SessionFaviconDocument = {
  querySelectorAll(selectors: string): ArrayLike<SessionFaviconLink>;
  createElement(tagName: string, options?: ElementCreationOptions): SessionFaviconLink;
  head: { appendChild(node: SessionFaviconLink | Node): unknown };
};

function iconLinks(doc: SessionFaviconDocument): SessionFaviconLink[] {
  return Array.from(doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]'));
}

export function applySessionFaviconHref(doc: SessionFaviconDocument, href: string): boolean {
  const existing = iconLinks(doc);
  let marked = existing.find((link) => link.getAttribute?.(SESSION_FAVICON_MARK) === "1");
  let changed = false;

  if (!marked) {
    marked = doc.createElement("link");
    marked.rel = "icon";
    marked.setAttribute?.(SESSION_FAVICON_MARK, "1");
    doc.head.appendChild(marked);
    changed = true;
  }

  if (marked.href !== href) {
    marked.type = "image/png";
    marked.sizes = `${SESSION_FAVICON_SIZE}x${SESSION_FAVICON_SIZE}`;
    marked.href = href;
    changed = true;
  }

  for (const link of existing) {
    if (link === marked) continue;
    if (link.href === href) continue;
    link.type = "image/png";
    link.href = href;
    changed = true;
  }
  return changed;
}

export function restoreStaticFavicon(doc: SessionFaviconDocument): boolean {
  return applySessionFaviconHref(doc, STATIC_FAVICON_HREF);
}
