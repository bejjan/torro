import assert from "node:assert/strict";
import {
  alreadyInSessionMessage,
  addButtonLabel,
  addPartialFailureMessage,
  addSubmitBatches,
  addSuccessToast,
  canSubmitQueue,
  createPendingAdd,
  remainingAfterPartialAdd,
  defaultsFromConfig,
  emptyDefaults,
  findDuplicate,
  mixedField,
  optionsFromPending,
  parseMagnetLines,
  readyAdds,
  selectionAfterRemove,
  sessionHasInfoHash,
  splitAlreadyInSession,
  sourceHint,
  torrentFilesFromList,
  urlBasename,
  type PendingAdd,
} from "./add-torrent-queue";

const defaults = emptyDefaults("/downloads", false);

function item(partial: Partial<PendingAdd> & Pick<PendingAdd, "id">): PendingAdd {
  return {
    ...createPendingAdd("file", "a.torrent", defaults, { status: "ready", path: "/tmp/a.torrent" }),
    ...partial,
  };
}

{
  const torrent = { name: "a.torrent", type: "application/x-bittorrent" } as File;
  const other = { name: "notes.txt", type: "text/plain" } as File;
  assert.deepEqual(
    torrentFilesFromList([torrent, other] as unknown as File[]).map((file) => file.name),
    ["a.torrent"]
  );
  assert.deepEqual(torrentFilesFromList(null), []);
}

{
  const lines = parseMagnetLines("  magnet:?xt=urn:btih:aa  \n\nmagnet:?xt=urn:btih:bb\n");
  assert.deepEqual(lines, ["magnet:?xt=urn:btih:aa", "magnet:?xt=urn:btih:bb"]);
}

{
  const cfg = defaultsFromConfig(
    {
      download_location: "/data",
      move_completed: true,
      move_completed_path: "/done",
      add_paused: true,
      sequential_download: true,
      prioritize_first_last_pieces: true,
      max_download_speed_per_torrent: 128,
      max_upload_speed_per_torrent: -1,
    },
    "/fallback",
    true
  );
  assert.equal(cfg.download_location, "/data");
  assert.equal(cfg.move_completed, true);
  assert.equal(cfg.add_paused, true);
  assert.equal(cfg.max_download_speed, "128");
  assert.equal(cfg.notifyOnComplete, true);
  assert.equal(defaultsFromConfig({}, "/fallback", false).download_location, "/fallback");
}

{
  const ready = item({ id: "1", status: "ready", infoHash: "aa" });
  const loading = item({ id: "2", status: "loading", infoHash: "" });
  assert.equal(canSubmitQueue([ready], false), true);
  assert.equal(canSubmitQueue([ready, loading], false), false);
  assert.equal(canSubmitQueue([ready], true), false);
  assert.equal(canSubmitQueue([], false), false);
  assert.equal(readyAdds([ready, loading]).length, 1);
  const readyNoPath = item({ id: "3", status: "ready", path: "", infoHash: "cc" });
  assert.equal(canSubmitQueue([readyNoPath], false), false);
  assert.equal(readyAdds([readyNoPath]).length, 0);
}

{
  const a = item({ id: "1", infoHash: "ABC" });
  const b = item({ id: "2", infoHash: "abc" });
  assert.equal(findDuplicate([a], "abc")?.id, "1");
  assert.equal(findDuplicate([a, b], "abc", "1")?.id, "2");
  assert.equal(findDuplicate([a], "def"), undefined);
}

{
  const a = item({
    id: "1",
    options: { ...defaults, download_location: "/a", add_paused: true },
  });
  const b = item({
    id: "2",
    options: { ...defaults, download_location: "/b", add_paused: true },
  });
  assert.deepEqual(
    mixedField([a, b], (row) => row.options.add_paused),
    { mixed: false, value: true }
  );
  assert.equal(mixedField([a, b], (row) => row.options.download_location).mixed, true);
}

{
  const pending = item({
    id: "1",
    options: { ...formFromDefaultsSafe(), max_download_speed: "64", move_completed: true, move_completed_path: "/done" },
    priorities: [4, 0, 7],
  });
  const options = optionsFromPending(pending);
  assert.equal(options.download_location, "/downloads");
  assert.equal(options.max_download_speed, 64);
  assert.equal(options.move_completed, true);
  assert.equal(options.move_completed_path, "/done");
  assert.deepEqual(options.file_priorities, [4, 0, 7]);
}

