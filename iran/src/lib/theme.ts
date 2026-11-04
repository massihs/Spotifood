/** Day / night mode: "auto" follows the device, the others force it (stored per device). */
export const THEME_KEY = "sf-theme";
export const THEMES = ["auto", "light", "dark"] as const;
export type ThemeChoice = (typeof THEMES)[number];

const BAR = { light: "#ffffff", dark: "#0a0a0a" } as const;

/**
 * Runs in <head> before the first paint, so a forced theme never flashes the other one.
 * Kept as a string: it must not depend on the bundle.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var c=t==="dark"?${JSON.stringify(BAR.dark)}:${JSON.stringify(BAR.light)};document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})}}catch(e){}})();`;

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  const dark =
    choice === "dark" || (choice === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media");
    // In auto mode each tag keeps the color of its own media query.
    const color =
      choice === "auto" && media
        ? media.includes("dark")
          ? BAR.dark
          : BAR.light
        : dark
          ? BAR.dark
          : BAR.light;
    m.setAttribute("content", color);
  });
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return THEMES[(THEMES.indexOf(choice) + 1) % THEMES.length]!;
}

export function isThemeChoice(v: string): v is ThemeChoice {
  return (THEMES as readonly string[]).includes(v);
}
