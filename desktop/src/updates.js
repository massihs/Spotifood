/**
 * Keeps the PC on the latest version, from the GitHub releases (the same files as the download page).
 * As soon as a version is published, every PC connected to internet finds it (hourly, at start, and
 * when internet comes back) and proposes it: `state.prompt` is true until someone answers.
 * - Windows: downloaded in the background first, then "Restart and install" (or it installs itself
 *   the next time the app quits).
 * - macOS: the app is not signed with an Apple certificate, so it cannot replace itself: it proposes
 *   the download of the new version.
 * "Later" asks again a few hours later, never in the middle of a rush.
 */
export const RELEASES = "https://github.com/massihs/Spotifood/releases/latest/download";
const CHECK_EVERY = 60 * 60_000;
/** "Later": the question comes back after this. */
export const SNOOZE = 4 * 60 * 60_000;

/** "1.10.0" > "1.9.3" */
export function newer(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/** The version line of electron-builder's latest.yml. */
export const versionOf = (yml) => /^version:\s*["']?([0-9]+\.[0-9]+\.[0-9]+)/m.exec(String(yml))?.[1] ?? null;

export function createUpdates({
  current,
  platform,
  packaged,
  fetchImpl,
  autoUpdater,
  openExternal,
  log,
  onChange,
  now = () => Date.now(),
}) {
  /** idle | checking | downloading | ready | available (macOS) | latest | error */
  let state = { status: "idle", version: null, progress: null, checkedAt: null, prompt: false };
  let timer = null;
  /** The version someone answered "Later" to, and until when. */
  let snoozed = { version: null, until: 0 };
  const offered = (s) => ["ready", "available"].includes(s.status) && !!s.version;
  const set = (patch) => {
    const next = { ...state, ...patch };
    next.prompt = offered(next) && !(snoozed.version === next.version && now() < snoozed.until);
    state = next;
    onChange(state);
  };

  if (autoUpdater && platform === "win32") {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // The installer keeps the same file name from one version to the next: always a full download.
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.logger = { info: (m) => log(`update: ${m}`), warn: (m) => log(`update: ${m}`), error: (m) => log(`update error: ${m}`), debug() {} };
    autoUpdater.on("checking-for-update", () => set({ status: "checking" }));
    autoUpdater.on("update-not-available", () => set({ status: "latest", checkedAt: Date.now() }));
    autoUpdater.on("update-available", (i) => set({ status: "downloading", version: i.version, progress: 0 }));
    autoUpdater.on("download-progress", (p) => set({ status: "downloading", progress: Math.round(p.percent) }));
    autoUpdater.on("update-downloaded", (i) => set({ status: "ready", version: i.version, progress: 100, checkedAt: Date.now() }));
    autoUpdater.on("error", (e) => {
      log(`update error: ${e?.message ?? e}`);
      set({ status: state.status === "ready" ? "ready" : "error", checkedAt: Date.now() });
    });
  }

  async function check() {
    // `npm start`, or a Linux test run: nothing to update.
    if (!packaged || !["win32", "darwin"].includes(platform)) return state;
    if (state.status === "downloading") return state;
    // Already downloaded: only bring the question back once "Later" has expired.
    if (state.status === "ready") return (set({}), state);
    try {
      if (autoUpdater && platform === "win32") {
        await autoUpdater.checkForUpdates();
        return state;
      }
      set({ status: "checking" });
      const res = await fetchImpl(`${RELEASES}/latest.yml`, { cache: "no-store" });
      if (!res.ok) throw new Error(`latest.yml ${res.status}`);
      const v = versionOf(await res.text());
      set(v && newer(v, current) ? { status: "available", version: v, checkedAt: Date.now() } : { status: "latest", checkedAt: Date.now() });
    } catch (e) {
      log(`update check: ${e.message}`);
      set({ status: "error", checkedAt: Date.now() });
    }
    return state;
  }

  /** "Restart now" on Windows, the download page on macOS. */
  function apply() {
    if (state.status === "ready" && autoUpdater) {
      log(`update: installing ${state.version}`);
      autoUpdater.quitAndInstall(true, true);
      return true;
    }
    if (state.status === "available") {
      void openExternal(`${RELEASES}/Spotifood-mac.dmg`);
      return true;
    }
    return false;
  }

  /** "Later": no question for a few hours (Windows still installs it when the app quits). */
  function later() {
    snoozed = { version: state.version, until: now() + SNOOZE };
    set({});
  }

  let soon = null;
  return {
    get state() {
      return state;
    },
    check,
    apply,
    later,
    /** Screenshots of the update banner (smoke runs only). */
    preview(version) {
      set({ status: platform === "darwin" ? "available" : "ready", version, progress: 100 });
    },
    /** Internet is back: look for a version published meanwhile (once, a little later). */
    checkSoon(delay = 30_000) {
      clearTimeout(soon);
      soon = setTimeout(() => void check(), delay);
    },
    start() {
      // A minute after start: never slow down opening the till.
      setTimeout(() => void check(), 60_000);
      timer = setInterval(() => void check(), CHECK_EVERY);
    },
    stop() {
      clearInterval(timer);
      clearTimeout(soon);
    },
  };
}
