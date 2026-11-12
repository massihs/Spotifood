import { isRtl, translator } from "/i18n.js";

const $ = (id) => document.getElementById(id);
const api = window.spotifood;
let s = await api.state();
const t = translator(s.locale);
document.documentElement.dir = isRtl(s.locale) ? "rtl" : "ltr";
let printers = structuredClone(s.localPrinters);
let systemList = [];
try {
  systemList = await api.action("systemPrinters");
} catch {
  /* none */
}

for (const [id, key] of Object.entries({
  title: "settings",
  back: "back",
  serverTitle: "server",
  serverSave: "save",
  pcTitle: "pcName",
  pcSave: "save",
  phonesTitle: "phonesTitle",
  phonesBody: "phonesBody",
  newCode: "newCode",
  unpairAll: "unpairAll",
  printersTitle: "printersTitle",
  printersBody: "printersBody",
  addSystem: "systemPrinter",
  addNetwork: "networkPrinter",
  savePrinters: "save",
  syncTitle: "syncTitle",
  syncNow: "syncNow",
  unlink: "unlink",
  screenTitle: "pcScreen",
  startLabel: "startScreen",
  fullscreenLabel: "fullscreenStart",
  keepAwakeLabel: "keepAwake",
  customerDisplayLabel: "customerDisplay",
  autoStartLabel: "autoStart",
  textSizeLabel: "textSize",
  shortcuts: "shortcuts",
  updatesTitle: "updatesTitle",
  checkUpdate: "checkUpdates",
  logsTitle: "logsTitle",
  openLogs: "openLogs",
  terminalTitle: "terminalTitle",
  terminalBody: "terminalBody",
  terminalDriverLabel: "terminalDriver",
  terminalTimeoutLabel: "terminalTimeout",
  terminalAdvanced: "terminalAdvanced",
  terminalAdvancedBody: "terminalAdvancedBody",
  terminalTemplateLabel: "terminalTemplate",
  terminalTerminatorLabel: "terminalTerminator",
  terminalApprovedLabel: "terminalApproved",
  terminalDeclinedLabel: "terminalDeclined",
  terminalRrnLabel: "terminalRrn",
  testTerminal: "terminalTest",
  saveTerminal: "save",
})) $(id).textContent = t(key);

// Card terminal: the till sends the amount, the terminal shows it to the customer.
const DRIVERS = { none: "terminalNone", tcp: "terminalTcp", simulator: "terminalSimulator" };
$("terminalDriver").innerHTML = Object.entries(DRIVERS)
  .map(([v, k]) => `<option value="${v}">${t(k)}</option>`)
  .join("");
const TERMINAL_FIELDS = {
  terminalDriver: "driver",
  terminalHost: "host",
  terminalPort: "port",
  terminalTimeout: "timeoutSec",
  terminalTemplate: "template",
  terminalTerminator: "terminator",
  terminalApproved: "approved",
  terminalDeclined: "declined",
  terminalRrn: "rrn",
};
function renderTerminal() {
  for (const [id, k] of Object.entries(TERMINAL_FIELDS)) $(id).value = s.terminal[k] ?? "";
  const tcp = s.terminal.driver === "tcp";
  for (const el of document.querySelectorAll(".tcp")) el.classList.toggle("hidden", !tcp);
}
const readTerminal = () =>
  Object.fromEntries(Object.entries(TERMINAL_FIELDS).map(([id, k]) => [k, $(id).value]));
$("terminalDriver").onchange = () => {
  s.terminal = { ...s.terminal, driver: $("terminalDriver").value };
  renderTerminal();
};
$("saveTerminal").onclick = async () => {
  s = await api.action("setTerminal", readTerminal());
  renderTerminal();
  $("terminalMsg").textContent = "✓";
};
$("testTerminal").onclick = async () => {
  s = await api.action("setTerminal", readTerminal());
  $("terminalMsg").textContent = t("terminalWaiting");
  const r = await api.action("testTerminal");
  $("terminalMsg").textContent = r.status === "approved" ? `✓ ${r.rrn ?? ""}` : `✗ ${r.status} ${r.message ?? ""}`;
};