{
  assert.equal(addSuccessToast(1), "Torrent added");
  assert.equal(addSuccessToast(3), "3 torrents added");
  assert.equal(addButtonLabel(1, false), "Add");
  assert.equal(addButtonLabel(2, false), "Add 2 torrents");
  assert.equal(addButtonLabel(4, true), "Adding…");
  assert.equal(addPartialFailureMessage(0, "Timed out"), "Timed out");
  assert.equal(
    addPartialFailureMessage(1, "Timed out"),
    "1 torrent was added. The rest failed: Timed out"
  );
  assert.equal(
    addPartialFailureMessage(2, "Invalid magnet URI"),
    "2 torrents were added. The rest failed: Invalid magnet URI"
  );
  assert.equal(alreadyInSessionMessage(1), "This torrent is already in the session");
  assert.equal(alreadyInSessionMessage(2), "2 torrents are already in the session");
  assert.equal(sessionHasInfoHash(["ABC"], "abc"), true);
  assert.equal(sessionHasInfoHash(["other"], "abc"), false);
  assert.equal(sessionHasInfoHash(null, "abc"), false);
  const known = item({ id: "known", infoHash: "abc" });
  const novel = item({ id: "novel", infoHash: "def" });
  const split = splitAlreadyInSession([known, novel], ["ABC"]);
  assert.deepEqual(split.existing.map((row) => row.id), ["known"]);
  assert.deepEqual(split.fresh.map((row) => row.id), ["novel"]);
}

{
  const fileNotify = item({ id: "n", kind: "file", notifyOnComplete: true });
  const fileSilent = item({ id: "s", kind: "file", notifyOnComplete: false });
  const magnet = item({
    id: "m",
    kind: "magnet",
    path: "magnet:?xt=urn:btih:aa",
    notifyOnComplete: true,
  });
  assert.deepEqual(addSubmitBatches([fileNotify, magnet, fileSilent]).fileNotify.map((row) => row.id), [
    "n",
  ]);
  assert.deepEqual(addSubmitBatches([fileNotify, magnet, fileSilent]).fileSilent.map((row) => row.id), [
    "s",
  ]);
  assert.deepEqual(addSubmitBatches([fileNotify, magnet, fileSilent]).magnets.map((row) => row.id), [
    "m",
  ]);
  const leftover = remainingAfterPartialAdd(
    [fileNotify, fileSilent, magnet],
    new Set(["n"])
  );
  assert.deepEqual(
    leftover.map((row) => row.id),
    ["s", "m"]
  );
}

{
  const queue = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
  assert.deepEqual([...selectionAfterRemove(queue, new Set(["a", "b"]), new Set(["a"]))].sort(), ["b"]);
  assert.deepEqual([...selectionAfterRemove(queue, new Set(["a"]), new Set(["a"]))], ["b"]);
  assert.deepEqual([...selectionAfterRemove(queue, new Set(["c"]), new Set(["c"]))], ["b"]);
  assert.deepEqual([...selectionAfterRemove(queue, new Set(["a"]), new Set(["a", "b", "c"]))], []);
}

{
  assert.equal(sourceHint(item({ id: "1", kind: "file" })), "Torrent file");
  assert.equal(sourceHint(item({ id: "2", kind: "magnet" })), "Magnet");
  assert.equal(
    sourceHint(
      item({
        id: "3",
        kind: "url",
        source: "https://cdn.example.com/foo.torrent",
        path: "/tmp/foo.torrent",
      })
    ),
    "cdn.example.com"
  );
  assert.equal(urlBasename("https://example.com/path/Show.S01.torrent?dl=1"), "Show.S01.torrent");
}

function formFromDefaultsSafe() {
  return {
    download_location: "/downloads",
    move_completed: false,
    move_completed_path: "",
    add_paused: false,
    sequential_download: false,
    prioritize_first_last_pieces: false,
    max_download_speed: "-1",
    max_upload_speed: "-1",
  };
}

console.log("add-torrent-queue tests passed");
