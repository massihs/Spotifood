import net from "node:net";

/**
 * Card terminal (PC-POS / "پوز متصل به صندوق"): the till sends the amount to the bank's card
 * terminal, which shows it to the customer; the customer inserts or taps the card and the result
 * (approved with its reference, or declined) comes back to the till. No amount is typed twice.
 *
 * Drivers:
 * - "tcp": most PSPs' terminals (Behpardakht, Sadad, Saman, Pasargad, Parsian…) listen on the
 *   restaurant's network; their PC-POS message is set by the PSP's installer as a template
 *   ({amount_rial}, {amount_toman}, {amount}, {ref}) and the answer is read with patterns.
 * - "simulator": approves after two seconds, for training the staff (no money moves).
 */

export const TERMINAL_DEFAULTS = {
  driver: "none",
  host: "",
  port: 1024,
  template: "{amount_rial}",
  terminator: "none",
  approved: "^(00|000|APPROVED|OK)\\b",
  declined: "^(5\\d|9\\d|DECLINED|ERROR|FAIL)",
  rrn: "(?:RRN|rrn)[=: ]*(\\d{6,16})",
  timeoutSec: 90,
};

const TERMINATORS = { none: "", crlf: "\r\n", lf: "\n", etx: "\x03" };

/** Keeps known settings with sane bounds (the settings screen sends free text). */
export function cleanTerminal(raw = {}) {
  const c = { ...TERMINAL_DEFAULTS, ...raw };
  const pattern = (p, fallback) => {
    try {
      new RegExp(String(p));
      return String(p).slice(0, 200);
    } catch {
      return fallback;
    }
  };
  return {
    driver: ["none", "tcp", "simulator"].includes(c.driver) ? c.driver : "none",
    host: String(c.host ?? "").trim().slice(0, 120),
    port: Math.min(65535, Math.max(1, Number(c.port) || TERMINAL_DEFAULTS.port)),
    template: String(c.template ?? TERMINAL_DEFAULTS.template).slice(0, 500),
    terminator: Object.keys(TERMINATORS).includes(c.terminator) ? c.terminator : "none",
    approved: pattern(c.approved, TERMINAL_DEFAULTS.approved),
    declined: pattern(c.declined, TERMINAL_DEFAULTS.declined),
    rrn: pattern(c.rrn, TERMINAL_DEFAULTS.rrn),
    timeoutSec: Math.min(300, Math.max(10, Number(c.timeoutSec) || TERMINAL_DEFAULTS.timeoutSec)),
  };
}

/**
 * Amount in the units terminals expect. Spotifood stores minor units: hundredths of a rial for
 * IRR (1 toman = 1000), cents elsewhere.
 */
export function amounts(amountCents, currency) {
  if (currency === "IRR") {
    const rial = Math.round(amountCents / 100);
    return { amount_rial: String(rial), amount_toman: String(Math.round(rial / 10)), amount: String(rial) };
  }
  return { amount_rial: "", amount_toman: "", amount: (amountCents / 100).toFixed(2) };
}

/** The message sent to the terminal: the template with the amount and the order reference. */
export function renderRequest(cfg, { amountCents, currency, reference }) {
  const vars = { ...amounts(amountCents, currency), ref: String(reference ?? "").replace(/[^\w-]/g, "").slice(0, 32) };
  const body = cfg.template.replace(/\{(amount_rial|amount_toman|amount|ref)\}/g, (_m, k) => vars[k] ?? "");
  return body + TERMINATORS[cfg.terminator];
}

/** Reads the terminal's answer: approved (with its reference), declined, or not yet known. */
export function readAnswer(cfg, text) {
  const s = text.trim();
  if (!s) return null;
  const rrn = s.match(new RegExp(cfg.rrn))?.[1] ?? null;
  if (new RegExp(cfg.approved, "i").test(s)) return { status: "approved", rrn, raw: s.slice(0, 300) };
  if (new RegExp(cfg.declined, "i").test(s)) return { status: "declined", rrn, raw: s.slice(0, 300) };
  return null;
}

export function createTerminal({ getConfig, log = () => {}, connect = net.connect, wait = setTimeout }) {
  let busy = null;

  const info = () => {
    const c = cleanTerminal(getConfig());
    return { driver: c.driver, ready: c.driver === "simulator" || (c.driver === "tcp" && !!c.host) };
  };

  function viaTcp(cfg, req) {
    return new Promise((resolve) => {
      let buffer = "";
      let settled = false;
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        busy = null;
        resolve(r);
      };
      const socket = connect({ host: cfg.host, port: cfg.port });
      const timer = wait(() => done({ status: "timeout" }), cfg.timeoutSec * 1000);
      busy = { cancel: () => done({ status: "cancelled" }) };
      socket.setEncoding?.("utf8");
      socket.on("connect", () => socket.write(renderRequest(cfg, req)));
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        const r = readAnswer(cfg, buffer);
        if (r) done(r);
      });
      socket.on("error", (e) => {
        log("terminal error", e?.message);
        done({ status: "error", message: e?.code ?? "connect_failed" });
      });
      socket.on("close", () => done(readAnswer(cfg, buffer) ?? { status: "error", message: "closed" }));
    });
  }

  /** Sends the amount to the terminal and waits for the customer's card (one sale at a time). */
  async function pay(req) {
    const amountCents = Math.round(Number(req?.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return { status: "error", message: "invalid_amount" };
    if (busy) return { status: "error", message: "busy" };
    const cfg = cleanTerminal(getConfig());
    const r = { amountCents, currency: String(req.currency ?? "IRR"), reference: req.reference };
    log("terminal pay", { driver: cfg.driver, amountCents, reference: r.reference });
    if (cfg.driver === "simulator")
      return new Promise((resolve) => {
        const timer = wait(() => {
          busy = null;
          resolve({ status: "approved", rrn: `SIM${String(Date.now()).slice(-9)}`, simulated: true });
        }, 2000);
        busy = {
          cancel: () => {
            clearTimeout(timer);
            busy = null;
            resolve({ status: "cancelled" });
          },
        };
      });
    if (cfg.driver === "tcp" && cfg.host) {
      const out = await viaTcp(cfg, r);
      log("terminal result", out.status);
      return out;
    }
    return { status: "error", message: "not_configured" };
  }

  const cancel = () => {
    busy?.cancel();
    return true;
  };

  return { info, pay, cancel };
}
