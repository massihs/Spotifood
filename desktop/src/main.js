import {
  app,
  BaseWindow,
  BrowserWindow,
  WebContentsView,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net as enet,
  Notification,
  powerSaveBlocker,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import updaterPkg from "electron-updater";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHub, HUB_PORT, lanAddresses } from "./hub.js";
import { isVirtualPrinter } from "./escpos.js";
import { deliver, systemPrinters } from "./printer.js";
import { createStore } from "./store.js";
import { createSync } from "./sync.js";
import { createLogger } from "./logger.js";
import { createUpdates } from "./updates.js";
import { cleanTerminal, createTerminal } from "./terminal.js";
import { translator } from "../offline/i18n.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const DEFAULT_SERVER = process.env.SPOTIFOOD_URL ?? "https://spotifood.ir";
const BAR_H = 44;
const UUID = /\/dashboard\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

// A separate data folder (tests, or two restaurants on one PC).
if (process.env.SPOTIFOOD_DATA) app.setPath("userData", process.env.SPOTIFOOD_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
// Windows shows the website's notifications (new order, call…) only for an app with an id.
if (process.platform === "win32") app.setAppUserModelId("ir.spotifood.desktop");
// The new-order bell must ring even if nobody clicked the till since it opened.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const store = createStore(path.join(app.getPath("userData"), "data"));
/** How this PC shows Spotifood (kitchen TV in full screen, a till on the orders…). */
const PC_DEFAULTS = { startScreen: "last", fullscreen: false, keepAwake: false, zoom: 1, customerDisplay: false };
let config = { serverUrl: DEFAULT_SERVER, localPrinters: [], ...store.read("config", {}) };
config.pc = { ...PC_DEFAULTS, ...config.pc };
// Older versions could pick OneNote / "Print to PDF" as the ticket printer: drop them.
config.localPrinters = (config.localPrinters ?? []).filter((p) => !isVirtualPrinter(p.system));
store.write("config", config);
const saveConfig = (patch) => {
  config = { ...config, ...patch };
  store.write("config", config);
  pushState();
};
const { log, dir: logsDir } = createLogger(path.join(app.getPath("userData"), "logs"));
const terminal = createTerminal({ getConfig: () => config.terminal ?? {}, log });
process.on("uncaughtException", (e) => log("uncaught", e));
process.on("unhandledRejection", (e) => log("unhandled", e));
const tr = () => translator(hub.snapshot?.restaurant.defaultLocale ?? config.locale ?? "fa");

let win = null;
let bar = null;
let content = null;
let hubPort = HUB_PORT;
/** "site" (the website) | "local" (offline screens) | "setup" | "settings" */
let mode = "setup";
let toast = null;
let tray = null;
/** Closing the window only hides it: the hub and the printing must keep running. */
let quitting = false;
let awakeId = null;

const hub = createHub({
  store,
  staticDir: path.join(root, "offline"),
  appDir: path.join(root, "setup"),
  deliver: (printer, ticket) =>
    deliver(printer, ticket, { rtl: ["fa", "ar"].includes(hub.snapshot?.restaurant.defaultLocale ?? "fa") }),
  localPrinters: () => config.localPrinters ?? [],
  log,
});

const sync = createSync({
  hub,
  version: app.getVersion(),
  getConfig: () => config,
  log,
  fetchImpl: (url, init) => enet.fetch(url, init),
  onChange(e) {
    if (e.online === false && mode === "site") showLocal(localFor(content?.webContents.getURL()));
    if (e.synced) flash("synced", { n: e.synced });
    if (e.online === true) flash("online");
    if (e.revoked) {
      saveConfig({ deviceToken: null, deviceId: null });
      flash("revoked");
    }
    pushState();
  },
});

const updates = createUpdates({
  current: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
  fetchImpl: (url, init) => enet.fetch(url, init),
  autoUpdater: process.platform === "win32" ? updaterPkg.autoUpdater : null,
  openExternal: (url) => shell.openExternal(url),
  log,
  onChange: () => {
    pushState();
    refreshTray();
  },
});

// ─── Views ───────────────────────────────────────────────────────────────────

/** `screen` is a hash route ("#/kitchen"); the key logs this PC in once (cookie). */
const localUrl = (screen = "") => `http://127.0.0.1:${hubPort}/?k=${hub.ownKey}${screen}`;
const siteUrl = () => `${config.serverUrl.replace(/\/+$/, "")}/dashboard/${config.restaurantId ?? ""}`;

function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  bar.setBounds({ x: 0, y: 0, width, height: BAR_H });
  content.setBounds({ x: 0, y: BAR_H, width, height: Math.max(0, height - BAR_H) });
}

