import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createUpdates, newer, versionOf } from "../src/updates.js";
import { createLogger } from "../src/logger.js";

test("compares versions number by number", () => {
  assert.equal(newer("1.10.0", "1.9.3"), true);
  assert.equal(newer("1.1.0", "1.1.0"), false);
  assert.equal(newer("1.0.9", "1.1.0"), false);
  assert.equal(newer("2.0.0", "1.99.99"), true);
});

test("reads the version of electron-builder's latest.yml", () => {
  const yml = "version: 1.2.3\nfiles:\n  - url: Spotifood-Setup.exe\n    sha512: abc\npath: Spotifood-Setup.exe\n";
  assert.equal(versionOf(yml), "1.2.3");
  assert.equal(versionOf("nope"), null);
});

function fakeMac(body, { current = "1.1.0", ok = true } = {}) {
  const opened = [];
  const changes = [];
  const u = createUpdates({
    current,
    platform: "darwin",
    packaged: true,
    autoUpdater: null,
    fetchImpl: async () => ({ ok, status: ok ? 200 : 404, text: async () => body }),
    openExternal: async (url) => opened.push(url),
    log: () => {},
    onChange: (s) => changes.push(s.status),
  });
  return { u, opened, changes };
}

test("macOS: says a newer version exists and opens its download", async () => {
  const { u, opened } = fakeMac("version: 1.2.0\n");
  const s = await u.check();
  assert.equal(s.status, "available");
  assert.equal(s.version, "1.2.0");
  assert.equal(u.apply(), true);
  assert.match(opened[0], /Spotifood-mac\.dmg$/);
});

test("macOS: up to date, or the check failed, offers nothing", async () => {
  assert.equal((await fakeMac("version: 1.1.0\n").u.check()).status, "latest");
  const failed = fakeMac("", { ok: false });
  assert.equal((await failed.u.check()).status, "error");
  assert.equal(failed.u.apply(), false);
});

test("a development run (not installed) never updates", async () => {
  const u = createUpdates({ current: "1.1.0", platform: "darwin", packaged: false, fetchImpl: () => assert.fail("no fetch"), log() {}, onChange() {} });
  assert.equal((await u.check()).status, "idle");
});

test("Windows: the downloaded update installs on demand", async () => {
  const handlers = {};
  let installed = null;
  const autoUpdater = {
    on: (e, fn) => (handlers[e] = fn),
    checkForUpdates: async () => {
      handlers["update-available"]({ version: "1.2.0" });
      handlers["update-downloaded"]({ version: "1.2.0" });
    },
    quitAndInstall: (silent, run) => (installed = { silent, run }),
  };
  const u = createUpdates({ current: "1.1.0", platform: "win32", packaged: true, autoUpdater, fetchImpl: null, log() {}, onChange() {} });
  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.disableDifferentialDownload, true);
  const s = await u.check();
  assert.equal(s.status, "ready");
  assert.equal(u.apply(), true);
  assert.deepEqual(installed, { silent: true, run: true });
});

test("the log file rotates and keeps three old files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-logs-"));
  const { log, file } = createLogger(dir);
  const big = "x".repeat(300_000);
  const orig = console.log;
  console.log = () => {};
  try {
    for (let i = 0; i < 20; i++) log(big);
  } finally {
    console.log = orig;
  }
  const names = fs.readdirSync(dir).sort();
  assert.deepEqual(names, ["spotifood.log", "spotifood.log.1", "spotifood.log.2", "spotifood.log.3"]);
  assert.ok(fs.statSync(file).size <= 1024 * 1024 + 400_000);
});
