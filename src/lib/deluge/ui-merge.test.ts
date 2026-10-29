import assert from "node:assert/strict";
import { mergeSessionStats, mergeUiUpdate, overlayTorrentStatus, reuseTorrentMap, torrentStatusEqual } from "./ui-merge";
import type { SessionStats, TorrentStatus, UiUpdate } from "./types";

function torrent(partial: Partial<TorrentStatus> & Pick<TorrentStatus, "name">): TorrentStatus {
  return {
    queue: 0,
    total_wanted: 100,
    state: "Paused",
    progress: 0,
    num_seeds: 0,
    total_seeds: 0,
    num_peers: 0,
    total_peers: 0,
    download_payload_rate: 0,
    upload_payload_rate: 0,
    eta: -1,
    ratio: 0,
    distributed_copies: 0,
    is_auto_managed: true,
    time_added: 1,
    tracker_host: "tracker.example",
    download_location: "/tmp",
    last_seen_complete: 0,
    total_done: 0,
    total_uploaded: 0,
    max_download_speed: -1,
    max_upload_speed: -1,
    seeds_peers_ratio: 0,
    total_remaining: 100,
    completed_time: 0,
    time_since_transfer: 0,
    total_payload_download: 0,
    total_payload_upload: 0,
    next_announce: 0,
    tracker_status: "",
    num_pieces: 1,
    piece_length: 16,
    active_time: 0,
    seeding_time: 0,
    seed_rank: 0,
    owner: "",
    public: true,
    shared: false,
    total_size: 100,
    num_files: 1,
    message: "",
    comment: "",
    creator: "",
    max_connections: -1,
    max_upload_slots: -1,
    stop_at_ratio: false,
    stop_ratio: 2,
    remove_at_ratio: false,
    private: false,
    prioritize_first_last: false,
    move_completed: false,
    move_completed_path: "",
    super_seeding: false,
    sequential_download: false,
    ...partial,
  };
}

const a = torrent({ name: "a.iso", queue: 0, progress: 10 });
const b = torrent({ name: "b.iso", queue: 1, state: "Seeding", progress: 100 });

assert.equal(torrentStatusEqual(a, a), true);
assert.equal(torrentStatusEqual(a, { ...a }), true);
assert.equal(torrentStatusEqual(a, { ...a, progress: 11 }), false);

{
  const prev = { ida: a, idb: b };
  const next = { ida: { ...a }, idb: { ...b, progress: 99 } };
  const reused = reuseTorrentMap(prev, next);
  assert.ok(reused);
  assert.equal(reused.ida, a);
  assert.notEqual(reused.idb, b);
  assert.equal(reused.idb.progress, 99);
}

{
  const prev = { ida: a };
  const same = reuseTorrentMap(prev, { ida: { ...a } });
  assert.equal(same, prev);
}

{
  const prev: UiUpdate = {
    connected: true,
    torrents: { ida: a },
    filters: { state: [["All", 1]] },
    stats: {
      max_download: -1,
      max_upload: -1,
      max_num_connections: 200,
      num_connections: 1,
      upload_rate: 0,
      download_rate: 0,
      download_protocol_rate: 0,
      upload_protocol_rate: 0,
      dht_nodes: 1,
      has_incoming_connections: true,
      free_space: 1,
      external_ip: "1.1.1.1",
    },
  };
  const next: UiUpdate = {
    connected: true,
    torrents: { ida: { ...a } },
    filters: { state: [["All", 1]] },
    stats: { ...(prev.stats as SessionStats) },
  };
  const merged = mergeUiUpdate(prev, next);
  assert.equal(merged.torrents, prev.torrents);
  assert.equal(merged.stats, prev.stats);
  assert.notEqual(merged, prev);
  assert.equal(merged.filters, next.filters);
}

{
  const prev: UiUpdate = {
    connected: true,
    torrents: { ida: a },
    filters: null,
    stats: null,
  };
  const next: UiUpdate = {
    connected: true,
    torrents: { ida: { ...a, progress: 50 } },
    filters: null,
    stats: null,
  };
  const merged = mergeUiUpdate(prev, next);
  assert.notEqual(merged.torrents, prev.torrents);
  assert.equal(merged.torrents?.ida.progress, 50);
}

{
  const prevStats: SessionStats = {
    max_download: -1,
    max_upload: -1,
    max_num_connections: 200,
    num_connections: 4,
    upload_rate: 2048,
    download_rate: 4096,
    download_protocol_rate: 0,
    upload_protocol_rate: 0,
    dht_nodes: 12,
    has_incoming_connections: true,
    free_space: 1,
    external_ip: "1.1.1.1",
  };
  assert.equal(mergeSessionStats(prevStats, null), prevStats);
  assert.equal(mergeSessionStats(null, null), null);
  assert.notEqual(
    mergeSessionStats(prevStats, { ...prevStats, download_rate: 1 }),
    prevStats
  );

  const prev: UiUpdate = {
    connected: true,
    torrents: { ida: a },
    filters: null,
    stats: prevStats,
  };
  const next: UiUpdate = {
    connected: false,
    torrents: { ida: a },
    filters: null,
    stats: null,
  };
  const merged = mergeUiUpdate(prev, next);
  assert.equal(merged.stats, prevStats);
  assert.equal(merged.connected, false);
  assert.equal(merged.torrents, prev.torrents);
}

