import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCATION_HISTORY_FREQUENT_SLOTS,
  LOCATION_HISTORY_SCOPE_LIMIT,
  LOCATION_HISTORY_SHOWN_LIMIT,
  LOCATION_HISTORY_STORED_LIMIT,
  locationHistoryScope,
  normalizeLocationPath,
  parseLocationHistory,
  rankLocations,
  recordLocation,
  recordLocations,
  removeLocation,
  usedLocationPaths,
  withScopeLocations,
  type LocationEntry,
  type LocationHistoryStore,
} from "./location-history";
import { storageKey } from "./storage";

const paths = (entries: LocationEntry[]) => entries.map((entry) => entry.path);

// Normalising: one entry per folder, whatever the trailing separator.
assert.equal(normalizeLocationPath("  /data/tv/  "), "/data/tv");
assert.equal(normalizeLocationPath("/data/tv///"), "/data/tv");
assert.equal(normalizeLocationPath("D:\\Media\\"), "D:\\Media");
assert.equal(normalizeLocationPath("/"), "/");
assert.equal(normalizeLocationPath("///"), "/");
assert.equal(normalizeLocationPath("C:\\"), "C:\\");
assert.equal(normalizeLocationPath("C:/"), "C:/");
assert.equal(normalizeLocationPath("C:"), "C:\\");
assert.equal(normalizeLocationPath("\\\\nas\\share\\"), "\\\\nas\\share");
assert.equal(normalizeLocationPath("/Data/TV"), "/Data/TV", "case is kept");
assert.equal(normalizeLocationPath("   "), "");
assert.equal(normalizeLocationPath(null), "");
assert.equal(normalizeLocationPath(undefined), "");

// Scope: per client kind and connection URL.
assert.equal(locationHistoryScope("deluge", "http://nas:8112"), "deluge|http://nas:8112");
assert.equal(locationHistoryScope("deluge", " http://nas:8112/ "), "deluge|http://nas:8112");
assert.equal(locationHistoryScope("transmission", ""), "transmission|default");
assert.equal(locationHistoryScope("qbittorrent", null), "qbittorrent|default");
assert.notEqual(
  locationHistoryScope("deluge", "http://nas:8112"),
  locationHistoryScope("qbittorrent", "http://nas:8112")
);
assert.notEqual(
  locationHistoryScope("deluge", "http://nas:8112"),
  locationHistoryScope("deluge", "http://seedbox:8112")
);

// Recording: newest first, deduplicated, counted.
{
  let entries: LocationEntry[] = [];
  entries = recordLocation(entries, "/data/tv", 100);
  entries = recordLocation(entries, "/data/movies", 200);
  assert.deepEqual(paths(entries), ["/data/movies", "/data/tv"]);

  entries = recordLocation(entries, "/data/tv/", 300);
  assert.deepEqual(paths(entries), ["/data/tv", "/data/movies"], "re-used folder moves to the top");
  assert.deepEqual(entries[0], { path: "/data/tv", count: 2, lastUsed: 300 });
  assert.equal(entries.length, 2, "no duplicate for a trailing slash");

  const untouched = recordLocation(entries, "   ", 400);
  assert.deepEqual(untouched, entries, "blank paths are not recorded");
  assert.notEqual(untouched, entries, "always a new array");
}

// One add of many torrents counts each distinct folder once.
{
  const entries = recordLocations([], ["/a", "/a/", "/b", "", "/a"], 50);
  assert.deepEqual(
    [...entries].sort((x, y) => x.path.localeCompare(y.path)),
    [
      { path: "/a", count: 1, lastUsed: 50 },
      { path: "/b", count: 1, lastUsed: 50 },
    ]
  );
  assert.deepEqual(recordLocations(entries, [], 60), entries);
}

// Removing one entry.
{
  const entries = recordLocations([], ["/a", "/b"], 1);
  assert.deepEqual(paths(removeLocation(entries, "/a/")), ["/b"]);
  assert.deepEqual(removeLocation(entries, "/nope"), entries);
}

// The folders an add actually used.
assert.deepEqual(
  usedLocationPaths({ download_location: "/dl/", move_completed: false, move_completed_path: "/done" }),
  ["/dl"]
);
assert.deepEqual(
  usedLocationPaths({ download_location: "/dl", move_completed: true, move_completed_path: "/done" }),
  ["/dl", "/done"]
);
assert.deepEqual(usedLocationPaths({ download_location: "", move_completed: true, move_completed_path: " " }), []);

