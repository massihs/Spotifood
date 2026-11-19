/** Hosts that are Spotifood itself, never a restaurant's own domain (the proxy and the settings). */
export function isPlatformHost(host: string, appUrl = process.env.APP_URL ?? "") {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  let app = "";
  try {
    app = new URL(appUrl).hostname;
  } catch {}
  return (
    !h ||
    h === app ||
    h === `www.${app}` ||
    h === "localhost" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) ||
    h.endsWith(".liara.run") ||
    h.endsWith("spotifood.ir") ||
    h.endsWith("spotifood.app")
  );
}
