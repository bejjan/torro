import type { AdminDemoConfig } from "../demo/admin-catalog";
import type { JsonRpcRequest } from "@/lib/deluge/demo";
import { formatUnknownMethodMessage } from "@/lib/deluge/plugins";
import { inventDemoFilesTree, parseMagnetInfoHash, type TorrentFileInfo } from "@/lib/deluge/files-tree";
import { parseMagnetName } from "@/lib/deluge/format";
import type { FilterDict, TorrentStatus } from "@/lib/deluge/types";
import {
  getQbittorrentDemoUpload,
  getQbittorrentDemoWebConfig,
  handleQbittorrentDemo,
  isQbittorrentDemoAuthed,
  loginQbittorrentDemo,
  logoutQbittorrentDemo,
  qbittorrentDemoCategories,
  setQbittorrentDemoWebConfig,
} from "./demo";
import { isQbittorrentLoginOk, QbittorrentProxyError } from "./proxy";
import {
  coreConfigToPrefs,
  filesTreeFromQbittorrent,
  joinHashes,
  kibToBytesLimit,
  mapQbittorrentPeers,
  mapQbittorrentTorrent,
  mapQbittorrentTrackers,
  mapUiUpdate,
  prefsToCoreConfig,
  qbittorrentPriorityFromDeluge,
  torrentKey,
  torrentsFromMaindata,
  uniqueCategories,
} from "./map";
import type {
  QbittorrentBuildInfo,
  QbittorrentCallResult,
  QbittorrentCaller,
  QbittorrentCategory,
  QbittorrentFile,
  QbittorrentMaindata,
  QbittorrentPreferences,
  QbittorrentRequest,
  QbittorrentTorrent,
  QbittorrentTorrentPeers,
  QbittorrentTracker,
} from "./types";

export interface CompatResult {
  id: number | string;
  result: unknown;
  error: { message: string; code?: number } | null;
  setCookie?: string | string[] | null;
}

async function qbCall(
  demo: boolean,
  live: QbittorrentCaller | undefined,
  req: QbittorrentRequest,
  admin?: AdminDemoConfig | null
): Promise<QbittorrentCallResult> {
  if (demo) return handleQbittorrentDemo(req, admin);
  if (!live) throw new Error("qBittorrent is not configured.");
  return live(req);
}

function isNotFound(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: unknown }).status === 404
  );
}