{
  const prevFilters: [string, number][] = [["All", 1]];
  const prev: UiUpdate = {
    connected: true,
    torrents: { ida: a },
    filters: { state: prevFilters },
    stats: null,
  };
  const next: UiUpdate = {
    connected: false,
    torrents: null,
    filters: null,
    stats: null,
  };
  const merged = mergeUiUpdate(prev, next);
  assert.equal(merged.torrents, prev.torrents);
  assert.equal(merged.filters, prev.filters);
  assert.equal(merged.connected, false);
}

{
  const prev: UiUpdate = {
    connected: false,
    torrents: { ida: a },
    filters: null,
    stats: null,
  };
  const reconnecting: UiUpdate = {
    connected: true,
    torrents: null,
    filters: null,
    stats: null,
  };
  const whileConnecting = mergeUiUpdate(prev, reconnecting);
  assert.equal(whileConnecting.torrents, null);
  assert.equal(whileConnecting.connected, true);

  const next: UiUpdate = {
    connected: true,
    torrents: { idb: b },
    filters: null,
    stats: null,
  };
  const merged = mergeUiUpdate(whileConnecting, next);
  assert.equal(merged.torrents && "ida" in merged.torrents, false);
  assert.ok(merged.torrents && "idb" in merged.torrents);
}

{
  const prev: UiUpdate = {
    connected: true,
    torrents: { ida: a, idb: b },
    filters: null,
    stats: null,
  };
  const next: UiUpdate = {
    connected: true,
    torrents: { ida: a },
    filters: { state: [["All", 1]] },
    stats: null,
  };
  const merged = mergeUiUpdate(prev, next);
  assert.equal(merged.torrents && "idb" in merged.torrents, false);
  assert.ok(merged.torrents && "ida" in merged.torrents);
}

{
  const rich = torrent({ name: "a.iso", max_connections: 80, max_upload_slots: 4, comment: "Demo" });
  const grid = {
    name: a.name,
    queue: a.queue,
    progress: a.progress,
    state: a.state,
    max_download_speed: a.max_download_speed,
    max_upload_speed: a.max_upload_speed,
  } as TorrentStatus;
  const kept = overlayTorrentStatus(rich, grid, true);
  assert.equal(kept?.max_connections, 80);
  assert.equal(kept?.max_upload_slots, 4);
  assert.equal(kept?.comment, "Demo");
  const replaced = overlayTorrentStatus(rich, b, false);
  assert.equal(replaced?.name, "b.iso");
}

{
  const encoded = torrent({ name: "Dune.Part.Two-R&amp;H.mkv", progress: 10 });
  const decodedName = "Dune.Part.Two-R&H.mkv";
  const first = mergeUiUpdate(null, {
    connected: true,
    torrents: { dune: encoded },
    filters: null,
    stats: null,
  });
  assert.equal(first.torrents?.dune.name, decodedName);

  const second = mergeUiUpdate(first, {
    connected: true,
    torrents: { dune: { ...encoded } },
    filters: null,
    stats: null,
  });
  assert.equal(second.torrents, first.torrents);
  assert.equal(second.torrents?.dune.name, decodedName);

  const fromStatus = torrent({ name: decodedName, progress: 10 });
  const overlaid = overlayTorrentStatus(first.torrents?.dune, encoded, true);
  assert.equal(overlaid?.name, decodedName);
  const fromDecoded = overlayTorrentStatus(fromStatus, encoded, true);
  assert.equal(fromDecoded?.name, decodedName);
}

{
  const prev = mergeUiUpdate(null, {
    connected: true,
    torrents: { a, b },
    filters: { state: [["All", 2]] },
    stats: null,
  });
  const patched = mergeUiUpdate(prev, {
    connected: true,
    partial: true,
    removed: [],
    revision: 2,
    torrents: { b: { upload_payload_rate: 40 } as TorrentStatus },
    filters: { state: [["All", 2]] },
    stats: null,
  });
  assert.equal(patched.torrents?.a, prev.torrents?.a, "untouched torrents stay put");
  assert.equal(patched.torrents?.b.name, "b.iso");
  assert.equal(patched.torrents?.b.upload_payload_rate, 40);
  assert.equal(patched.partial, undefined);
  const removed = mergeUiUpdate(patched, {
    connected: true,
    partial: true,
    removed: ["a"],
    torrents: {},
    filters: { state: [["All", 1]] },
    stats: null,
  });
  assert.equal(removed.torrents?.a, undefined);
  assert.equal(removed.torrents?.b.name, "b.iso");
}

console.log("ui-merge tests passed");
