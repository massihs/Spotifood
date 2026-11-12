/**
 * The customer display: a second screen on the till (or a window on it) showing the customer
 * what is rung up and the amount to pay. The till broadcasts its ticket on a channel of the
 * browser; the display page listens. Same PC, same browser: nothing goes through the server.
 */
export type DisplayState = {
  status: "idle" | "cart" | "paying" | "card" | "paid";
  lines: { name: string; quantity: number; totalCents: number }[];
  discountCents: number;
  totalCents: number;
  changeCents?: number | null;
  number?: string | null;
};

export const displayChannel = (restaurantId: string) => `sf-display-${restaurantId}`;

/** Sends the till's state to the customer display (no-op where channels do not exist). */
export function makeDisplayPublisher(restaurantId: string) {
  if (typeof BroadcastChannel === "undefined") return { send: () => {}, close: () => {} };
  const ch = new BroadcastChannel(displayChannel(restaurantId));
  let last: DisplayState | null = null;
  // A display opened later asks for the current state.
  ch.onmessage = (e) => {
    if (e.data === "hello" && last) ch.postMessage(last);
  };
  return {
    send: (s: DisplayState) => {
      last = s;
      ch.postMessage(s);
    },
    close: () => ch.close(),
  };
}
