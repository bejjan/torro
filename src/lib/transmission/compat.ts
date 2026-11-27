import type { AdminDemoConfig } from "../demo/admin-catalog";
import type { JsonRpcRequest } from "@/lib/deluge/demo";
import { formatUnknownMethodMessage } from "@/lib/deluge/plugins";
import { inventDemoFilesTree, parseMagnetInfoHash, type TorrentFileInfo } from "@/lib/deluge/files-tree";
import { parseMagnetName } from "@/lib/deluge/format";
import type { FilterDict, TorrentStatus } from "@/lib/deluge/types";
import {
  addTransmissionDemoLabel,
  getTransmissionDemoUpload,
  getTransmissionDemoWebConfig,
  handleTransmissionDemoRpc,
  isTransmissionDemoAuthed,
  loginTransmissionDemo,
  logoutTransmissionDemo,
  removeTransmissionDemoLabel,
  setTransmissionDemoTorrentLabel,
  setTransmissionDemoWebConfig,
  transmissionDemoLabels,
  transmissionDemoLabelsSupported,
} from "./demo";
import {
  addOptionsToTransmission,
  coreConfigToSession,
  filePrioritiesToTransmissionArgs,
  filesTreeFromTransmission,
  mapTransmissionPeers,
  mapTransmissionTorrent,
  mapTransmissionTrackers,
  mapUiUpdate,
  resolveTransmissionIds,
  sessionToCoreConfig,
  torrentKey,
  torrentOptionsToTransmission,
  trackerEditToTransmissionArgs,
  uniqueLabels,
} from "./map";
import { TORRENT_GET_FIELDS, type TransmissionRpcResponse, type TransmissionSession, type TransmissionTorrent } from "./types";

export interface CompatResult {
  id: number | string;
  result: unknown;
  error: { message: string; code?: number } | null;
  setCookie?: string | string[] | null;
}

export type TransmissionCaller = (
  method: string,
  args?: Record<string, unknown>
) => Promise<TransmissionRpcResponse>;

async function txCall(
  demo: boolean,
  live: TransmissionCaller | undefined,
  method: string,
  args?: Record<string, unknown>,
  admin?: AdminDemoConfig | null
): Promise<TransmissionRpcResponse> {
  if (demo) return handleTransmissionDemoRpc({ method, arguments: args }, admin);
  if (!live) throw new Error("Transmission RPC is not configured.");
  return live(method, args);
}

function unwrap(res: TransmissionRpcResponse): Record<string, unknown> {
  if (res.result !== "success") throw new Error(res.result || "Transmission RPC error");
  return (res.arguments ?? {}) as Record<string, unknown>;
}

async function fetchTorrents(
  demo: boolean,
  live?: TransmissionCaller,
  admin?: AdminDemoConfig | null
): Promise<TransmissionTorrent[]> {
  const res = unwrap(await txCall(demo, live, "torrent-get", { fields: [...TORRENT_GET_FIELDS] }, admin));
  return (res.torrents as TransmissionTorrent[]) || [];
}

async function fetchSession(
  demo: boolean,
  live?: TransmissionCaller,
  admin?: AdminDemoConfig | null
): Promise<TransmissionSession> {
  return unwrap(await txCall(demo, live, "session-get", undefined, admin)) as TransmissionSession;
}

function torrentById(torrents: TransmissionTorrent[], id: unknown): TransmissionTorrent | undefined {
  const key = String(id);
  return torrents.find((t) => torrentKey(t) === key || String(t.id) === key);
}

const OPEN = new Set(["auth.login", "auth.check_session", "web.connected"]);