async function tryPaths(
  call: (req: QbittorrentRequest) => Promise<QbittorrentCallResult>,
  paths: string[],
  form: Record<string, string | number | boolean | undefined>
): Promise<QbittorrentCallResult> {
  let lastErr: unknown;
  for (const path of paths) {
    try {
      return await call({ method: "POST", path, form });
    } catch (err) {
      lastErr = err;
      if (!isNotFound(err)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("qBittorrent request failed.");
}

async function fetchMaindata(
  call: (req: QbittorrentRequest) => Promise<QbittorrentCallResult>
): Promise<QbittorrentMaindata> {
  const res = await call({ method: "GET", path: "/sync/maindata", query: { rid: 0 } });
  return (res.data ?? {}) as QbittorrentMaindata;
}

async function fetchTorrents(
  call: (req: QbittorrentRequest) => Promise<QbittorrentCallResult>
): Promise<QbittorrentTorrent[]> {
  return torrentsFromMaindata(await fetchMaindata(call));
}

async function fetchPrefs(
  call: (req: QbittorrentRequest) => Promise<QbittorrentCallResult>
): Promise<QbittorrentPreferences> {
  const res = await call({ method: "GET", path: "/app/preferences" });
  return (res.data ?? {}) as QbittorrentPreferences;
}

function torrentById(torrents: QbittorrentTorrent[], id: unknown): QbittorrentTorrent | undefined {
  const key = String(id).trim().toLowerCase();
  return torrents.find((t) => torrentKey(t) === key || t.hash.toLowerCase() === key);
}

function addFormFromOptions(
  options: Record<string, unknown> | undefined
): Record<string, string | number | boolean> {
  const form: Record<string, string | number | boolean> = {};
  if (!options) return form;
  if (typeof options.download_location === "string" && options.download_location) {
    form.savepath = options.download_location;
  }
  if (options.add_paused != null) form.paused = Boolean(options.add_paused);
  if (options.sequential_download != null) form.sequentialDownload = Boolean(options.sequential_download);
  if (options.prioritize_first_last_pieces != null) {
    form.firstLastPiecePrio = Boolean(options.prioritize_first_last_pieces);
  }
  if (options.max_download_speed != null) {
    form.dlLimit = kibToBytesLimit(Number(options.max_download_speed));
  }
  if (options.max_upload_speed != null) {
    form.upLimit = kibToBytesLimit(Number(options.max_upload_speed));
  }
  if (typeof options.label === "string" && options.label) form.category = options.label;
  return form;
}

const OPEN = new Set(["auth.login", "auth.check_session", "web.connected"]);

export async function handleQbittorrentCompat(
  body: JsonRpcRequest,
  opts: {
    demo: boolean;
    cookieHeader: string | null;
    live?: QbittorrentCaller;
    password?: string;
    username?: string;
    admin?: AdminDemoConfig | null;
  }
): Promise<CompatResult> {
  const id = body.id ?? 0;
  const method = body.method;
  const params = Array.isArray(body.params) ? body.params : [];
  const { demo, live } = opts;
  const admin = opts.admin ?? null;
  const call = (req: QbittorrentRequest) => qbCall(demo, live, req, admin);
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
        const login = loginQbittorrentDemo(password, admin);
        return { id, result: login.ok, error: null, setCookie: login.setCookie };
      }
      try {
        const username = opts.username || "admin";
        const result = await call({
          method: "POST",
          path: "/auth/login",
          form: { username, password },
        });
        const ok = isQbittorrentLoginOk(result.data, result.setCookies);
        return { id, result: ok, error: null, setCookie: result.setCookies };
      } catch (err) {
        if (err instanceof QbittorrentProxyError && err.status === 401) {
          return { id, result: false, error: null };
        }
        throw err;
      }
    }
    if (method === "auth.check_session") {
      if (demo) return { id, result: isQbittorrentDemoAuthed(opts.cookieHeader, admin), error: null };
      try {
        await call({ method: "GET", path: "/app/version" });
        return { id, result: true, error: null };
      } catch {
        return { id, result: false, error: null };
      }
    }
    if (method === "auth.delete_session") {
      const cookies: string[] = [];
      if (demo) cookies.push(logoutQbittorrentDemo(opts.cookieHeader, admin));
      else {
        try {
          const result = await call({ method: "POST", path: "/auth/logout" });
          if (result.setCookies) cookies.push(...result.setCookies);
        } catch {
          /* ignore */
        }
      }
      cookies.push("nova_qb_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
      return { id, result: true, error: null, setCookie: cookies };
    }
    if (!OPEN.has(method) && demo && !isQbittorrentDemoAuthed(opts.cookieHeader, admin)) {
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
        const main = await fetchMaindata(call);
        const torrents = torrentsFromMaindata(main);
        return {
          id,
          result: mapUiUpdate(torrents, main.server_state, filter, keys, main.categories),
          error: null,
        };
      }
      case "web.get_torrent_status":
      case "core.get_torrent_status": {
        const torrents = await fetchTorrents(call);
        const torrent = torrentById(torrents, params[0]);
        if (!torrent) throw new Error("Unknown torrent");
        const status = mapQbittorrentTorrent(torrent) as TorrentStatus & Record<string, unknown>;
        const keys = (params[1] as string[]) || [];
        const base = keys.length
          ? Object.fromEntries(Object.entries(status).filter(([key]) => keys.includes(key)))
          : { ...status };
        if (!keys.length || keys.includes("peers")) {
          const peersRes = await call({
            method: "GET",
            path: "/sync/torrentPeers",
            query: { hash: torrent.hash },
          });
          const peers = (peersRes.data as QbittorrentTorrentPeers | undefined)?.peers;
          (base as Record<string, unknown>).peers = mapQbittorrentPeers(peers);
        }
        if (!keys.length || keys.includes("trackers")) {
          const trackersRes = await call({
            method: "GET",
            path: "/torrents/trackers",
            query: { hash: torrent.hash },
          });
          (base as Record<string, unknown>).trackers = mapQbittorrentTrackers(
            trackersRes.data as QbittorrentTracker[]
          );
        }
        return { id, result: base, error: null };
      }
      case "web.get_torrent_files": {
        const torrents = await fetchTorrents(call);
        const torrent = torrentById(torrents, params[0]);
        if (!torrent) throw new Error("Unknown torrent");
        const filesRes = await call({
          method: "GET",
          path: "/torrents/files",
          query: { hash: torrent.hash },
        });
        return { id, result: filesTreeFromQbittorrent(filesRes.data as QbittorrentFile[]), error: null };
      }
      case "web.get_free_space":
      case "core.get_free_space": {
        const main = await fetchMaindata(call);
        return { id, result: Number(main.server_state?.free_space_on_disk ?? 0) || 0, error: null };
      }
      case "web.get_config":
        if (demo) return { id, result: getQbittorrentDemoWebConfig(admin), error: null };
        return {
          id,
          result: { show_sidebar: true, show_session_speed: true, sidebar_show_zero: false },
          error: null,
        };
      case "web.set_config":
        if (demo) setQbittorrentDemoWebConfig((params[0] as Record<string, unknown>) || {}, admin);
        return { id, result: null, error: null };
      case "web.get_plugins":
        return {
          id,
          result: { available_plugins: ["Label"], enabled_plugins: ["Label"] },
          error: null,
        };
      case "core.get_enabled_plugins":
      case "core.get_available_plugins":
        return { id, result: ["Label"], error: null };
      case "web.get_torrent_info": {
        const path = String(params[0] ?? "");
        const upload = getQbittorrentDemoUpload(path, admin);
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
          result: {
            name,
            info_hash: path.slice(-40) || "0".repeat(40),
            files_tree: inventDemoFilesTree(name, 0),
            filename: path,
          },
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
          const form = addFormFromOptions(item.options);
          if (item.path.startsWith("magnet:")) {
            await call({ method: "POST", path: "/torrents/add", form: { urls: item.path, ...form } });
            added.push(parseMagnetInfoHash(item.path) || true);
          } else {
            const upload = getQbittorrentDemoUpload(item.path, admin);
            if (upload?.metainfo && !demo) {
              await call({
                method: "POST",
                path: "/torrents/add",
                form,
                files: [
                  {
                    field: "torrents",
                    filename: `${upload.name}.torrent`,
                    data: Buffer.from(upload.metainfo, "base64"),
                  },
                ],
              });
            } else {
              await call({
                method: "POST",
                path: "/torrents/add",
                form: { urls: item.path, ...form },
              });
            }
            added.push(upload?.infoHash || true);
          }
        }
        return { id, result: added.length === 1 ? added[0] : added, error: null };
      }
      case "web.download_torrent_from_url":
        return { id, result: String(params[0] ?? ""), error: null };
      case "core.pause_torrent":
      case "core.pause_torrents":
        await tryPaths(call, ["/torrents/stop", "/torrents/pause"], { hashes: joinHashes(params[0]) });
        return { id, result: true, error: null };
      case "core.resume_torrent":
      case "core.resume_torrents":
        await tryPaths(call, ["/torrents/start", "/torrents/resume"], { hashes: joinHashes(params[0]) });
        return { id, result: true, error: null };
      case "core.remove_torrent":
      case "core.remove_torrents":
        await call({
          method: "POST",
          path: "/torrents/delete",
          form: { hashes: joinHashes(params[0]), deleteFiles: Boolean(params[1]) },
        });
        return { id, result: true, error: null };
      case "core.force_recheck":
        await call({ method: "POST", path: "/torrents/recheck", form: { hashes: joinHashes(params[0]) } });
        return { id, result: true, error: null };
      case "core.force_reannounce":
        await call({
          method: "POST",
          path: "/torrents/reannounce",
          form: { hashes: joinHashes(params[0]) },
        });
        return { id, result: true, error: null };
      case "core.queue_top":
        await call({ method: "POST", path: "/torrents/topPrio", form: { hashes: joinHashes(params[0]) } });
        return { id, result: true, error: null };
      case "core.queue_bottom":
        await call({
          method: "POST",
          path: "/torrents/bottomPrio",
          form: { hashes: joinHashes(params[0]) },
        });
        return { id, result: true, error: null };
      case "core.queue_up":
        await call({
          method: "POST",
          path: "/torrents/increasePrio",
          form: { hashes: joinHashes(params[0]) },
        });
        return { id, result: true, error: null };
      case "core.queue_down":
        await call({
          method: "POST",
          path: "/torrents/decreasePrio",
          form: { hashes: joinHashes(params[0]) },
        });
        return { id, result: true, error: null };
      case "core.move_storage":
        await call({
          method: "POST",
          path: "/torrents/setLocation",
          form: { hashes: joinHashes(params[0]), location: String(params[1] ?? "") },
        });
        return { id, result: true, error: null };
      case "core.set_torrent_options": {
        const hashes = joinHashes(params[0]);
        const options = (params[1] as Record<string, unknown>) || {};
        if ("max_download_speed" in options) {
          await call({
            method: "POST",
            path: "/torrents/setDownloadLimit",
            form: { hashes, limit: kibToBytesLimit(Number(options.max_download_speed)) },
          });
        }
        if ("max_upload_speed" in options) {
          await call({
            method: "POST",
            path: "/torrents/setUploadLimit",
            form: { hashes, limit: kibToBytesLimit(Number(options.max_upload_speed)) },
          });
        }
        if ("is_auto_managed" in options) {
          await call({
            method: "POST",
            path: "/torrents/setAutoManagement",
            form: { hashes, enable: Boolean(options.is_auto_managed) },
          });
        }
        if ("stop_at_ratio" in options || "stop_ratio" in options) {
          const ratio =
            options.stop_at_ratio === false ? -2 : Number(options.stop_ratio ?? options.stop_at_ratio ?? -1);
          await call({
            method: "POST",
            path: "/torrents/setShareLimits",
            form: {
              hashes,
              ratioLimit: Number.isFinite(ratio) ? ratio : -1,
              seedingTimeLimit: -1,
              inactiveSeedingTimeLimit: -1,
            },
          });
        }
        if ("super_seeding" in options) {
          await call({
            method: "POST",
            path: "/torrents/setSuperSeeding",
            form: { hashes, value: Boolean(options.super_seeding) },
          });
        }
        // Deluge's set_torrent_options key is `prioritize_first_last_pieces`; the status field is
        // `prioritize_first_last`. Accept either.
        const flKey =
          "prioritize_first_last_pieces" in options
            ? "prioritize_first_last_pieces"
            : "prioritize_first_last" in options
              ? "prioritize_first_last"
              : null;
        if ("sequential_download" in options || flKey) {
          const torrents = await fetchTorrents(call);
          const selected = torrents.filter((t) => hashes.split("|").includes(torrentKey(t)));
          const seqWanted =
            "sequential_download" in options ? Boolean(options.sequential_download) : undefined;
          const flWanted = flKey ? Boolean(options[flKey]) : undefined;
          const seqHashes = selected
            .filter((t) => seqWanted != null && Boolean(t.seq_dl) !== seqWanted)
            .map((t) => t.hash);
          const flHashes = selected
            .filter((t) => flWanted != null && Boolean(t.f_l_piece_prio) !== flWanted)
            .map((t) => t.hash);
          if (seqHashes.length) {
            await call({
              method: "POST",
              path: "/torrents/toggleSequentialDownload",
              form: { hashes: seqHashes.join("|") },
            });
          }
          if (flHashes.length) {
            await call({
              method: "POST",
              path: "/torrents/toggleFirstLastPiecePrio",
              form: { hashes: flHashes.join("|") },
            });
          }
        }
        return { id, result: true, error: null };
      }
      case "core.set_torrent_file_priorities": {
        const torrents = await fetchTorrents(call);
        const torrent = torrentById(torrents, Array.isArray(params[0]) ? params[0][0] : params[0]);
        if (!torrent) throw new Error("Unknown torrent");
        const priorities = (params[1] as number[]) || [];
        const groups = new Map<number, number[]>();
        priorities.forEach((priority, index) => {
          const mapped = qbittorrentPriorityFromDeluge(priority);
          const list = groups.get(mapped) ?? [];
          list.push(index);
          groups.set(mapped, list);
        });
        for (const [priority, indexes] of groups) {
          await call({
            method: "POST",
            path: "/torrents/filePrio",
            form: { hash: torrent.hash, id: indexes.join("|"), priority },
          });
        }
        return { id, result: true, error: null };
      }
      case "core.set_torrent_trackers": {
        const torrents = await fetchTorrents(call);
        const torrent = torrentById(torrents, Array.isArray(params[0]) ? params[0][0] : params[0]);
        if (!torrent) throw new Error("Unknown torrent");
        const next = (params[1] as { url: string }[]) || [];
        const currentRes = await call({
          method: "GET",
          path: "/torrents/trackers",
          query: { hash: torrent.hash },
        });
        const current = mapQbittorrentTrackers(currentRes.data as QbittorrentTracker[]);
        const currentUrls = new Set(current.map((t) => t.url));
        const wanted = new Set(next.map((t) => t.url).filter(Boolean));
        const add = next.map((t) => t.url).filter((url) => url && !currentUrls.has(url));
        const remove = [...currentUrls].filter((url) => !wanted.has(url));
        if (add.length) {
          await call({
            method: "POST",
            path: "/torrents/addTrackers",
            form: { hash: torrent.hash, urls: add.join("\n") },
          });
        }
        if (remove.length) {
          await call({
            method: "POST",
            path: "/torrents/removeTrackers",
            form: { hash: torrent.hash, urls: remove.join("|") },
          });
        }
        return { id, result: true, error: null };
      }
      case "core.add_torrent_magnet": {
        const uri = String(params[0] ?? "");
        await call({
          method: "POST",
          path: "/torrents/add",
          form: { urls: uri, ...addFormFromOptions((params[1] as Record<string, unknown>) || {}) },
        });
        return { id, result: parseMagnetInfoHash(uri) || true, error: null };
      }
      case "core.add_torrent_url":
        await call({
          method: "POST",
          path: "/torrents/add",
          form: {
            urls: String(params[0] ?? ""),
            ...addFormFromOptions((params[1] as Record<string, unknown>) || {}),
          },
        });
        return { id, result: true, error: null };
      case "core.add_torrent_file":
      case "core.add_torrent_file_async": {
        const metainfo = String(params[1] ?? "");
        await call({
          method: "POST",
          path: "/torrents/add",
          form: addFormFromOptions((params[2] as Record<string, unknown>) || {}),
          files: [
            {
              field: "torrents",
              filename: `${String(params[0] ?? "upload").replace(/\.torrent$/i, "")}.torrent`,
              data: Buffer.from(metainfo, "base64"),
            },
          ],
        });
        return { id, result: true, error: null };
      }
      case "core.get_config":
        return { id, result: prefsToCoreConfig(await fetchPrefs(call)), error: null };
      case "core.set_config": {
        const patch = coreConfigToPrefs((params[0] as Record<string, unknown>) || {});
        if (Object.keys(patch).length) {
          await call({
            method: "POST",
            path: "/app/setPreferences",
            form: { json: JSON.stringify(patch) },
          });
        }
        return { id, result: true, error: null };
      }
      case "core.get_config_value": {
        const cfg = prefsToCoreConfig(await fetchPrefs(call));
        return { id, result: cfg[String(params[0])], error: null };
      }
      case "core.get_config_values": {
        const cfg = prefsToCoreConfig(await fetchPrefs(call));
        const keys = (params[0] as string[]) || [];
        const out: Record<string, unknown> = {};
        for (const key of keys) out[key] = cfg[key];
        return { id, result: out, error: null };
      }
      case "core.get_version": {
        const res = await call({ method: "GET", path: "/app/version" });
        return { id, result: String(res.data ?? "qBittorrent"), error: null };
      }
      case "core.get_libtorrent_version": {
        const res = await call({ method: "GET", path: "/app/buildInfo" });
        const info = (res.data ?? {}) as QbittorrentBuildInfo;
        return { id, result: info.libtorrent ?? null, error: null };
      }
      case "label.get_labels":
        if (demo) return { id, result: qbittorrentDemoCategories(admin), error: null };
        {
          const [catsRes, torrents] = await Promise.all([
            call({ method: "GET", path: "/torrents/categories" }),
            fetchTorrents(call),
          ]);
          return {
            id,
            result: uniqueCategories(torrents, (catsRes.data ?? {}) as Record<string, QbittorrentCategory>),
            error: null,
          };
        }
      case "label.add":
        await call({
          method: "POST",
          path: "/torrents/createCategory",
          form: { category: String(params[0] ?? "").trim(), savePath: "" },
        });
        return { id, result: true, error: null };
      case "label.remove":
        await call({
          method: "POST",
          path: "/torrents/removeCategories",
          form: { categories: String(params[0] ?? "").trim() },
        });
        return { id, result: true, error: null };
      case "label.set_torrent": {
        const torrentId = params[0];
        const label = String(params[1] ?? "").trim();
        const torrents = await fetchTorrents(call);
        const torrent = torrentById(torrents, torrentId);
        if (!torrent) throw new Error("Unknown torrent");
        await call({
          method: "POST",
          path: "/torrents/setCategory",
          form: { hashes: torrent.hash, category: label },
        });
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
