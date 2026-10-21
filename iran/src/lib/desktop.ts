import "server-only";

/**
 * Where the desktop installers are published (set by the release workflow, see docs/DESKTOP.md).
 * Unset → the settings page says the app is coming.
 */
export function desktopDownloads() {
  const url = (v: string | undefined) => (v && /^https:\/\//.test(v) ? v : null);
  return {
    windows: url(process.env.DESKTOP_WINDOWS_URL),
    mac: url(process.env.DESKTOP_MAC_URL),
  };
}
