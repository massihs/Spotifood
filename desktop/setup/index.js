import { isRtl, translator } from "/i18n.js";
import { icon } from "/icons.js";

const $ = (id) => document.getElementById(id);
const s = await window.spotifood.state();
const locale = navigator.language?.startsWith("fr") ? "fr" : navigator.language?.startsWith("en") ? "en" : "fa";
const t = translator(locale);
document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
document.documentElement.lang = locale;
$("title").textContent = t("setupTitle");
$("body").textContent = t("setupBody");
$("feats").innerHTML = [
  ["receipt", "featPos"],
  ["wifiOff", "featOffline"],
  ["printer", "featPrint"],
  ["phone", "featPhones"],
]
  .map(([i, k]) => `<div class="feat"><span class="ico">${icon(i)}</span><span><b>${t(`${k}Title`)}</b><span>${t(`${k}Body`)}</span></span></div>`)
  .join("");
$("formTitle").textContent = t("setupFormTitle");
$("serverLabel").innerHTML = `${icon("server")}${t("server")}`;
$("go").innerHTML = `${t("signIn")}${icon("arrow", { cls: "flip" })}`;
$("hint").textContent = t("setupHint");
$("version").textContent = t("version", { v: s.version });
$("secure").innerHTML = `${icon("shield")} HTTPS`;
$("server").value = s.serverUrl;
$("go").onclick = async () => {
  $("err").textContent = "";
  try {
    await window.spotifood.action("setServer", $("server").value);
    await window.spotifood.action("login");
  } catch {
    $("err").textContent = "https://…";
  }
};