const START_PATHS = { home: "", pos: "/pos", orders: "/orders", kitchen: "/kitchen", waiter: "/waiter" };
/** `start`: the app just opened, so the PC's chosen screen wins over the last page. */
function showSite({ start = false } = {}) {
  mode = "site";
  const chosen = start ? START_PATHS[config.pc.startScreen] : undefined;
  const last = config.lastUrl?.startsWith(config.serverUrl) ? config.lastUrl : null;
  void content.webContents.loadURL(chosen !== undefined ? `${siteUrl()}${chosen}` : (last ?? siteUrl()));
  pushState();
}
/** The local screen closest to the website page in use (the kitchen stays the kitchen). */
function localFor(url = "") {
  if (/\/kitchen\b/.test(url) || config.pc.startScreen === "kitchen") return "#/kitchen";
  if (/\/orders\b/.test(url)) return "#/orders";
  return "";
}
function showLocal(screen = "") {
  mode = "local";
  void content.webContents.loadURL(localUrl(screen));
  pushState();
}
/** First run: straight to the website's sign-in page (the address is rarely changed). */
function showSetup() {
  mode = "setup";
  void content.webContents.loadURL(`${config.serverUrl.replace(/\/+$/, "")}/login`);
  pushState();
}
/** The website could not be reached: offer to check its address. */
function showServerSetup() {
  mode = "setup";
  void content.webContents.loadURL(`http://127.0.0.1:${hubPort}/_app/index.html`);
  pushState();
}
function showSettings() {
  mode = "settings";
  void content.webContents.loadURL(`http://127.0.0.1:${hubPort}/_app/settings.html`);
  pushState();
}

function flash(key, values = {}) {
  toast = { key, values, at: Date.now() };
  pushState();
}

function state() {
  return {
    mode,
    linked: !!config.deviceToken,
    serverUrl: config.serverUrl,
    restaurantName: config.restaurantName ?? null,
    deviceName: config.deviceName ?? os.hostname(),
    status: hub.status,
    pairCode: hub.pairCode,
    addresses: lanAddresses().map((a) => `http://${a}:${hubPort}`),
    localPrinters: config.localPrinters ?? [],
    stations: hub.snapshot?.stations ?? [],
    locale: hub.snapshot?.restaurant.defaultLocale ?? config.locale ?? "fa",
    version: app.getVersion(),
    toast,
    pc: config.pc,
    terminal: cleanTerminal(config.terminal ?? {}),
    autoStart: autoStartOn(),
    update: updates.state,
    platform: process.platform,
  };
}
const autoStartOn = () => {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
};
function pushState() {
  for (const v of [bar, content]) if (v && !v.webContents.isDestroyed()) v.webContents.send("state", state());
  refreshTray();
}