// Ranking: recent first, capped, with the most-used folders kept.
{
  const entries: LocationEntry[] = [];
  for (let i = 0; i < 12; i += 1) entries.push({ path: `/one-off-${i}`, count: 1, lastUsed: 1000 + i });
  entries.push({ path: "/favourite", count: 9, lastUsed: 10 });
  entries.push({ path: "/regular", count: 4, lastUsed: 20 });
  entries.push({ path: "/used-twice", count: 2, lastUsed: 30 });
  entries.push({ path: "/used-twice-older", count: 2, lastUsed: 5 });

  const shown = rankLocations(entries);
  assert.equal(shown.length, LOCATION_HISTORY_SHOWN_LIMIT);
  assert.equal(shown[0]?.path, "/one-off-11", "most recent first");
  for (const keep of ["/favourite", "/regular", "/used-twice"]) {
    assert.ok(paths(shown).includes(keep), `${keep} is kept although it is old`);
  }
  assert.ok(!paths(shown).includes("/used-twice-older"), "only the top frequent folders hold a place");
  assert.equal(
    paths(shown).filter((path) => path.startsWith("/one-off-")).length,
    LOCATION_HISTORY_SHOWN_LIMIT - LOCATION_HISTORY_FREQUENT_SLOTS
  );
  for (let i = 1; i < shown.length; i += 1) {
    assert.ok(shown[i - 1]!.lastUsed >= shown[i]!.lastUsed, "sorted by last use");
  }

  // Under the cap nothing is dropped, and one-off folders get no special place.
  assert.deepEqual(paths(rankLocations(entries.slice(0, 3))), ["/one-off-2", "/one-off-1", "/one-off-0"]);
  const onlyOneOffs = rankLocations(entries.slice(0, 12), { limit: 4 });
  assert.deepEqual(paths(onlyOneOffs), ["/one-off-11", "/one-off-10", "/one-off-9", "/one-off-8"]);
  assert.deepEqual(rankLocations(entries, { limit: 0 }), []);
  assert.deepEqual(paths(rankLocations(entries, { limit: 2 })), ["/regular", "/favourite"]);
}

// Storage cap: a flood of new folders cannot evict the favourites.
{
  let entries: LocationEntry[] = [];
  for (let i = 0; i < 3; i += 1) entries = recordLocation(entries, "/favourite", i);
  for (let i = 0; i < 60; i += 1) entries = recordLocation(entries, `/tmp/job-${i}`, 100 + i);
  assert.equal(entries.length, LOCATION_HISTORY_STORED_LIMIT);
  assert.ok(paths(entries).includes("/favourite"));
  assert.equal(entries[0]?.path, "/tmp/job-59");
  assert.ok(!paths(entries).includes("/tmp/job-0"));
}

// Parsing whatever is in localStorage.
assert.deepEqual(parseLocationHistory(null), {});
assert.deepEqual(parseLocationHistory(""), {});
assert.deepEqual(parseLocationHistory("not json"), {});
assert.deepEqual(parseLocationHistory("[1,2]"), {});
assert.deepEqual(parseLocationHistory('"x"'), {});
{
  const parsed = parseLocationHistory(
    JSON.stringify({
      "deluge|http://nas:8112": [
        { path: "/a/", count: 2, lastUsed: 5 },
        { path: "/a", count: 1, lastUsed: 9 },
        { path: "/b", count: "many", lastUsed: "soon" },
        { path: "", count: 1, lastUsed: 1 },
        { path: 7 },
        null,
        "junk",
      ],
      "deluge|empty": [],
      "deluge|bad": "nope",
    })
  );
  assert.deepEqual(parsed, {
    "deluge|http://nas:8112": [
      { path: "/a", count: 3, lastUsed: 9 },
      { path: "/b", count: 1, lastUsed: 0 },
    ],
  });
}

