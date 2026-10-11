import { mockEnabled, mockProvider } from "./mock";
import { offlineProvider } from "./offline";
import { stripeProvider } from "./stripe";
import type { PaymentProvider, ProviderCode } from "./types";

const providers: Partial<Record<ProviderCode, PaymentProvider>> = {
  cash: offlineProvider("cash"),
  on_site_terminal: offlineProvider("on_site_terminal"),
  mock_online: mockProvider,
  stripe: stripeProvider,
};

/** Test hook to plug a fake PSP. */
export function setPaymentProvider(code: ProviderCode, provider: PaymentProvider | undefined) {
  if (provider) providers[code] = provider;
  else delete providers[code];
}

export function getProvider(code: string): PaymentProvider | null {
  return providers[code as ProviderCode] ?? null;
}

/** Online providers usable on this deployment (credentials present / dev mock allowed). */
export function availableOnlineProviders(): ProviderCode[] {
  const out: ProviderCode[] = [];
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) out.push("stripe");
  if (mockEnabled()) out.push("mock_online");
  return out;
}

export type { PaymentProvider, ProviderCode } from "./types";