/** After the manager signs in on the website: link this PC to the restaurant. */
async function link(restaurantId) {
  const name = config.deviceName ?? os.hostname();
  const res = await session.defaultSession.fetch(`${config.serverUrl.replace(/\/+$/, "")}/api/v1/offline/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restaurantId, name: name.slice(0, 60) }),
  });
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error(`link ${res.status}`);
  const { device, restaurant } = await res.json();
  saveConfig({
    deviceToken: device.token,
    deviceId: device.id,
    deviceName: device.name,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
  });
  // A till PC: back on its own after a restart or a power cut.
  app.setLoginItemSettings({ openAtLogin: true });
  await sync.refreshSnapshot().catch((e) => log(`snapshot: ${e.message}`));
  sync.start();
  syncCustomerDisplay();
  flash("linked", { name: restaurant.name });
}

/** Last size and place of the window, if it still fits on a connected screen. */
function savedBounds() {
  const w = store.read("window", null);
  if (!w?.width || !w?.height) return { width: 1360, height: 860 };
  const area = screen.getDisplayMatching(w).workArea;
  const visible = w.x < area.x + area.width - 80 && w.x + w.width > area.x + 80 && w.y >= area.y - 10 && w.y < area.y + area.height - 80;
  return visible ? { x: w.x, y: w.y, width: w.width, height: w.height, maximized: w.maximized } : { width: w.width, height: w.height, maximized: w.maximized };
}
let saveTimer = null;
function rememberWindow() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
    store.write("window", { ...win.getNormalBounds(), maximized: win.isMaximized() });
  }, 500);
}

function applyZoom() {
  for (const v of [content]) if (v && !v.webContents.isDestroyed()) v.webContents.setZoomFactor(config.pc.zoom);
}
function zoomBy(delta) {
  const zoom = delta === 0 ? 1 : Math.round(Math.min(2, Math.max(0.6, config.pc.zoom + delta)) * 10) / 10;
  saveConfig({ pc: { ...config.pc, zoom } });
  applyZoom();
}
function setKeepAwake(on) {
  if (on && awakeId === null) awakeId = powerSaveBlocker.start("prevent-display-sleep");
  if (!on && awakeId !== null) {
    powerSaveBlocker.stop(awakeId);
    awakeId = null;
  }
}

/** Shortcuts that work even without a menu bar (Windows). */
function shortcuts(wc) {
  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const mod = process.platform === "darwin" ? input.meta : input.control;
    const key = input.key;
    let done = true;
    if (key === "F11" || (process.platform === "darwin" && input.meta && input.control && key.toLowerCase() === "f"))
      win?.setFullScreen(!win.isFullScreen());
    else if (mod && (key === "=" || key === "+")) zoomBy(0.1);
    else if (mod && key === "-") zoomBy(-0.1);
    else if (mod && key === "0") zoomBy(0);
    else if (key === "F5" || (mod && key.toLowerCase() === "r")) content.webContents.reload();
    else if (mod && key === ",") showSettings();
    else done = false;
    if (done) event.preventDefault();
  });
}

/** A crashed or frozen page reloads by itself: nobody at the till should have to restart the app. */
function selfHealing(view, name) {
  const wc = view.webContents;
  let frozen = null;
  wc.on("render-process-gone", (_e, details) => {
    log(`${name} page gone: ${details.reason}`);
    if (details.reason !== "clean-exit") setTimeout(() => !wc.isDestroyed() && wc.reload(), 1000);
  });
  wc.on("unresponsive", () => {
    log(`${name} page unresponsive`);
    frozen = setTimeout(() => {
      if (wc.isDestroyed()) return;
      log(`${name} page still frozen: reloading`);
      wc.forcefullyCrashRenderer();
      wc.reload();
    }, 15_000);
  });
  wc.on("responsive", () => clearTimeout(frozen));
}

function createWindow() {
  const bounds = savedBounds();
  win = new BaseWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 560,
    title: "Spotifood",
    backgroundColor: "#f6f7f9",
    icon: path.join(root, "build", "icon.png"),
    autoHideMenuBar: true,
    fullscreen: config.pc.fullscreen,
  });
  if (bounds.maximized && !config.pc.fullscreen) win.maximize();
  const prefs = {
    preload: path.join(here, "preload.cjs"),
    contextIsolation: true,
    sandbox: true,
  };
  bar = new WebContentsView({ webPreferences: prefs });
  // The website runs without any access to this PC; the local screens get the small bridge.
  content = new WebContentsView({ webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(content);
  win.contentView.addChildView(bar);
  layout();
  win.on("resize", () => {
    layout();
    rememberWindow();
  });
  win.on("move", rememberWindow);
  win.on("maximize", rememberWindow);
  win.on("unmaximize", rememberWindow);
  win.on("close", (e) => {
    if (quitting) return;
    // The till keeps printing and serving the phones: hide, do not quit.
    e.preventDefault();
    win.hide();
    if (!config.toldBackground) {
      saveConfig({ toldBackground: true });
      if (Notification.isSupported()) new Notification({ title: tr()("bgTitle"), body: tr()("bgBody") }).show();
    }
  });
  // Windows shutting down or the user signing out: let the window close.
  win.on("query-session-end", () => (quitting = true));
  win.on("session-end", () => (quitting = true));
  win.on("closed", () => (win = null));
  for (const [v, n] of [
    [bar, "bar"],
    [content, "content"],
  ]) {
    shortcuts(v.webContents);
    selfHealing(v, n);
  }
  content.webContents.on("did-finish-load", applyZoom);
  void bar.webContents.loadURL(`http://127.0.0.1:${hubPort}/_app/bar.html`);

  const wc = content.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(config.serverUrl) || url.startsWith(`http://127.0.0.1:${hubPort}`)) {
      void wc.loadURL(url);
    } else void shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("did-navigate", (_e, url) => onNavigate(url));
  wc.on("did-navigate-in-page", (_e, url) => onNavigate(url));
  wc.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    // The website did not answer: go on with the local screens.
    if (isMain && mode === "setup" && code !== -3 && url.startsWith(config.serverUrl)) return showServerSetup();
    if (isMain && mode === "site" && code !== -3 && url.startsWith(config.serverUrl)) {
      hub.setStatus({ online: false });
      showLocal(localFor(url));
    }
  });

  if (config.deviceToken) showSite({ start: true });
  else showSetup();
}