// How this PC shows Spotifood: the kitchen TV in full screen on the kitchen, the till on its orders…
const START = { last: "startLast", home: "startHome", pos: "startPos", orders: "startOrders", kitchen: "startKitchen", waiter: "startWaiter" };
$("startScreen").innerHTML = Object.entries(START)
  .map(([v, k]) => `<option value="${v}">${t(k)}</option>`)
  .join("");
$("startScreen").onchange = (e) => api.action("setPc", { startScreen: e.target.value });
$("fullscreen").onchange = (e) => api.action("setPc", { fullscreen: e.target.checked });
$("keepAwake").onchange = (e) => api.action("setPc", { keepAwake: e.target.checked });
$("customerDisplay").onchange = (e) => api.action("setPc", { customerDisplay: e.target.checked });
$("autoStart").onchange = (e) => api.action("setPc", { autoStart: e.target.checked });
$("zoomIn").onclick = () => api.action("zoom", 0.1);
$("zoomOut").onclick = () => api.action("zoom", -0.1);
$("zoomReset").onclick = () => api.action("zoom", 0);
$("checkUpdate").onclick = async () => {
  $("updateInfo").textContent = t("updateChecking");
  s = await api.action("checkUpdate");
  renderState();
};
$("applyUpdate").onclick = () => api.action("applyUpdate");
$("openLogs").onclick = () => api.action("openLogs");

function updateText(u) {
  const v = { v: u.version ?? "", p: u.progress ?? 0 };
  return (
    {
      checking: t("updateChecking"),
      latest: t("updateLatest"),
      downloading: t("updateDownloading", v),
      ready: t("updateReady", v),
      available: t("updateAvailable", v),
      error: t("updateError"),
    }[u.status] ?? ""
  );
}

