"use client";

import { BellOff, BellRing, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { updateOrderStatusAction } from "@/app/[locale]/dashboard/[restaurantId]/orders/actions";
import { useLiveEvent } from "@/components/realtime/live";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "sf-order-alerts";
const PREF_EVENT = "sf-order-alerts-change";

function readPref() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true; // private mode: alerts stay on
  }
}
function writePref(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}
function subscribePref(cb: () => void) {
  window.addEventListener(PREF_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREF_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Two short rising tones. Browsers only play audio after a user gesture, hence the unlock. */
export function chime(ctx: AudioContext) {
  const now = ctx.currentTime;
  [880, 1320, 1760].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.16);
    gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.16 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.16);
    osc.stop(now + i * 0.16 + 0.16);
  });
}

type Alert = {
  id: string;
  title: string;
  body: string;
  href: string;
  waiter?: boolean;
  /** A new guest order: accepted straight from the alert, which stays until someone does. */
  orderId?: string;
};

/** While orders wait for acceptance, the chime comes back this often (nobody misses one). */
const REMIND_MS = 60_000;

/**
 * Team-wide new-order alerts on every dashboard page: a sound, a card linking to the orders,
 * a system notification when the tab is in the background, and fresh badges (router refresh).
 */
export function OrderAlerts({
  restaurantId,
  newOrders,
  kitchen = false,
  sections = null,
  canAccept = false,
}: {
  /** The member can accept orders: new-order alerts get an "Accept" button. */
  canAccept?: boolean;
  restaurantId: string;
  newOrders: number;
  /** The member's team sections: alerts meant for other sections stay silent (null = all). */
  sections?: string[] | null;
  /** Bar / kitchen screens ring when the till sends an order, not when a guest places it. */
  kitchen?: boolean;
}) {
  const t = useTranslations("alerts");
  const tCall = useTranslations("guest.waiter.kinds");
  const router = useRouter();
  const enabled = useSyncExternalStore(subscribePref, readPref, () => true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Unlock audio on the first interaction anywhere on the page.
    const unlock = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      void audio.current?.close();
    };
  }, []);

  // Tab title shows the number of orders waiting.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = newOrders > 0 ? `(${newOrders > 99 ? "99+" : newOrders}) ${base}` : base;
  }, [newOrders]);

  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 250);
  }, [router]);

  const dismiss = useCallback((id: string) => setAlerts((a) => a.filter((x) => x.id !== id)), []);
  const [accepting, startAccept] = useTransition();
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const accept = (a: Alert) =>
    startAccept(async () => {
      const res = await updateOrderStatusAction(restaurantId, a.orderId!, "accepted");
      // Accepted here, or already handled elsewhere (another screen, the kitchen): either way done.
      if (res?.ok || res?.error === "status_changed" || res?.error === "invalid_transition") {
        setAcceptedId(a.id);
        setTimeout(() => {
          setAcceptedId(null);
          dismiss(a.id);
        }, 1200);
        refreshSoon();
      }
    });

  // Orders still waiting: the chime again every minute, on the screens that accept them.
  useEffect(() => {
    if (kitchen || !enabled || newOrders <= 0) return;
    const id = setInterval(() => {
      if (audio.current) chime(audio.current);
    }, REMIND_MS);
    return () => clearInterval(id);
  }, [kitchen, enabled, newOrders]);

  useLiveEvent((type, data) => {
    if (type === "order.updated") {
      // Accepted or moved on elsewhere: its alert has nothing left to ask.
      if (data.orderId && data.status && data.status !== "received") dismiss(String(data.orderId));
      return refreshSoon();
    }
    let alert: Alert;
    const room = data.place === "room";
    const target = data.sections;
    if (sections && Array.isArray(target) && !target.some((s) => sections.includes(String(s)))) {
      if (type === "order.created") refreshSoon();
      return;
    }
    if (kitchen && type === "waiter.called" && !(sections && Array.isArray(target))) return;
    if (type === "waiter.called") {
      const kind =
        data.kind === "bill"
          ? "bill"
          : data.kind === "water"
            ? "water"
            : data.kind === "confirm"
              ? "confirm"
              : "waiter";
      const table = String(data.tableLabel ?? "");
      const roomCall = [
        "housekeeping",
        "towels",
        "reception",
        "laundry",
        "wakeup",
        "minibar",
        "maintenance",
        "luggage",
        "taxi",
      ].includes(String(data.kind));
      const label = typeof data.label === "string" && data.label ? data.label : null;
      alert = {
        id: `w-${data.tableLabel}-${Date.now()}`,
        title:
          label || roomCall
            ? t(room ? "waiter.customRoom" : "waiter.custom", {
                table,
                label: label ?? tCall(String(data.kind) as "waiter"),
              })
            : t(`waiter.${kind}${room ? "Room" : ""}`, { table }),
        body: typeof data.note === "string" && data.note ? data.note : t("waiter.body"),
        href: `/dashboard/${restaurantId}/${room ? "requests" : "floor"}`,
        waiter: true,
      };
    } else if (kitchen) {
      if (type !== "order.accepted") return;
      refreshSoon();
      alert = {
        id: `k-${String(data.orderId ?? Date.now())}`,
        title: t("kitchenTitle", { number: String(data.number ?? "") }),
        body: t(room ? "bodyRoom" : "body", { table: String(data.tableLabel ?? "") }),
        href: `/dashboard/${restaurantId}/kitchen`,
      };
    } else {
      if (type !== "order.created") return;
      refreshSoon();
      if (data.source === "pos") return; // rung up by the team itself
      alert = {
        id: String(data.orderId ?? Date.now()),
        orderId: canAccept && data.orderId ? String(data.orderId) : undefined,
        title: t("title", { number: String(data.number ?? "") }),
        body: room
          ? `${t("roomOrder")} · ${t("bodyRoom", { table: String(data.tableLabel ?? "") })}`
          : t("body", { table: String(data.tableLabel ?? "") }),
        href: `/dashboard/${restaurantId}/orders`,
      };
    }
    setAlerts((a) => [alert, ...a.filter((x) => x.id !== alert.id)].slice(0, 3));
    // New orders to accept stay on screen until handled; the others go away on their own.
    if (!alert.orderId) setTimeout(() => dismiss(alert.id), 8000);
    if (!enabled) return;
    if (audio.current) chime(audio.current);
    navigator.vibrate?.([120, 60, 120]);
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(alert.title, {
        body: alert.body,
        tag: `order-${alert.id}`,
        icon: "/icons/icon-192.png",
      });
    }
  });

  const toggle = async () => {
    const next = !enabled;
    writePref(next);
    if (next) {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      chime(audio.current);
      if ("Notification" in window && Notification.permission === "default")
        await Notification.requestPermission().catch(() => undefined);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        title={enabled ? t("on") : t("off")}
        aria-label={enabled ? t("on") : t("off")}
        className={cn(
          "grid size-10 place-items-center rounded-full transition-colors",
          enabled ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-fg-subtle",
        )}
      >
        {enabled ? (
          <BellRing className="size-5" aria-hidden="true" />
        ) : (
          <BellOff className="size-5" aria-hidden="true" />
        )}
      </button>

      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] mx-auto flex max-w-md flex-col gap-2 px-4"
      >
        {alerts.map((a) => (
          <div
            key={a.id}
            role="alert"
            className="animate-pop-in pointer-events-auto flex items-center gap-3 rounded-2xl border border-accent/30 bg-surface p-3 shadow-[var(--shadow-float)]"
          >
            <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
              <BellRing className="size-5" aria-hidden="true" />
              <span className="absolute -end-1 -top-1 size-3 animate-ping rounded-full bg-danger" />
            </span>
            <Link href={a.href} onClick={() => dismiss(a.id)} className="min-w-0 flex-1">
              <p className="truncate font-bold">{a.title}</p>
              <p className="truncate text-sm text-fg-muted">{a.body}</p>
            </Link>
            {a.orderId ? (
              <button
                type="button"
                disabled={accepting || acceptedId === a.id}
                onClick={() => accept(a)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors disabled:opacity-80",
                  acceptedId === a.id
                    ? "bg-success text-white"
                    : "bg-accent text-accent-fg hover:bg-accent-hover",
                )}
              >
                <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                {acceptedId === a.id ? t("accepted") : t("accept")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              aria-label={t("dismiss")}
              className="grid size-8 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-surface-2"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
