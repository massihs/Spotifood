import { mockEnabled, mockProvider } from "./mock";
import { offlineProvider } from "./offline";
import { stripeProvider } from "./stripe";
import { zarinpalProvider } from "./zarinpal";
import { edition } from "@/config/edition";
import type { PaymentProvider, ProviderCode } from "./types";

const providers: Partial<Record<ProviderCode, PaymentProvider>> = {
  cash: offlineProvider("cash"),
  on_site_terminal: offlineProvider("on_site_terminal"),
  mock_online: mockProvider,
  stripe: stripeProvider,
  zarinpal: zarinpalProvider,
};

/** Test hook to plug a fake PSP. */
export function setPaymentProvider(code: ProviderCode, provider: PaymentProvider | undefined) {
  if (provider) providers[code] = provider;
  else delete providers[code];
}

export function getProvider(code: string): PaymentProvider | null {
  return providers[code as ProviderCode] ?? null;
}

/** Online PSPs this deployment can offer at all (edition), credentials aside. */
export function offerableOnlineProviders(): ProviderCode[] {
  const out = [...edition.onlineProviders] as ProviderCode[];
  if (mockEnabled()) out.push("mock_online");
  return out;
}

/**
 * Online providers usable for a restaurant (credentials present / dev mock allowed).
 * `zarinpalReady`: the restaurant has a way to collect with Zarinpal (its own merchant id, or
 * Spotifood's account plus a bank account to be paid on).
 */
export function availableOnlineProviders(opts: { zarinpalReady?: boolean } = {}): ProviderCode[] {
  const out: ProviderCode[] = [];
  // Each edition only offers the PSPs that work in its market (Stripe is unavailable in Iran).
  const offered = edition.onlineProviders as readonly string[];
  if (offered.includes("stripe") && process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
    out.push("stripe");
  if (offered.includes("zarinpal") && opts.zarinpalReady) out.push("zarinpal");
  if (mockEnabled()) out.push("mock_online");
  return out;
}

export type { PaymentProvider, ProviderCode } from "./types";