function renderState() {
  $("pcName").value ||= s.deviceName;
  $("addrs").innerHTML = s.addresses.map((a) => `<span class="addr">${a}</span>`).join("") || "—";
  $("code").textContent = s.pairCode;
  $("syncInfo").textContent = [
    s.status.lastSyncAt ? t("lastSync", { when: new Date(s.status.lastSyncAt).toLocaleString() }) : t("never"),
    s.status.pending ? t("pending", { n: s.status.pending }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  $("version").textContent = `${t("version", { v: s.version })} · ${s.serverUrl}`;
  $("startScreen").value = s.pc.startScreen;
  $("fullscreen").checked = s.pc.fullscreen;
  $("keepAwake").checked = s.pc.keepAwake;
  $("customerDisplay").checked = !!s.pc.customerDisplay;
  $("autoStart").checked = s.autoStart;
  $("autoStartRow").classList.toggle("hidden", s.platform === "linux");
  $("zoom").textContent = `${Math.round(s.pc.zoom * 100)}%`;
  $("updateInfo").textContent = updateText(s.update);
  const apply = $("applyUpdate");
  apply.classList.toggle("hidden", !["ready", "available"].includes(s.update.status));
  apply.textContent = t(s.update.status === "ready" ? "restartUpdate" : "downloadUpdate");
}

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function renderPrinters() {
  $("printers").innerHTML = printers
    .map(
      (p, i) => `<div class="printer" data-i="${i}">
      ${
        p.system !== undefined
          ? `<label>${t("systemPrinter")}<select class="field" data-k="system">${systemList
              .map(
                (x) =>
                  `<option value="${esc(x.name)}" ${x.name === p.system ? "selected" : ""} ${x.virtual ? "disabled" : ""}>${esc(x.displayName)}${x.virtual ? ` (${t("virtualPrinter")})` : ""}</option>`,
              )
              .join("")}</select></label>`
          : `<label>IP<input class="field" dir="ltr" data-k="host" value="${esc(p.host)}" placeholder="192.168.1.50"></label>
             <label>Port<input class="field" dir="ltr" data-k="port" value="${esc(p.port ?? 9100)}"></label>`
      }
      <label>${t("paper")}<select class="field" data-k="paperMm"><option value="80" ${p.paperMm !== 58 ? "selected" : ""}>80 mm</option><option value="58" ${p.paperMm === 58 ? "selected" : ""}>58 mm</option></select></label>
      <label>${t("target")}<select class="field" data-k="target">
        <option value="all" ${p.target === "all" ? "selected" : ""}>${t("targetAll")}</option>
        <option value="cashier" ${p.target === "cashier" ? "selected" : ""}>${t("targetCashier")}</option>
        ${s.stations.length ? `<option value="station" ${p.target === "station" ? "selected" : ""}>${t("targetStation")}</option>` : ""}
      </select></label>
      ${
        p.target === "station"
          ? `<label>&nbsp;<select class="field" data-k="stationId">${s.stations
              .map((x) => `<option value="${esc(x.id)}" ${x.id === p.stationId ? "selected" : ""}>${esc(x.name)}</option>`)
              .join("")}</select></label>`
          : ""
      }
      <div class="row"><button class="btn" data-test="${i}">${t("test")}</button><button class="btn danger" data-remove="${i}">${t("remove")}</button></div>
    </div>`,
    )
    .join("");
}

$("printers").addEventListener("change", (e) => {
  const box = e.target.closest("[data-i]");
  const k = e.target.dataset.k;
  if (!box || !k) return;
  const p = printers[Number(box.dataset.i)];
  p[k] = k === "paperMm" || k === "port" ? Number(e.target.value) : e.target.value;
  if (k === "target" && p.target === "station") p.stationId ??= s.stations[0]?.id ?? null;
  if (k === "host" || k === "system") p.name = e.target.value;
  renderPrinters();
});
$("printers").addEventListener("click", async (e) => {
  const rm = e.target.dataset.remove;
  const test = e.target.dataset.test;
  if (rm !== undefined) {
    printers.splice(Number(rm), 1);
    renderPrinters();
  }
  if (test !== undefined) {
    await api.action("setLocalPrinters", printers);
    $("printerMsg").textContent = "…";
    try {
      await api.action("testPrint", Number(test));
      $("printerMsg").textContent = "✓";
    } catch (err) {
      $("printerMsg").textContent = `✗ ${err.message}`;
    }
  }
});
$("addSystem").onclick = () => {
  // A real printer by default: Windows often defaults to OneNote or "Print to PDF".
  const real = systemList.filter((x) => !x.virtual);
  printers.push({ system: real.find((x) => x.isDefault)?.name ?? real[0]?.name ?? "", paperMm: 80, target: "cashier", copies: 1 });
  if (!real.length) $("printerMsg").textContent = t("noRealPrinter");
  printers.at(-1).name = printers.at(-1).system;
  renderPrinters();
};
$("addNetwork").onclick = () => {
  printers.push({ host: "", port: 9100, paperMm: 80, target: "all", copies: 1, name: "" });
  renderPrinters();
};
$("savePrinters").onclick = async () => {
  await api.action("setLocalPrinters", printers);
  $("printerMsg").textContent = "✓";
};
$("server").value = s.serverUrl;
// The address is tied to the restaurant the PC is linked to: change it only before linking.
$("server").disabled = $("serverSave").disabled = s.linked;
$("serverSave").onclick = async () => {
  try {
    await api.action("setServer", $("server").value);
    await api.action("site");
  } catch {
    $("serverErr").textContent = "https://…";
  }
};
$("pcSave").onclick = () => api.action("setDeviceName", $("pcName").value);
$("newCode").onclick = () => api.action("newCode");
$("unpairAll").onclick = () => api.action("unpairAll");
$("syncNow").onclick = () => api.action("sync");
$("unlink").onclick = () => api.action("unlink");
$("back").onclick = () => api.action("site");

api.onState((next) => {
  s = next;
  renderState();
});
renderState();
renderPrinters();
renderTerminal();
