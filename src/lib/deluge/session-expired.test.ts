import assert from "node:assert/strict";
import { isSessionExpiredMessage } from "./session-expired";

assert.equal(isSessionExpiredMessage("Not authenticated"), true);
assert.equal(isSessionExpiredMessage("  not authenticated  "), true);
assert.equal(isSessionExpiredMessage("Daemon disconnected"), false);
assert.equal(isSessionExpiredMessage("Incorrect password."), false);
assert.equal(isSessionExpiredMessage("Cannot reach Deluge Web. Check the URL and that deluge-web is running."), false);

console.log("session-expired tests passed");
