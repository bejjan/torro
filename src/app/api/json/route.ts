import { NextRequest, NextResponse } from "next/server";
import { parseAdminDemoHeader } from "@/lib/demo/admin-catalog";
import { clientKindFromRequest } from "@/lib/backend/request";
import { handleDemoRpc, type JsonRpcRequest } from "@/lib/deluge/demo";
import { jsonRpcError, proxyDeluge, resolveDelugeTarget } from "@/lib/deluge/proxy";
import { patchUiFrame, uiSnapshotKey } from "@/lib/deluge/ui-diff";
import type { UiUpdate } from "@/lib/deluge/types";
import { handleQbittorrentCompat } from "@/lib/qbittorrent/compat";
import {
  QbittorrentProxyError,
  proxyQbittorrent,
  qbittorrentCredentials,
  resolveQbittorrentTarget,
  withQbittorrentCookies,
} from "@/lib/qbittorrent/proxy";
import { handleTransmissionCompat } from "@/lib/transmission/compat";
import {
  TransmissionProxyError,
  authSetCookie,
  proxyTransmissionRpc,
  resolveTransmissionTarget,
  withTransmissionCookies,
} from "@/lib/transmission/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, "Invalid JSON", 400);
  }

  if (clientKindFromRequest(req) === "transmission") {
    return handleTransmissionJson(req, body);
  }
  if (clientKindFromRequest(req) === "qbittorrent") {
    return handleQbittorrentJson(req, body);
  }

  const resolved = resolveDelugeTarget(req);
  if (resolved.error) return jsonRpcError(body.id ?? null, resolved.error, 400);
  if (resolved.demo) {
    const admin = parseAdminDemoHeader(req.headers.get("x-nova-admin-demo"));
    const demo = handleDemoRpc(body, req.headers.get("cookie"), admin);
    const res = NextResponse.json({ id: demo.id, result: demo.result, error: demo.error });
    if (demo.setCookie) res.headers.append("Set-Cookie", demo.setCookie);
    return withUiDiff(req, body, res);
  }

  return withUiDiff(
    req,
    body,
    await proxyDeluge(req, resolved.target, "/json", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      rpcId: body.id ?? null,
    })
  );
}

async function handleTransmissionJson(req: NextRequest, body: JsonRpcRequest) {
  const resolved = resolveTransmissionTarget(req);
  if (resolved.error) return jsonRpcError(body.id ?? null, resolved.error, 400);

  const live = resolved.demo
    ? undefined
    : async (method: string, args?: Record<string, unknown>) => {
        const proxied = await proxyTransmissionRpc(req, resolved.target, { method, arguments: args });
        return proxied.response;
      };

  try {
    const demo = await handleTransmissionCompat(body, {
      demo: resolved.demo,
      cookieHeader: req.headers.get("cookie"),
      live,
      password: req.headers.get("x-transmission-password") ?? "",
      admin: parseAdminDemoHeader(req.headers.get("x-nova-admin-demo")),
    });
    const res = NextResponse.json({ id: demo.id, result: demo.result, error: demo.error });
    const cookies = demo.setCookie == null ? [] : Array.isArray(demo.setCookie) ? demo.setCookie : [demo.setCookie];
    if (body.method === "auth.login" && demo.result === true) {
      const auth = authSetCookie(req);
      if (auth) cookies.push(auth);
    }
    return withUiDiff(req, body, withTransmissionCookies(res, undefined, cookies));
  } catch (err) {
    if (err instanceof TransmissionProxyError) {
      return jsonRpcError(body.id ?? null, err.message, err.status);
    }
    return jsonRpcError(body.id ?? null, err instanceof Error ? err.message : "Transmission RPC failed");
  }
}

async function handleQbittorrentJson(req: NextRequest, body: JsonRpcRequest) {
  const resolved = resolveQbittorrentTarget(req);
  if (resolved.error) return jsonRpcError(body.id ?? null, resolved.error, 400);
  const creds = qbittorrentCredentials(req);

  const live = resolved.demo
    ? undefined
    : async (call: Parameters<typeof proxyQbittorrent>[2]) => proxyQbittorrent(req, resolved.target, call);

  try {
    const demo = await handleQbittorrentCompat(body, {
      demo: resolved.demo,
      cookieHeader: req.headers.get("cookie"),
      live,
      username: creds.username,
      password: creds.password,
      admin: parseAdminDemoHeader(req.headers.get("x-nova-admin-demo")),
    });
    const res = NextResponse.json({ id: demo.id, result: demo.result, error: demo.error });
    const cookies = demo.setCookie == null ? [] : Array.isArray(demo.setCookie) ? demo.setCookie : [demo.setCookie];
    return withUiDiff(req, body, withQbittorrentCookies(res, cookies));
  } catch (err) {
    if (err instanceof QbittorrentProxyError) {
      return jsonRpcError(body.id ?? null, err.message, err.status);
    }
    return jsonRpcError(body.id ?? null, err instanceof Error ? err.message : "qBittorrent request failed");
  }
}

function requestedUiRevision(req: NextRequest): number | null {
  const raw = req.headers.get("x-torro-ui-rev");
  if (raw == null || !raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Shrink `web.update_ui` to changed torrent fields when the browser holds the previous frame. */
async function withUiDiff(req: NextRequest, body: JsonRpcRequest, res: NextResponse) {
  if (body.method !== "web.update_ui" || !res.ok) return res;
  let payload: { id?: unknown; result?: UiUpdate | null; error?: unknown };
  try {
    payload = (await res.clone().json()) as { id?: unknown; result?: UiUpdate | null; error?: unknown };
  } catch {
    return res;
  }
  const result = payload?.result;
  if (!payload || payload.error || !result || typeof result !== "object" || !("torrents" in result)) {
    return res;
  }
  const key = uiSnapshotKey([
    clientKindFromRequest(req),
    req.headers.get("cookie") ?? "",
    req.headers.get("x-deluge-url") ?? "",
    req.headers.get("x-qbittorrent-url") ?? "",
    req.headers.get("x-transmission-url") ?? "",
    req.headers.get("x-nova-admin-demo") ?? "",
  ]);
  const patched = patchUiFrame(key, requestedUiRevision(req), {
    ...result,
    connected: Boolean(result.connected),
    torrents: (result.torrents ?? null) as Record<string, Record<string, unknown>> | null,
  });
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return NextResponse.json({ ...payload, result: patched }, { status: res.status, headers });
}
