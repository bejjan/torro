import assert from "node:assert/strict";
import {
  TORRENT_CONNECTION_LIMIT_PRESETS,
  TORRENT_SPEED_LIMIT_PRESETS_KIB,
  TORRENT_UPLOAD_SLOT_LIMIT_PRESETS,
  torrentAutoManagedLabel,
  torrentAutoManagedRadioValue,
  torrentLimitCustomMarks,
  torrentLimitMenuCaps,
  torrentLimitRadioValue,
  torrentNumericLimitIsDefault,
  type TorrentMenuLimits,
} from "./torrent-limit-menu";

assert.deepEqual([...TORRENT_SPEED_LIMIT_PRESETS_KIB], [5, 10, 30, 80, 300]);
assert.deepEqual([...TORRENT_CONNECTION_LIMIT_PRESETS], [50, 100, 200, 300, 500]);
assert.deepEqual([...TORRENT_UPLOAD_SLOT_LIMIT_PRESETS], [0, 1, 2, 3, 5]);

assert.deepEqual(torrentLimitMenuCaps("deluge"), {
  downloadSpeed: true,
  uploadSpeed: true,
  connections: true,
  uploadSlots: true,
  autoManaged: true,
});
assert.deepEqual(torrentLimitMenuCaps("qbittorrent"), {
  downloadSpeed: true,
  uploadSpeed: true,
  connections: false,
  uploadSlots: false,
  autoManaged: true,
});
assert.deepEqual(torrentLimitMenuCaps("transmission"), {
  downloadSpeed: true,
  uploadSpeed: true,
  connections: false,
  uploadSlots: false,
  autoManaged: true,
});

assert.equal(torrentAutoManagedLabel("deluge"), "Auto Managed");
assert.equal(torrentAutoManagedLabel("qbittorrent"), "Automatic Torrent Management");
assert.equal(torrentAutoManagedLabel("transmission"), "Honor session limits");

assert.equal(torrentLimitRadioValue(-1, TORRENT_SPEED_LIMIT_PRESETS_KIB), "-1");
assert.equal(torrentLimitRadioValue(Number.NaN, TORRENT_SPEED_LIMIT_PRESETS_KIB), "-1");
assert.equal(torrentLimitRadioValue(5, TORRENT_SPEED_LIMIT_PRESETS_KIB), "5");
assert.equal(torrentLimitRadioValue(12, TORRENT_SPEED_LIMIT_PRESETS_KIB), "");
assert.equal(torrentLimitRadioValue(0, TORRENT_UPLOAD_SLOT_LIMIT_PRESETS), "0");

assert.equal(torrentAutoManagedRadioValue(true), "on");
assert.equal(torrentAutoManagedRadioValue(false), "off");

assert.equal(torrentNumericLimitIsDefault(-1), true);
assert.equal(torrentNumericLimitIsDefault(Number.NaN), true);
assert.equal(torrentNumericLimitIsDefault(undefined), true);
assert.equal(torrentNumericLimitIsDefault(null), true);
assert.equal(torrentNumericLimitIsDefault(0), false);
assert.equal(torrentNumericLimitIsDefault(5), false);

const unlimited: TorrentMenuLimits = {
  max_download_speed: -1,
  max_upload_speed: -1,
  max_connections: -1,
  max_upload_slots: -1,
};
const delugeCaps = torrentLimitMenuCaps("deluge");
const qbCaps = torrentLimitMenuCaps("qbittorrent");

assert.deepEqual(torrentLimitCustomMarks([unlimited], delugeCaps), {
  downloadSpeed: false,
  uploadSpeed: false,
  connections: false,
  uploadSlots: false,
  any: false,
});
assert.deepEqual(
  torrentLimitCustomMarks(
    [{ ...unlimited, max_download_speed: 30, max_upload_slots: 0 }],
    delugeCaps
  ),
  {
    downloadSpeed: true,
    uploadSpeed: false,
    connections: false,
    uploadSlots: true,
    any: true,
  }
);
assert.deepEqual(
  torrentLimitCustomMarks(
    [unlimited, { ...unlimited, max_upload_speed: 10 }],
    delugeCaps
  ),
  {
    downloadSpeed: false,
    uploadSpeed: true,
    connections: false,
    uploadSlots: false,
    any: true,
  }
);
assert.deepEqual(
  torrentLimitCustomMarks(
    [{ ...unlimited, max_connections: 50, max_upload_slots: 2 }],
    qbCaps
  ),
  {
    downloadSpeed: false,
    uploadSpeed: false,
    connections: false,
    uploadSlots: false,
    any: false,
  }
);
assert.deepEqual(torrentLimitCustomMarks([], delugeCaps).any, false);

console.log("torrent-limit-menu tests passed");
