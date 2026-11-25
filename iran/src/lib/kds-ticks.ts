"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Dishes ticked off on a kitchen screen, one by one, as the cook plates them: kept on the device
 * (localStorage), shared by every card and the "to cook" summary of that screen. Only the most
 * recent ticks are kept, so the list never grows.
 */

const KEY = "sf-kds-ticks";
const EVENT = "sf-kds-ticks-change";
const MAX = 400;

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function parse(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useTicks() {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  const ticked = useMemo(() => new Set(parse(raw)), [raw]);
  const toggle = useCallback((id: string) => {
    const list = parse(read());
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: the tick only lasts this page */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { ticked, toggle };
}