/**
 * The customer display: the till's second screen (facing the customer) shows the ticket and the
 * amount to pay. The site's till broadcasts it; this window only opens the page full screen there.
 */
let displayWin = null;
function syncCustomerDisplay() {
  const want = !!(config.pc.customerDisplay && config.deviceToken && config.restaurantId);
  if (!want) {
    displayWin?.destroy();
    displayWin = null;
    return;
  }
  if (displayWin) return;
  const primary = screen.getPrimaryDisplay();
  const other = screen.getAllDisplays().find((d) => d.id !== primary.id) ?? null;
  const area = (other ?? primary).bounds;
  displayWin = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: other ? area.width : 1024,
    height: other ? area.height : 700,
    fullscreen: !!other,
    autoHideMenuBar: true,
    title: "Spotifood",
    backgroundColor: "#ffffff",
    icon: path.join(root, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  void displayWin.loadURL(`${config.serverUrl.replace(/\/+$/, "")}/display/${config.restaurantId}`);
  displayWin.on("closed", () => (displayWin = null));
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Asks before stopping the till (pending offline orders, printing). */
async function confirmQuit() {
  const t = tr();
  const n = hub.pending().length;
  if (config.deviceToken) {
    showWindow();
    const { response } = await dialog.showMessageBox(win, {
      type: n ? "warning" : "question",
      buttons: [t("quitOk"), t("quitCancel")],
      defaultId: 1,
      cancelId: 1,
      message: "Spotifood",
      detail: n ? t("quitPending", { n }) : t("quitConfirm"),
    });
    if (response !== 0) return;
  }
  quitting = true;
  app.quit();
}

/** The icon next to the clock (Windows) / in the menu bar (macOS): the app lives there when hidden. */
function createTray() {
  // Sharp on every screen: a 1× and a 2× picture of the app icon.
  const src = nativeImage.createFromPath(path.join(root, "build", "icon.png"));
  const size = process.platform === "darwin" ? 18 : 16;
  const icon = nativeImage.createEmpty();
  for (const scale of [1, 2])
    icon.addRepresentation({ scaleFactor: scale, buffer: src.resize({ width: size * scale, quality: "best" }).toPNG() });
  tray = new Tray(icon);
  tray.setToolTip("Spotifood");
  tray.on("click", showWindow);
  refreshTray();
}
function refreshTray() {
  if (!tray) return;
  const t = tr();
  const u = updates.state;
  const items = [
    { label: t("trayOpen"), click: showWindow },
    ...(config.deviceToken
      ? [
          { label: t("site"), click: () => (showWindow(), showSite()) },
          { label: t("trayLocal"), click: () => (showWindow(), showLocal()) },
        ]
      : []),
    { label: t("settings"), click: () => (showWindow(), showSettings()) },
    { type: "separator" },
    ...(u.status === "ready" ? [{ label: `${t("restartUpdate")} (${u.version})`, click: () => updates.apply() }] : []),
    ...(u.status === "available" ? [{ label: `${t("downloadUpdate")} (${u.version})`, click: () => updates.apply() }] : []),
    { label: t("version", { v: app.getVersion() }), enabled: false },
    { label: t("trayQuit"), click: () => void confirmQuit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  const status = hub.status.online === false && config.deviceToken ? ` · ${t("offline")}` : "";
  tray.setToolTip(`Spotifood${config.restaurantName ? ` · ${config.restaurantName}` : ""}${status}`);
}

let asked = false;
function onNavigate(url) {
  if (mode === "site" && url.startsWith(config.serverUrl)) saveConfig({ lastUrl: url });
  const m = UUID.exec(url);
  if (!config.deviceToken && m && url.startsWith(config.serverUrl) && !asked) {
    asked = true;
    void dialog
      .showMessageBox({
        type: "question",
        buttons: ["OK", "×"],
        defaultId: 0,
        message: "Spotifood",
        detail: "Activer ce PC pour ce restaurant ? (mode hors ligne, impression locale)\nاین کامپیوتر برای این رستوران فعال شود؟",
      })
      .then(async ({ response }) => {
        if (response !== 0) return;
        try {
          await link(m[1]);
          mode = "site";
          pushState();
        } catch (e) {
          asked = false;
          flash(e.message === "forbidden" ? "forbidden" : "linkFailed");
        }
      });
  }
}

// ─── Bridge for the bar, setup and local screens ─────────────────────────────

/** Only this PC's own pages may drive the app (never the website or a phone). */
function trusted(e) {
  const url = e.senderFrame?.url ?? "";
  return url.startsWith(`http://127.0.0.1:${hubPort}/`);
}

ipcMain.handle("state", (e) => (trusted(e) ? state() : null));

/** The restaurant's site (top frame only) may use the card terminal; nothing else of this PC. */
function fromSite(e) {
  const frame = e.senderFrame;
  if (!frame || frame.parent) return false;
  try {
    return new URL(frame.url).origin === new URL(config.serverUrl).origin;
  } catch {
    return false;
  }
}
ipcMain.handle("terminal", async (e, name, arg) => {
  if (!fromSite(e) && !trusted(e)) throw new Error("forbidden");
  if (name === "info") return terminal.info();
  if (name === "cancel") return terminal.cancel();
  if (name === "pay") return terminal.pay(arg ?? {});
  throw new Error("unknown_action");
});
ipcMain.handle("action", async (e, name, arg) => {
  if (!trusted(e)) throw new Error("forbidden");
  switch (name) {
    case "site":
      return config.deviceToken ? showSite() : showSetup();
    case "local":
      return showLocal(typeof arg === "string" ? arg : "");
    case "settings":
      return showSettings();
    case "sync":
      await sync.now();
      return state();
    case "newCode":
      hub.newPairCode();
      return pushState();
    case "unpairAll":
      hub.unpairAll();
      return pushState();
    case "setServer": {
      const url = String(arg ?? "").trim().replace(/\/+$/, "");
      if (!/^https?:\/\/[^\s]+$/.test(url)) throw new Error("invalid_url");
      saveConfig({ serverUrl: url });
      return state();
    }
    case "login":
      mode = "setup";
      void content.webContents.loadURL(`${config.serverUrl.replace(/\/+$/, "")}/login`);
      return pushState();
    case "setDeviceName":
      return saveConfig({ deviceName: String(arg ?? "").slice(0, 60) || os.hostname() });
    case "systemPrinters":
      return systemPrinters(content.webContents);
    case "setLocalPrinters": {
      const list = Array.isArray(arg) ? arg : [];
      return saveConfig({
        localPrinters: list.slice(0, 6).map((p, i) => ({
          id: `local-${i}`,
          name: String(p.name ?? p.system ?? "PC").slice(0, 60),
          system: p.system ? String(p.system) : undefined,
          host: p.system ? undefined : String(p.host ?? ""),
          port: Number(p.port) || 9100,
          paperMm: Number(p.paperMm) === 58 ? 58 : 80,
          target: ["cashier", "station", "all"].includes(p.target) ? p.target : "all",
          stationId: p.stationId ?? null,
          copies: Math.min(5, Math.max(1, Number(p.copies) || 1)),
        })),
      });
    }
    case "testPrint": {
      const p = (config.localPrinters ?? [])[Number(arg)];
      if (!p) throw new Error("not_found");
      await deliver(p, {
        kind: "kitchen",
        restaurant: config.restaurantName ?? "Spotifood",
        title: "Test",
        number: "✓",
        where: p.name,
        time: new Date().toLocaleTimeString(),
        offline: "Spotifood",
        lines: [{ quantity: 1, name: "چاپ آزمایشی · Test", options: [], note: null }],
      });
      return true;
    }
    case "unlink": {
      const { response } = await dialog.showMessageBox({
        type: "warning",
        buttons: ["OK", "×"],
        defaultId: 1,
        message: "Spotifood",
        detail: hub.pending().length
          ? "Des commandes hors ligne ne sont pas encore envoyées. Délier quand même ?"
          : "Délier ce PC du restaurant ?",
      });
      if (response !== 0) return state();
      sync.stop();
      saveConfig({ deviceToken: null, deviceId: null, restaurantId: null, restaurantName: null, lastUrl: null });
      syncCustomerDisplay();
      showSetup();
      return state();
    }
    case "setPc": {
      const a = arg ?? {};
      const pc = {
        ...config.pc,
        ...(a.startScreen && ["last", ...Object.keys(START_PATHS)].includes(a.startScreen) ? { startScreen: a.startScreen } : {}),
        ...(typeof a.fullscreen === "boolean" ? { fullscreen: a.fullscreen } : {}),
        ...(typeof a.keepAwake === "boolean" ? { keepAwake: a.keepAwake } : {}),
        ...(typeof a.customerDisplay === "boolean" ? { customerDisplay: a.customerDisplay } : {}),
      };
      if (typeof a.fullscreen === "boolean" && win) win.setFullScreen(a.fullscreen);
      if (typeof a.keepAwake === "boolean") setKeepAwake(a.keepAwake);
      if (typeof a.autoStart === "boolean") app.setLoginItemSettings({ openAtLogin: a.autoStart });
      saveConfig({ pc });
      syncCustomerDisplay();
      return state();
    }
    case "setTerminal":
      saveConfig({ terminal: cleanTerminal(arg ?? {}) });
      return state();
    case "testTerminal":
      // 1 000 tomans: enough to see the amount on the terminal, cancel it there.
      return terminal.pay({ amountCents: 1_000_000, currency: "IRR", reference: "TEST" });
    case "zoom":
      zoomBy(Number(arg) || 0);
      return state();
    case "reload":
      content.webContents.reload();
      return true;
    case "openLogs":
      return shell.openPath(logsDir);
    case "checkUpdate":
      await updates.check();
      return state();
    case "applyUpdate":
      return updates.apply();
    default:
      throw new Error("unknown_action");
  }
});

// ─── App ─────────────────────────────────────────────────────────────────────

app.on("second-instance", () => showWindow());

app.whenReady().then(async () => {
  Menu.setApplicationMenu(process.platform === "darwin" ? macMenu() : null);
  // The hub must survive the screen saver: tablets and the kitchen depend on it.
  powerSaveBlocker.start("prevent-app-suspension");
  for (let port = HUB_PORT; port < HUB_PORT + 10; port++) {
    try {
      hubPort = await hub.listen(port);
      break;
    } catch (e) {
      log(`hub port ${port}: ${e.message}`);
    }
  }
  createWindow();
  syncCustomerDisplay();
  createTray();
  setKeepAwake(config.pc.keepAwake);
  if (config.deviceToken) sync.start();
  updates.start();
  log(`Spotifood ${app.getVersion()} started (${process.platform} ${process.arch})`);
  if (process.env.SPOTIFOOD_SMOKE) void smoke(process.env.SPOTIFOOD_SMOKE);
});

/** Test run: screenshots of the bar and each screen, then quit. */
async function smoke(dir) {
  const fs = await import("node:fs");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    await wait(2500);
    const [b, c] = await Promise.all([bar.webContents.capturePage(), content.webContents.capturePage()]);
    fs.writeFileSync(path.join(dir, `${name}-bar.png`), b.toPNG());
    fs.writeFileSync(path.join(dir, `${name}.png`), c.toPNG());
    log(`smoke ${name}: ${content.webContents.getURL()}`);
  };
  await shot(mode);
  if (process.env.SPOTIFOOD_SMOKE_CHECKS) {
    // Window behaviour: closing hides (the hub keeps serving), zoom and full screen apply.
    win.close();
    await wait(300);
    log(`smoke close: window ${win && !win.isDestroyed() ? (win.isVisible() ? "visible" : "hidden") : "destroyed"}, hub ${hub.status ? "up" : "down"}`);
    showWindow();
    zoomBy(0.2);
    await wait(300);
    log(`smoke zoom: ${content.webContents.getZoomFactor().toFixed(1)} saved ${store.read("config", {}).pc?.zoom}`);
    zoomBy(0);
    win.setFullScreen(true);
    await wait(800);
    log(`smoke fullscreen: ${win.isFullScreen()}`);
    win.setFullScreen(false);
    await wait(800);
    log(`smoke tray: ${tray ? "yes" : "no"}, update ${updates.state.status}`);
  }
  if (process.env.SPOTIFOOD_SMOKE_ORDER && hub.snapshot) {
    // A real order through the hub: kitchen tickets and the paid receipt go to the printers.
    const dishes = hub.snapshot.products.filter((p) => p.isAvailable && !p.optionGroups.some((g) => g.minSelect > 0));
    hub._createOrder({
      channel: "dine_in",
      tableId: hub.snapshot.tables[0]?.id,
      note: "تست چاپ آفلاین",
      lines: [
        { productId: dishes[0].id, quantity: 2, note: "بدون پیاز" },
        { productId: dishes[1].id, quantity: 1 },
      ],
      payment: { provider: "cash", tenderedCents: null },
    });
    await wait(6000);
  }
  for (const screen of (process.env.SPOTIFOOD_SMOKE_SCREENS ?? "").split(",").filter(Boolean)) {
    if (screen === "settings") showSettings();
    else showLocal(`#/${screen}`);
    await shot(screen);
  }
  app.quit();
}

/** macOS menu bar: the usual menus, plus Settings (⌘,) and the update check. */
function macMenu() {
  const t = tr();
  return Menu.buildFromTemplate([
    {
      label: "Spotifood",
      submenu: [
        { role: "about" },
        { label: t("checkUpdates"), click: () => void updates.check().then(() => updates.apply()) },
        { type: "separator" },
        { label: `${t("settings")}…`, accelerator: "Cmd+,", click: () => (showWindow(), showSettings()) },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: t("trayQuit"), accelerator: "Cmd+Q", click: () => void confirmQuit() },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: t("reload"), accelerator: "Cmd+R", click: () => content?.webContents.reload() },
        { type: "separator" },
        { label: "+", accelerator: "Cmd+=", click: () => zoomBy(0.1) },
        { label: "−", accelerator: "Cmd+-", click: () => zoomBy(-0.1) },
        { label: "100 %", accelerator: "Cmd+0", click: () => zoomBy(0) },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]);
}

app.on("window-all-closed", () => {
  // The window only hides; if it is really gone, the hub and the tray keep running.
});
app.on("activate", () => app.isReady() && showWindow());
app.on("before-quit", () => {
  // Quitting from the dock, the system or an update install (not only from our menus).
  quitting = true;
  sync.stop();
  updates.stop();
  void hub.close();
});
