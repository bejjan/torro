import assert from "node:assert/strict";
import { diffTorrentMaps, patchUiFrame, resetUiUpdateSnapshots, uiSnapshotKey } from "./ui-diff";

resetUiUpdateSnapshots();

{
  const prev = {
    a: { name: "A", progress: 10, upload_payload_rate: 0 },
    b: { name: "B", progress: 100, upload_payload_rate: 5 },
  };
  const next = {
    a: { name: "A", progress: 10, upload_payload_rate: 0 },
    b: { name: "B", progress: 100, upload_payload_rate: 9 },
    c: { name: "C", progress: 0, upload_payload_rate: 1 },
  };
  const diff = diffTorrentMaps(prev, next);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.changed.a, undefined);
  assert.deepEqual(diff.changed.b, { upload_payload_rate: 9 });
  assert.deepEqual(diff.changed.c, next.c);
}

{
  const diff = diffTorrentMaps({ a: { name: "A" }, b: { name: "B" } }, { a: { name: "A" } });
  assert.deepEqual(diff.removed, ["b"]);
  assert.deepEqual(diff.changed, {});
}

{
  resetUiUpdateSnapshots();
  const full = patchUiFrame("sess", null, {
    connected: true,
    torrents: { a: { name: "A", progress: 1 } },
  });
  assert.equal(full.partial, false);
  assert.equal(full.revision, 1);
  assert.equal(full.torrents.a.name, "A");

  const partial = patchUiFrame("sess", 1, {
    connected: true,
    torrents: { a: { name: "A", progress: 2 } },
  });
  assert.equal(partial.partial, true);
  assert.equal(partial.revision, 2);
  assert.deepEqual(partial.torrents, { a: { progress: 2 } });
  assert.deepEqual(partial.removed, []);

  const missed = patchUiFrame("sess", 1, {
    connected: true,
    torrents: { a: { name: "A", progress: 3 } },
  });
  assert.equal(missed.partial, false, "a stale revision gets the full map");
  assert.equal(missed.torrents.a.progress, 3);
}

{
  resetUiUpdateSnapshots();
  patchUiFrame("sess", null, { connected: true, torrents: { a: { name: "A" } } });
  const gone = patchUiFrame("sess", 1, { connected: false, torrents: null });
  assert.equal(gone.partial, false);
  assert.equal(gone.revision, 0);
  const again = patchUiFrame("sess", 1, { connected: true, torrents: { a: { name: "A" } } });
  assert.equal(again.partial, false, "a disconnect drops the snapshot");
}

assert.notEqual(uiSnapshotKey(["a", "b"]), uiSnapshotKey(["a", "c"]));

console.log("ui-diff tests passed");
