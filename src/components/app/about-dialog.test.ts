import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const brand = readFileSync(join(dir, "brand.tsx"), "utf8");
assert.match(brand, /min-w-0 truncate font-heading/);
assert.match(brand, /wordmarkClassName/);
assert.match(brand, /\/logo\.svg/);
assert.match(brand, />\s*torro\s*</);
assert.doesNotMatch(brand, /from "lucide-react"/);
assert.doesNotMatch(brand, /<button/);
assert.doesNotMatch(brand, /onClick/);
assert.doesNotMatch(brand, /About Nova/);

const shell = readFileSync(join(dir, "torrent-shell.tsx"), "utf8");
assert.match(shell, /AboutDialog/);
assert.match(shell, /setAboutOpen\(true\)/);
assert.match(shell, /<Info \/> About torro/);
assert.doesNotMatch(shell, /About Nova/);
assert.doesNotMatch(shell, /About torro…/);
const aboutItem = shell.indexOf("<Info /> About torro");
const prefsItem = shell.indexOf("<Settings /> Preferences…");
assert.ok(aboutItem > 0 && aboutItem < prefsItem, "About torro is the first hamburger item");
assert.match(shell.slice(aboutItem, prefsItem), /<DropdownMenuSeparator \/>/);
assert.match(
  shell,
  /<Brand\s+className="min-w-0 shrink"\s+markClassName="size-6"\s+wordmarkClassName="hidden sm:inline"\s*\/>/
);
assert.match(shell, /core\.get_enabled_plugins/);

const dialog = readFileSync(join(dir, "about-dialog.tsx"), "utf8");
assert.match(dialog, /This UI/);
assert.match(dialog, /ABOUT_TAGLINE/);
assert.match(dialog, /core\.get_version|ABOUT_RPC|loadAboutInfo/);
assert.match(dialog, /GPL-3.0|ABOUT_LICENSE/);
assert.match(dialog, /Deluge project|ABOUT_PROJECT_LABEL/);
assert.match(dialog, /ABOUT_TRANSMISSION_LABEL|Transmission project/);
assert.match(dialog, /DialogFooter/);
assert.match(dialog, /showCloseButton/);
assert.doesNotMatch(dialog, /lorem/i);

console.log("about-dialog tests passed");
