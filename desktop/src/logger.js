import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 1024 * 1024;
const KEEP = 3;

/**
 * Logs to the console and to `logs/spotifood.log` in the app's data folder (1 MB, 3 old files
 * kept), so a restaurant can send them when something went wrong during a service.
 */
export function createLogger(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "spotifood.log");
  const rotate = () => {
    try {
      if (fs.statSync(file).size < MAX_BYTES) return;
    } catch {
      return;
    }
    for (let i = KEEP - 1; i >= 1; i--) {
      try {
        fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      } catch {
        /* not there yet */
      }
    }
    try {
      fs.renameSync(file, `${file}.1`);
    } catch {
      /* raced with another write */
    }
  };
  const log = (...parts) => {
    const line = `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? (p.stack ?? p.message) : typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
    console.log(line);
    try {
      rotate();
      fs.appendFileSync(file, `${line}\n`);
    } catch {
      /* a full disk must never stop the till */
    }
  };
  return { log, dir, file };
}
