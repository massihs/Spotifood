import type { PaymentProvider, PaymentWebhookEvent } from "./types";

/**
 * Zarinpal (Iran) — REST API v4.
 * Flow: request.json → redirect the guest to StartPay/{authority} → Zarinpal sends the guest back
 * to our callback with ?Authority=…&Status=OK|NOK → we call verify.json server-to-server
 * (code 100 = verified, 101 = already verified). There is no webhook: the callback + verify is
 * the confirmation, and verify is idempotent on Zarinpal's side.
 *
 * NOT yet exercised against the live Zarinpal API in this repository (no merchant id here):
 * request shapes follow Zarinpal's v4 documentation; the logic is covered with a mocked API.
 *
 * Amounts: Zarinpal expects whole rials (currency "IRR"); our amounts are minor units (×100).
 * Multi-tenant: a restaurant with its own Zarinpal merchant id (restaurant settings) passes it as
 * `merchantAccount`, so money lands on its account. Otherwise Spotifood collects on its own
 * merchant (ZARINPAL_MERCHANT_ID, else BILLING_ZARINPAL_MERCHANT_ID) and, when split settlement
 * ("wages", تسهیم) is activated on it, Zarinpal pays the restaurant's share to its Sheba itself.
 */
const host = () =>
  process.env.ZARINPAL_SANDBOX === "true" || process.env.ZARINPAL_SANDBOX === "1"
    ? "https://sandbox.zarinpal.com"
    : "https://payment.zarinpal.com";

const merchant = (override: string | null) => {
  const id = override ?? (process.env.ZARINPAL_MERCHANT_ID || process.env.BILLING_ZARINPAL_MERCHANT_ID);
  if (!id) throw new Error("ZARINPAL_MERCHANT_ID is not configured");
  return id;
};

/**
 * Errors Zarinpal returns about the split itself (wage total above the amount, invalid
 * percentages, too many accounts, IBAN inactive or not registered at Shaparak): the payment is
 * then requested again without it, so the guest can still pay.
 */
const WAGE_ERRORS = new Set([-32, -33, -35, -37, -38]);

type ZarinpalResponse = {
  data?: { code?: number; message?: string; authority?: string; ref_id?: number; card_pan?: string } | [];
  errors?: { code?: number; message?: string } | [];
};

async function call(path: string, body: Record<string, unknown>): Promise<ZarinpalResponse> {
  const res = await fetch(`${host()}/pg/v4/payment/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json().catch(() => ({}))) as ZarinpalResponse;
}

const dataOf = (r: ZarinpalResponse) => (Array.isArray(r.data) ? undefined : r.data);
const errorOf = (r: ZarinpalResponse) =>
  Array.isArray(r.errors)
    ? undefined
    : r.errors?.message
      ? `${r.errors.code}: ${r.errors.message}`
      : undefined;

/** Our minor units → whole rials. IRR prices never carry decimals in practice. */
export function toRials(amountCents: number, currency: string) {
  if (currency !== "IRR") throw new Error(`Zarinpal only supports IRR (got ${currency})`);
  return Math.round(amountCents / 100);
}

export const zarinpalProvider: PaymentProvider = {
  code: "zarinpal",
  kind: "online",

  async createPayment(input) {
    const callback = new URL(input.callbackUrl);
    const body = {
      merchant_id: merchant(input.merchantAccount),
      amount: toRials(input.amountCents, input.currency),
      currency: "IRR",
      description: input.description,
      callback_url: callback.toString(),
      metadata: { order_id: input.paymentId },
    };
    const wages = (input.wages ?? []).map((w) => ({
      iban: w.iban,
      amount: toRials(w.amountCents, input.currency),
      description: w.description.slice(0, 100),
    }));
    let r = await call("request.json", wages.length ? { ...body, wages } : body);
    let splitApplied = wages.length > 0;
    const code = (Array.isArray(r.errors) ? undefined : r.errors?.code) ?? dataOf(r)?.code;
    if (wages.length && typeof code === "number" && WAGE_ERRORS.has(code)) {
      r = await call("request.json", body);
      splitApplied = false;
    }
    const data = dataOf(r);
    if (data?.code !== 100 || !data.authority) {
      throw new Error(`Zarinpal request failed (${errorOf(r) ?? data?.code ?? "no response"})`);
    }
    return {
      status: "requires_action",
      redirectUrl: `${host()}/pg/StartPay/${data.authority}`,
      providerRef: data.authority,
      ...(wages.length ? { splitApplied } : {}),
    };
  },

  async verifyReturn({ query, payment }): Promise<PaymentWebhookEvent> {
    const authority = query.get("Authority") ?? "";
    // The authority in the URL must be the one Zarinpal gave us for this payment.
    if (!authority || authority !== payment.providerRef) return { type: "ignored" };
    if (query.get("Status") !== "OK") {
      return {
        type: "payment.failed",
        paymentId: payment.id,
        providerRef: authority,
        reason: "cancelled_or_declined",
      };
    }
    const r = await call("verify.json", {
      merchant_id: merchant(payment.merchantAccount),
      amount: toRials(payment.amountCents, payment.currency),
      authority,
    });
    const data = dataOf(r);
    if (data?.code === 100 || data?.code === 101) {
      return {
        type: "payment.succeeded",
        paymentId: payment.id,
        providerRef: authority,
        extra: { refId: String(data.ref_id ?? ""), cardPan: String(data.card_pan ?? "") },
      };
    }
    return {
      type: "payment.failed",
      paymentId: payment.id,
      providerRef: authority,
      reason: `verify_failed:${errorOf(r) ?? data?.code ?? "no_response"}`.slice(0, 200),
    };
  },

  async refund() {
    // Zarinpal refunds go through its separate GraphQL "refund" API with an access token.
    // Until that is wired, refunds are done from the Zarinpal panel.
    throw new Error("zarinpal_refund_not_supported");
  },
};
