"use client";

import { useEffect, useState } from "react";

/**
 * The card terminal linked to the till (PC-POS), reached through the Spotifood PC app: the till
 * sends the amount, the terminal shows it to the customer, the result comes back. In a plain
 * browser there is no bridge: the amount is typed on the terminal and confirmed by hand.
 */
export type TerminalResult =
  | { status: "approved"; rrn?: string | null; simulated?: boolean }
  | { status: "declined" | "cancelled" | "timeout" | "error"; message?: string };

type Bridge = {
  info: () => Promise<{ driver: string; ready: boolean }>;
  pay: (req: { amountCents: number; currency: string; reference?: string }) => Promise<TerminalResult>;
  cancel: () => Promise<boolean>;
};

export const terminalBridge = (): Bridge | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { spotifoodTerminal?: Bridge }).spotifoodTerminal ?? null);

/** Whether this till has a card terminal it can send amounts to. */
export function useCardTerminal() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const b = terminalBridge();
    if (!b) return;
    let alive = true;
    b.info()
      .then((i) => alive && setReady(!!i?.ready))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}
