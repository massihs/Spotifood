/**
 * Keeps the PC on the latest version, from the GitHub releases (the same files as the download page).
 * - Windows: downloaded in the background, installed on the next restart (or "Restart now").
 * - macOS: the app is not signed with an Apple certificate, so it cannot replace itself: it says a new
 *   version exists and opens the download.
 */
export const RELEASES = "https://github.com/massihs/Spotifood/releases/latest/download";
const CHECK_EVERY = 6 * 60 * 60_000;

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

export function createUpdates({ current, platform, packaged, fetchImpl, autoUpdater, openExternal, log, onChange }) {
  /** idle | checking | downloading | ready | available (macOS) | latest | error */
  let state = { status: "idle", version: null, progress: null, checkedAt: null };
  let timer = null;
  const set = (patch) => {
    state = { ...state, ...patch };
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
    if (state.status === "ready" || state.status === "downloading") return state;
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

  return {
    get state() {
      return state;
    },
    check,
    apply,
    start() {
      // A few minutes after start: never slow down opening the till.
      setTimeout(() => void check(), 3 * 60_000);
      timer = setInterval(() => void check(), CHECK_EVERY);
    },
    stop() {
      clearInterval(timer);
    },
  };
}