export async function handleTransmissionCompat(
  body: JsonRpcRequest,
  opts: {
    demo: boolean;
    cookieHeader: string | null;
    live?: TransmissionCaller;
    password?: string;
    admin?: AdminDemoConfig | null;
  }
): Promise<CompatResult> {
  const id = body.id ?? 0;
  const method = body.method;
  const params = Array.isArray(body.params) ? body.params : [];
  const { demo, live } = opts;
  const admin = opts.admin ?? null;
  const call = (method: string, args?: Record<string, unknown>) =>
    txCall(demo, live, method, args, admin);
  const fail = (message: string): CompatResult => ({
    id,
    result: null,
    error: { message: formatUnknownMethodMessage(method || "", message) },
  });

  try {
    if (!method) throw new Error("Missing method");

    if (method === "auth.login") {
      const password = String(params[0] ?? opts.password ?? "");
      if (demo) {
        const login = loginTransmissionDemo(password, admin);
        return { id, result: login.ok, error: null, setCookie: login.setCookie };
      }
      const session = await txCall(false, live, "session-get");
      return { id, result: session.result === "success", error: null };
    }
    if (method === "auth.check_session") {
      if (demo) return { id, result: isTransmissionDemoAuthed(opts.cookieHeader, admin), error: null };
      try {
        const session = await txCall(false, live, "session-get");
        return { id, result: session.result === "success", error: null };
      } catch {
        return { id, result: false, error: null };
      }
    }
    if (method === "auth.delete_session") {
      const cookies = demo ? [logoutTransmissionDemo(opts.cookieHeader, admin)] : [];
      cookies.push("nova_tx_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
      return { id, result: true, error: null, setCookie: cookies };
    }
    if (!OPEN.has(method) && demo && !isTransmissionDemoAuthed(opts.cookieHeader, admin)) {
      throw new Error("Not authenticated");
    }

    switch (method) {
      case "web.connected":
      case "web.connect":
      case "web.disconnect":
        return { id, result: true, error: null };
      case "web.get_hosts":
        return { id, result: [], error: null };
      case "web.update_ui": {
        const keys = (params[0] as string[]) || [];
        const filter = params[1] as FilterDict | undefined;
        const [torrents, session] = await Promise.all([fetchTorrents(demo, live, admin), fetchSession(demo, live, admin)]);
        const labelsSupported = demo
          ? transmissionDemoLabelsSupported(admin)
          : torrents.some((t) => Array.isArray(t.labels));
        return { id, result: mapUiUpdate(torrents, session, filter, labelsSupported, keys), error: null };
      }
      case "web.get_torrent_status":
      case "core.get_torrent_status": {
        const torrents = await fetchTorrents(demo, live, admin);
        const torrent = torrentById(torrents, params[0]);
        if (!torrent) throw new Error("Unknown torrent");
        const status = mapTransmissionTorrent(torrent) as TorrentStatus & Record<string, unknown>;
        const keys = (params[1] as string[]) || [];
        const base = keys.length
          ? Object.fromEntries(Object.entries(status).filter(([key]) => keys.includes(key)))
          : { ...status };
        if (!keys.length || keys.includes("peers")) (base as Record<string, unknown>).peers = mapTransmissionPeers(torrent);
        if (!keys.length || keys.includes("trackers")) {
          (base as Record<string, unknown>).trackers = mapTransmissionTrackers(torrent);
        }
        return { id, result: base, error: null };
      }
      case "web.get_torrent_files": {
        const torrents = await fetchTorrents(demo, live, admin);
        const torrent = torrentById(torrents, params[0]);
        if (!torrent) throw new Error("Unknown torrent");
        return { id, result: filesTreeFromTransmission(torrent), error: null };
      }
      case "web.get_free_space":
      case "core.get_free_space": {
        const session = await fetchSession(demo, live, admin);
        return { id, result: Number(session["download-dir-free-space"] ?? 0) || 0, error: null };
      }
      case "web.get_config":
        if (demo) return { id, result: getTransmissionDemoWebConfig(admin), error: null };
        return {
          id,
          result: { show_sidebar: true, show_session_speed: true, sidebar_show_zero: false },
          error: null,
        };
      case "web.set_config":
        if (demo) setTransmissionDemoWebConfig((params[0] as Record<string, unknown>) || {}, admin);
        return { id, result: null, error: null };
      case "web.get_plugins": {
        const labels = demo
          ? transmissionDemoLabelsSupported(admin)
          : (await fetchTorrents(demo, live, admin)).some((t) => Array.isArray(t.labels));
        return {
          id,
          result: { available_plugins: labels ? ["Label"] : [], enabled_plugins: labels ? ["Label"] : [] },
          error: null,
        };
      }
      case "core.get_enabled_plugins":
      case "core.get_available_plugins": {
        const labels = demo
          ? transmissionDemoLabelsSupported(admin)
          : (await fetchTorrents(demo, live, admin)).some((t) => Array.isArray(t.labels));
        return { id, result: labels ? ["Label"] : [], error: null };
      }
      case "web.get_torrent_info": {
        const path = String(params[0] ?? "");
        const upload = getTransmissionDemoUpload(path, admin);
        if (upload) {
          const info: TorrentFileInfo = {
            name: upload.name,
            info_hash: upload.infoHash,
            files_tree: upload.filesTree,
            filename: path,
          };
          return { id, result: info, error: null };
        }
        const name = path.split(/[/\\]/).pop()?.replace(/\.torrent$/i, "") || "Torrent";
        return {
          id,
          result: { name, info_hash: path.slice(-40) || "0".repeat(40), files_tree: inventDemoFilesTree(name, 0), filename: path },
          error: null,
        };
      }
      case "web.get_magnet_info": {
        const uri = String(params[0] ?? "");
        const hash = parseMagnetInfoHash(uri);
        if (!hash) return { id, result: {}, error: null };
        return { id, result: { name: parseMagnetName(uri), info_hash: hash, files_tree: "" }, error: null };
      }
      case "web.add_torrents": {
        const items = (params[0] as { path: string; options?: Record<string, unknown> }[]) || [];
        const added: unknown[] = [];
        for (const item of items) {
          const options = addOptionsToTransmission(item.options);
          const upload = getTransmissionDemoUpload(item.path, admin);
          const args = item.path.startsWith("magnet:")
            ? unwrap(await call("torrent-add", { filename: item.path, ...options }))
            : upload?.metainfo && !demo
              ? unwrap(await call("torrent-add", { metainfo: upload.metainfo, ...options }))
              : unwrap(await call("torrent-add", { filename: item.path, ...options }));
          added.push(args["torrent-added"] ?? args["torrent-duplicate"] ?? args);
        }
        return { id, result: added.length === 1 ? added[0] : added, error: null };
      }
      case "web.download_torrent_from_url":
        return { id, result: String(params[0] ?? ""), error: null };
      case "core.pause_torrent":
      case "core.pause_torrents":
        unwrap(await call( "torrent-stop", { ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)) }));
        return { id, result: true, error: null };
      case "core.resume_torrent":
      case "core.resume_torrents":
        unwrap(await call( "torrent-start", { ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)) }));
        return { id, result: true, error: null };
      case "core.remove_torrent":
      case "core.remove_torrents":
        unwrap(
          await call( "torrent-remove", {
            ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)),
            "delete-local-data": Boolean(params[1]),
          })
        );
        return { id, result: true, error: null };
      case "core.force_recheck":
        unwrap(await call( "torrent-verify", { ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)) }));
        return { id, result: true, error: null };
      case "core.force_reannounce":
        unwrap(await call( "torrent-reannounce", { ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)) }));
        return { id, result: true, error: null };
      case "core.queue_top":
      case "core.queue_bottom":
      case "core.queue_up":
      case "core.queue_down": {
        const torrents = await fetchTorrents(demo, live, admin);
        const ids = resolveTransmissionIds(params[0], torrents);
        const selected = torrents.filter((t) => ids.includes(t.id)).sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
        if (method === "core.queue_top") {
          let pos = 0;
          for (const torrent of selected) {
            unwrap(await call( "torrent-set", { ids: [torrent.id], queuePosition: pos++ }));
          }
        } else if (method === "core.queue_bottom") {
          let pos = torrents.length;
          for (const torrent of [...selected].reverse()) {
            unwrap(await call( "torrent-set", { ids: [torrent.id], queuePosition: pos++ }));
          }
        } else if (method === "core.queue_up") {
          for (const torrent of selected) {
            unwrap(
              await call( "torrent-set", {
                ids: [torrent.id],
                queuePosition: Math.max(0, (torrent.queuePosition ?? 0) - 1),
              })
            );
          }
        } else {
          for (const torrent of [...selected].reverse()) {
            unwrap(
              await call( "torrent-set", {
                ids: [torrent.id],
                queuePosition: (torrent.queuePosition ?? 0) + 1,
              })
            );
          }
        }
        return { id, result: true, error: null };
      }
      case "core.move_storage":
        unwrap(
          await call( "torrent-set-location", {
            ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)),
            location: String(params[1] ?? ""),
            move: true,
          })
        );
        return { id, result: true, error: null };
      case "core.set_torrent_options":
        unwrap(
          await call( "torrent-set", {
            ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)),
            ...torrentOptionsToTransmission((params[1] as Record<string, unknown>) || {}),
          })
        );
        return { id, result: true, error: null };
      case "core.set_torrent_file_priorities":
        unwrap(
          await call( "torrent-set", {
            ids: resolveTransmissionIds(params[0], await fetchTorrents(demo, live, admin)),
            ...filePrioritiesToTransmissionArgs((params[1] as number[]) || []),
          })
        );
        return { id, result: true, error: null };
      case "core.set_torrent_trackers": {
        const torrents = await fetchTorrents(demo, live, admin);
        const torrent = torrentById(torrents, Array.isArray(params[0]) ? params[0][0] : params[0]);
        if (!torrent) throw new Error("Unknown torrent");
        const next = (params[1] as { url: string }[]) || [];
        const edit = trackerEditToTransmissionArgs(
          torrent.trackers ?? [],
          next.map((t) => String(t.url ?? ""))
        );
        if (Object.keys(edit).length) {
          unwrap(await call("torrent-set", { ids: [torrent.id], ...edit }));
        }
        return { id, result: true, error: null };
      }
      case "core.add_torrent_magnet": {
        const args = unwrap(
          await call("torrent-add", {
            filename: String(params[0] ?? ""),
            ...addOptionsToTransmission((params[1] as Record<string, unknown>) || {}),
          })
        );
        const added = (args["torrent-added"] ?? args["torrent-duplicate"]) as
          | { id?: number; hashString?: string }
          | undefined;
        return {
          id,
          result: added?.hashString || added?.id || parseMagnetInfoHash(String(params[0] ?? "")),
          error: null,
        };
      }
      case "core.add_torrent_url":
        unwrap(
          await call( "torrent-add", {
            filename: String(params[0] ?? ""),
            ...addOptionsToTransmission((params[1] as Record<string, unknown>) || {}),
          })
        );
        return { id, result: true, error: null };
      case "core.add_torrent_file":
      case "core.add_torrent_file_async":
        unwrap(
          await call( "torrent-add", {
            metainfo: String(params[1] ?? ""),
            ...addOptionsToTransmission((params[2] as Record<string, unknown>) || {}),
          })
        );
        return { id, result: true, error: null };
      case "core.get_config":
        return { id, result: sessionToCoreConfig(await fetchSession(demo, live, admin)), error: null };
      case "core.set_config": {
        const patch = coreConfigToSession((params[0] as Record<string, unknown>) || {});
        if (Object.keys(patch).length) unwrap(await call( "session-set", patch));
        return { id, result: true, error: null };
      }
      case "core.get_config_value": {
        const cfg = sessionToCoreConfig(await fetchSession(demo, live, admin));
        return { id, result: cfg[String(params[0])], error: null };
      }
      case "core.get_config_values": {
        const cfg = sessionToCoreConfig(await fetchSession(demo, live, admin));
        const keys = (params[0] as string[]) || [];
        const out: Record<string, unknown> = {};
        for (const key of keys) out[key] = cfg[key];
        return { id, result: out, error: null };
      }
      case "core.get_version":
        return { id, result: (await fetchSession(demo, live, admin)).version || "Transmission", error: null };
      case "core.get_libtorrent_version": {
        const session = await fetchSession(demo, live, admin);
        return { id, result: session["rpc-version"] != null ? `RPC ${session["rpc-version"]}` : null, error: null };
      }
      case "label.get_labels":
        if (demo) return { id, result: transmissionDemoLabels(admin), error: null };
        {
          const torrents = await fetchTorrents(demo, live, admin);
          if (!torrents.some((t) => Array.isArray(t.labels))) throw new Error("Unknown method");
          return { id, result: uniqueLabels(torrents), error: null };
        }
      case "label.add":
        if (demo) addTransmissionDemoLabel(String(params[0] ?? "").trim(), admin);
        return { id, result: true, error: null };
      case "label.remove": {
        const name = String(params[0] ?? "").trim();
        if (demo) removeTransmissionDemoLabel(name, admin);
        else {
          const torrents = await fetchTorrents(demo, live, admin);
          for (const torrent of torrents) {
            const labels = (torrent.labels ?? []).filter((l) => l !== name);
            if (labels.length !== (torrent.labels ?? []).length) {
              unwrap(await call( "torrent-set", { ids: [torrent.id], labels }));
            }
          }
        }
        return { id, result: true, error: null };
      }
      case "label.set_torrent": {
        const torrentId = params[0];
        const label = String(params[1] ?? "").trim();
        if (demo) {
          setTransmissionDemoTorrentLabel(String(torrentId), label, admin);
          return { id, result: true, error: null };
        }
        const torrents = await fetchTorrents(demo, live, admin);
        const torrent = torrentById(torrents, torrentId);
        if (!torrent) throw new Error("Unknown torrent");
        unwrap(await call( "torrent-set", { ids: [torrent.id], labels: label ? [label] : [] }));
        return { id, result: true, error: null };
      }
      case "label.get_options":
        return { id, result: {}, error: null };
      case "label.set_options":
        return { id, result: true, error: null };
      default:
        throw new Error("Unknown method");
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "RPC error");
  }
}
