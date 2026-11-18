import { isRtl, translator } from "/i18n.js";
import { icon } from "/icons.js";

const $ = (id) => document.getElementById(id);
let t = translator("fa");
let toastUntil = 0;

function render(s) {
  if (!s) return;
  t = translator(s.locale);
  document.documentElement.dir = isRtl(s.locale) ? "rtl" : "ltr";
  $("name").textContent = s.restaurantName ?? "Spotifood";
  const online = s.status.online;
  // Before the PC is linked there is no connection to report.
  $("pill").className = `pill ${online ? "on" : "off"}${s.linked ? "" : " hidden"}`;
  $("pillText").textContent = online ? t("online") : t("offline");
  const msg = $("msg");
  if (s.toast && Date.now() - s.toast.at < 8000) {
    msg.className = "msg toast";
    msg.textContent = t(`toast${s.toast.key[0].toUpperCase()}${s.toast.key.slice(1)}`, s.toast.values);
    toastUntil = s.toast.at + 8000;
  } else if (Date.now() > toastUntil) {
    msg.className = "msg";
    msg.textContent = s.status.syncing
      ? t("syncing")
      : !online && s.linked
        ? t("offlineLong")
        : s.status.pending
          ? t("pending", { n: s.status.pending })
          : "";
  }
  // Phones join the hub with this code (useful mostly offline).
  const phones = s.linked && (s.mode === "local" || !online) && s.addresses[0];
  $("phones").classList.toggle("hidden", !phones);
  $("phones").innerHTML = phones
    ? `${icon("phone")}<span dir="ltr">${s.addresses[0]}</span> · ${t("code")} <span class="code">${s.pairCode}</span>`
    : "";
  $("site").innerHTML = `${icon("globe")}<span class="wide">${t("site")}</span>`;
  $("site").title = t("site");
  $("site").setAttribute("aria-pressed", String(s.mode === "site" || s.mode === "setup"));
  $("local").innerHTML = `${icon("wifiOff")}<span class="wide">${t("local")}</span>`;
  $("local").title = t("local");
  $("local").setAttribute("aria-pressed", String(s.mode === "local"));
  $("views").classList.toggle("hidden", !s.linked);
  $("sync").innerHTML = `${icon("refresh")}${t("syncNow")}`;
  $("sync").classList.toggle("hidden", !s.linked || !s.status.pending);
  $("settings").innerHTML = icon("settings");
  $("settings").title = t("settings");
  $("settings").setAttribute("aria-label", t("settings"));
  $("settings").setAttribute("aria-pressed", String(s.mode === "settings"));

  // A new version: proposed in the banner; once answered "Later", a small button stays.
  const u = s.update ?? {};
  const offered = ["ready", "available"].includes(u.status);
  const ready = u.status === "ready";
  $("banner").classList.toggle("hidden", !u.prompt);
  $("spark").innerHTML = icon("sparkles");
  $("bannerTitle").textContent = t("bannerTitle", { v: u.version ?? "" });
  $("bannerBody").textContent = t(ready ? "bannerReady" : "bannerAvailable");
  $("go").innerHTML = `${icon(ready ? "refresh" : "download")}${t(ready ? "restartUpdate" : "downloadUpdate")}`;
  $("later").textContent = t("later");
  $("update").classList.toggle("hidden", !offered || !!u.prompt);
  $("update").innerHTML = `${icon("sparkles")}<span class="wide">${u.version ?? ""}</span>`;
  $("update").title = t(ready ? "restartUpdate" : "downloadUpdate");
}

$("site").onclick = () => window.spotifood.action("site");
$("local").onclick = () => window.spotifood.action("local");
$("sync").onclick = () => window.spotifood.action("sync").then(render);
$("settings").onclick = () => window.spotifood.action("settings");
$("update").onclick = () => window.spotifood.action("applyUpdate");
$("go").onclick = () => window.spotifood.action("applyUpdate");
$("later").onclick = () => window.spotifood.action("laterUpdate").then(render);
window.spotifood.onState(render);
window.spotifood.state().then(render);
setInterval(() => window.spotifood.state().then(render), 4000);
