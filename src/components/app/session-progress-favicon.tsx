"use client";

import { useEffect, useRef } from "react";
import {
  SESSION_FAVICON_MIN_INTERVAL_MS,
  SESSION_FAVICON_SIZE,
  STATIC_FAVICON_HREF,
  applySessionFaviconHref,
  drawSessionFavicon,
  restoreStaticFavicon,
  sessionFaviconDrawKey,
  shouldRedrawSessionFavicon,
} from "@/lib/deluge/session-favicon";

export function SessionProgressFavicon({ progress }: { progress: number | null }) {
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const paintRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SESSION_FAVICON_SIZE;
    canvas.height = SESSION_FAVICON_SIZE;

    let lastKey = "";
    let lastDrawAt = 0;
    let timer = 0;
    let cancelled = false;

    const paint = () => {
      if (cancelled) return;
      const nextProgress = progressRef.current;
      const nextKey = sessionFaviconDrawKey(nextProgress);
      const now = performance.now();
      if (
        !shouldRedrawSessionFavicon({
          prevKey: lastKey,
          nextKey,
          lastDrawAt,
          now,
        })
      ) {
        if (nextKey !== lastKey && timer === 0) {
          const wait = Math.max(0, SESSION_FAVICON_MIN_INTERVAL_MS - (now - lastDrawAt));
          timer = window.setTimeout(() => {
            timer = 0;
            paint();
          }, wait);
        }
        return;
      }
      if (!nextKey) {
        applySessionFaviconHref(document, STATIC_FAVICON_HREF);
        lastKey = nextKey;
        lastDrawAt = now;
        return;
      }
      if (!drawSessionFavicon(canvas, nextProgress)) return;
      try {
        applySessionFaviconHref(document, canvas.toDataURL("image/png"));
      } catch {
        return;
      }
      lastKey = nextKey;
      lastDrawAt = now;
    };

    paintRef.current = paint;
    paint();

    return () => {
      cancelled = true;
      paintRef.current = () => {};
      if (timer) window.clearTimeout(timer);
      restoreStaticFavicon(document);
    };
  }, []);

  useEffect(() => {
    paintRef.current();
  }, [progress]);

  return null;
}