// One daemon's folders never leak into another's.
{
  let store = withScopeLocations({}, "deluge|a", recordLocations([], ["/a"], 1));
  store = withScopeLocations(store, "deluge|b", recordLocations([], ["/b"], 2));
  assert.deepEqual(paths(store["deluge|a"]!), ["/a"]);
  assert.deepEqual(paths(store["deluge|b"]!), ["/b"]);
  assert.deepEqual(Object.keys(withScopeLocations(store, "deluge|a", [])), ["deluge|b"], "empty scope is dropped");
  assert.deepEqual(parseLocationHistory(JSON.stringify(store)), store, "round-trips through JSON");

  // Old daemons are pruned; the one being written always survives.
  let many: LocationHistoryStore = {};
  for (let i = 0; i < LOCATION_HISTORY_SCOPE_LIMIT + 3; i += 1) {
    many = withScopeLocations(many, `deluge|host-${i}`, recordLocations([], ["/x"], 100 + i));
  }
  assert.equal(Object.keys(many).length, LOCATION_HISTORY_SCOPE_LIMIT);
  assert.ok(!("deluge|host-0" in many));
  assert.ok(`deluge|host-${LOCATION_HISTORY_SCOPE_LIMIT + 2}` in many);
  const revived = withScopeLocations(many, "deluge|ancient", recordLocations([], ["/old"], 1));
  assert.ok("deluge|ancient" in revived, "the scope being written is kept even when it is the oldest");
  assert.equal(Object.keys(revived).length, LOCATION_HISTORY_SCOPE_LIMIT);
}

// Wiring: stored under the legacy `nova:` prefix, recorded only on success, UI stays thin.
{
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (path: string) => readFileSync(join(here, path), "utf8");
  const store = read("deluge/location-history-store.ts");
  const hook = read("../hooks/use-location-history.ts");
  const input = read("../components/app/location-input.tsx");
  const add = read("../components/app/add-torrent-dialog.tsx");
  const dialogs = read("../components/app/torrent-dialogs.tsx");
  const options = read("../components/app/torrent-options-form.tsx");

  assert.equal(storageKey("location-history"), "nova:location-history");
  assert.match(store, /LOCATION_HISTORY_STORAGE_KEY = storageKey\("location-history"\)/);
  assert.match(store, /from "@\/lib\/storage"/);
  assert.doesNotMatch(store, /localStorage\./, "goes through src/lib/storage.ts");
  assert.match(store, /locationHistoryScope\(kind, url\)/);
  assert.match(store, /getStoredTransmissionUrl\(\)/);
  assert.match(store, /getStoredQbittorrentUrl\(\)/);
  assert.match(store, /getStoredWebUrl\(\)/);

  assert.match(hook, /rankLocations\(entries\)/);
  for (const source of [input, hook]) {
    assert.doesNotMatch(source, /lastUsed|\.sort\(/, "ranking stays in the pure module");
  }

  // The field is still a plain text input; the picker only fills it in.
  assert.match(input, /onChange=\{\(event\) => onValueChange\(event\.target\.value\)\}/);
  assert.match(input, /aria-label="Recent locations"/);
  assert.match(input, /aria-label=\{`Forget \$\{path\}`\}/);
  assert.match(input, /onForget\(path\)/);
  assert.match(input, /const hasHistory = locations\.length > 0 && !disabled;/);

  // Add: both path fields, recorded after the add went through.
  assert.match(add, /const locationHistory = useLocationHistory\(open\);/);
  assert.equal(add.match(/<LocationInput\b/g)?.length, 2);
  assert.match(add, /<LocationInput\s+inputRef=\{locationInputRef\}\s+id="add-download-location"/);
  assert.match(add, /<LocationInput\s+id="add-move-completed"/);
  const submit = add.slice(add.indexOf("async function submit()"), add.indexOf("return (", add.indexOf("async function submit()")));
  assert.equal(submit.match(/locationHistory\.remember\(/g)?.length, 2);
  assert.ok(
    submit.indexOf("locationHistory.remember(") > submit.indexOf('rpc("core.add_torrent_magnet"'),
    "recorded only after the add calls"
  );
  assert.match(submit, /\.filter\(\(item\) => succeededIds\.has\(item\.id\)\)\s*\.flatMap\(\(item\) => usedLocationPaths\(item\.options\)\)/);

  // Move: recorded after core.move_storage resolved.
  const move = dialogs.slice(dialogs.indexOf("export function MoveTorrentDialog"));
  assert.match(move, /const locationHistory = useLocationHistory\(open\);/);
  assert.match(move, /await rpc\("core\.move_storage", \[ids, path\]\);\s*locationHistory\.remember\(\[path\]\);/);
  assert.match(move, /<LocationInput\s+id="move-storage-path"\s+value=\{path\}\s+onValueChange=\{setPath\}/);

  // Options: the move-completed folder, when it is on.
  assert.match(options, /if \(deluge && move\) locationHistory\.remember\(\[movePath\]\);/);
  assert.match(options, /<LocationInput\s+id=\{`\$\{uid\}-move-path`\}/);
}

console.log("location-history tests passed");
