import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { amounts, cleanTerminal, createTerminal, readAnswer, renderRequest } from "../src/terminal.js";

test("amounts and request template", () => {
  // 125 000 tomans = 1 250 000 rials = 125 000 000 minor units.
  assert.deepEqual(amounts(125_000_000, "IRR"), { amount_rial: "1250000", amount_toman: "125000", amount: "1250000" });
  const cfg = cleanTerminal({ template: "SALE|{amount_rial}|{ref}", terminator: "crlf" });
  assert.equal(renderRequest(cfg, { amountCents: 125_000_000, currency: "IRR", reference: "A-1001" }), "SALE|1250000|A-1001\r\n");
  // A bad pattern falls back to the default instead of breaking the till.
  assert.equal(cleanTerminal({ approved: "(" }).approved, cleanTerminal({}).approved);
  assert.equal(cleanTerminal({ driver: "nope" }).driver, "none");
});

test("reads approved and declined answers", () => {
  const cfg = cleanTerminal({ approved: "^OK", declined: "^NO", rrn: "RRN=(\\d+)" });
  assert.deepEqual(readAnswer(cfg, "OK RRN=123456789"), { status: "approved", rrn: "123456789", raw: "OK RRN=123456789" });
  assert.equal(readAnswer(cfg, "NO 51").status, "declined");
  assert.equal(readAnswer(cfg, "WAIT"), null);
});

test("pays through a terminal on the network", async () => {
  let got = "";
  const server = net.createServer((s) => {
    s.on("data", (d) => {
      got += d;
      s.write("00 RRN=998877665544");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const t = createTerminal({ getConfig: () => ({ driver: "tcp", host: "127.0.0.1", port, template: "{amount_rial}", terminator: "lf" }) });
  assert.deepEqual(t.info(), { driver: "tcp", ready: true });
  const r = await t.pay({ amountCents: 5_000_000, currency: "IRR", reference: "B-7" });
  assert.equal(got, "50000\n");
  assert.equal(r.status, "approved");
  assert.equal(r.rrn, "998877665544");
  server.close();
});

test("reports a terminal that does not answer, and one sale at a time", async () => {
  const t = createTerminal({ getConfig: () => ({ driver: "tcp", host: "127.0.0.1", port: 1 }) });
  const r = await t.pay({ amountCents: 1000, currency: "IRR" });
  assert.equal(r.status, "error");
  const sim = createTerminal({ getConfig: () => ({ driver: "simulator" }) });
  const first = sim.pay({ amountCents: 1000, currency: "IRR" });
  assert.deepEqual(await sim.pay({ amountCents: 1000, currency: "IRR" }), { status: "error", message: "busy" });
  sim.cancel();
  assert.equal((await first).status, "cancelled");
  assert.equal((await sim.pay({ amountCents: 0 })).message, "invalid_amount");
});
