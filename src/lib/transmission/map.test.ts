import assert from "node:assert/strict";
import { mapTransmissionState, mapTransmissionTorrent, mapSessionStats, torrentKey, transmissionPriorityFromDeluge, delugePriorityFromTransmission, filePrioritiesToTransmissionArgs, trackerEditToTransmissionArgs, matchesTransmissionFilter, uniqueLabels } from "./map";
import { TR_STATUS, type TransmissionTorrent } from "./types";
import { normalizeTransmissionRpcUrl, DEFAULT_TRANSMISSION_PORT } from "./url";

assert.equal(normalizeTransmissionRpcUrl(""), "");
assert.equal(
  normalizeTransmissionRpcUrl("127.0.0.1"),
  `http://127.0.0.1:${DEFAULT_TRANSMISSION_PORT}/transmission/rpc`
);
assert.equal(
  normalizeTransmissionRpcUrl("http://nas:9091"),
  "http://nas:9091/transmission/rpc"
);
assert.equal(
  normalizeTransmissionRpcUrl("http://nas:9091/transmission/rpc"),
  "http://nas:9091/transmission/rpc"
);
assert.equal(
  normalizeTransmissionRpcUrl("http://nas:9091/transmission"),
  "http://nas:9091/transmission/rpc"
);

const downloading: TransmissionTorrent = {
  id: 1,
  name: "ubuntu.iso",
  status: TR_STATUS.DOWNLOAD,
  percentDone: 0.5,
  hashString: "abc",
  labels: ["linux"],
  rateDownload: 100,
  rateUpload: 10,
  error: 0,
  errorString: "",
};
assert.equal(mapTransmissionState(downloading), "Downloading");
assert.equal(torrentKey(downloading), "abc");
assert.equal(mapTransmissionTorrent(downloading).progress, 50);
assert.equal(mapTransmissionTorrent(downloading).is_finished, false);
assert.equal(mapTransmissionTorrent(downloading).label, "linux");
assert.equal(
  mapTransmissionTorrent({
    ...downloading,
    status: TR_STATUS.SEED,
    percentDone: 1,
    leftUntilDone: 0,
    sizeWhenDone: 100,
  }).is_finished,
  true
);
assert.equal(
  mapTransmissionTorrent({
    ...downloading,
    name: "Dune.Part.Two-R&amp;H.mkv",
  }).name,
  "Dune.Part.Two-R&H.mkv"
);

const errored: TransmissionTorrent = {
  id: 2,
  name: "bad",
  status: TR_STATUS.STOPPED,
  error: 3,
  errorString: "No space",
  hashString: "def",
};
assert.equal(mapTransmissionState(errored), "Error");

// Transmission's file priority scale is -1 (low), 0 (normal), 1 (high).
assert.deepEqual(transmissionPriorityFromDeluge(0), { wanted: false, priority: 0 });
assert.deepEqual(transmissionPriorityFromDeluge(1), { wanted: true, priority: -1 });
assert.deepEqual(transmissionPriorityFromDeluge(4), { wanted: true, priority: 0 });
assert.deepEqual(transmissionPriorityFromDeluge(7), { wanted: true, priority: 1 });
assert.equal(delugePriorityFromTransmission(-1, true), 1);
assert.equal(delugePriorityFromTransmission(0, true), 4);
assert.equal(delugePriorityFromTransmission(1, true), 7);
assert.equal(delugePriorityFromTransmission(0, false), 0);
assert.deepEqual(filePrioritiesToTransmissionArgs([0, 1, 4, 7]), {
  "files-wanted": [1, 2, 3],
  "files-unwanted": [0],
  "priority-low": [1],
  "priority-normal": [2],
  "priority-high": [3],
});

const currentTrackers = [
  { announce: "udp://a.example:1337/announce", id: 4, tier: 0 },
  { announce: "https://b.example/announce", id: 9, tier: 1 },
];
// trackerRemove takes ids; unchanged lists send nothing (libtransmission rejects no-op edits).
assert.deepEqual(
  trackerEditToTransmissionArgs(currentTrackers, ["udp://a.example:1337/announce", "https://b.example/announce"]),
  {}
);
assert.deepEqual(
  trackerEditToTransmissionArgs(currentTrackers, [
    "udp://a.example:1337/announce",
    "https://b.example/announce",
    "udp://c.example:6969/announce",
  ]),
  { trackerAdd: ["udp://c.example:6969/announce"] }
);
assert.deepEqual(trackerEditToTransmissionArgs(currentTrackers, ["https://b.example/announce"]), {
  trackerRemove: [4],
});
assert.throws(() => trackerEditToTransmissionArgs([{ announce: "udp://x/announce" }], []), /did not report an id/);

assert.equal(
  matchesTransmissionFilter(downloading, { label: ["linux"] }),
  true
);
assert.equal(
  matchesTransmissionFilter(downloading, { label: ["movies"] }),
  false
);
assert.deepEqual(uniqueLabels([downloading, errored]), ["linux"]);

assert.equal(mapTransmissionState({ id: 3, name: "q", status: TR_STATUS.DOWNLOAD_WAIT }), "Queued");
assert.equal(mapTransmissionState({ id: 4, name: "c", status: TR_STATUS.CHECK }), "Checking");
assert.equal(mapTransmissionState({ id: 5, name: "s", status: TR_STATUS.SEED }), "Seeding");

{
  const stats = mapSessionStats(null, [
    { id: 1, name: "a", status: TR_STATUS.DOWNLOAD, rateDownload: 100, rateUpload: 10, peersConnected: 2, downloadedEver: 50, uploadedEver: 7 },
    { id: 2, name: "b", status: TR_STATUS.SEED, rateDownload: 20, rateUpload: 5, peersConnected: 1, downloadedEver: 10, uploadedEver: 3 },
  ]);
  assert.equal(stats.download_rate, 120);
  assert.equal(stats.upload_rate, 15);
  assert.equal(stats.num_connections, 3);
  assert.equal(stats.payload_download, 60);
  assert.equal(stats.payload_upload, 10);
  assert.equal(stats.dht_nodes, 0);
}

console.log("transmission map tests passed");
