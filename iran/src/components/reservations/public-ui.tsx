"use client";

import { CalendarCheck, Loader2, Minus, Plus, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { bookAction, cancelBookingAction, joinQueueAction, slotsAction } from "@/app/[locale]/r/actions";

const field =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[16px] focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none";

function Party({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const t = useTranslations("booking");
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
      <span className="font-semibold">{t("people")}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          className="grid size-10 place-items-center rounded-full bg-surface-2"
          aria-label="-"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-8 text-center text-xl font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="grid size-10 place-items-center rounded-full bg-surface-2"
          aria-label="+"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function BookingForm({
  slug,
  days,
  maxParty,
}: {
  slug: string;
  days: { key: string; weekday: string; label: string }[];
  maxParty: number;
}) {
  const t = useTranslations("booking");
  const tErr = useTranslations("errorCodes");
  const router = useRouter();
  const [day, setDay] = useState(days[0]!.key);
  const [party, setParty] = useState(2);
  const [slots, setSlots] = useState<{ time: string; at: string }[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [area, setArea] = useState<"any" | "indoor" | "outdoor">("any");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void slotsAction(slug, day, party).then((res) => {
      if (!alive) return;
      setSlots(res?.ok && res.data ? res.data : []);
      setSlot(null);
    });
    return () => {
      alive = false;
    };
  }, [slug, day, party]);

  return (
    <div className="space-y-4">
      <Party value={party} onChange={setParty} max={maxParty} />
      <div>
        <p className="mb-2 font-semibold">{t("day")}</p>
        <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDay(d.key)}
              className={cn(
                "flex w-16 shrink-0 flex-col items-center rounded-2xl py-2.5",
                day === d.key ? "bg-accent text-accent-fg shadow-accent" : "bg-surface ring-1 ring-border",
              )}
            >
              <span className="text-xs opacity-80">{d.weekday}</span>
              <span className="text-lg font-bold">{d.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 font-semibold">{t("time")}</p>
        {slots === null ? (
          <Loader2 className="mx-auto size-6 animate-spin text-fg-subtle" />
        ) : slots.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-fg-muted">
            {t("noSlots")}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button
                key={s.at}
                type="button"
                onClick={() => setSlot(s.at)}
                className={cn(
                  "h-11 rounded-xl text-sm font-semibold tabular-nums",
                  slot === s.at ? "bg-accent text-accent-fg" : "bg-surface ring-1 ring-border",
                )}
                dir="ltr"
              >
                {s.time}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(["any", "indoor", "outdoor"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setArea(a)}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold",
              area === a ? "bg-surface shadow-sm" : "text-fg-muted",
            )}
          >
            {t(`areas.${a}`)}
          </button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("name")}
        autoComplete="name"
        className={field}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="09xx xxx xxxx"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        className={cn(field, "text-start")}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("note")}
        maxLength={500}
        className={field}
      />
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending || !slot || !name.trim() || !phone.trim()}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await bookAction(slug, {
              name,
              phone,
              partySize: party,
              startsAt: slot!,
              note,
              area,
            });
            if (res?.ok && res.data) router.push(`/r/${slug}/b/${res.data.code}`);
            else setError(res && !res.ok && tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
          })
        }
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-accent-fg shadow-accent disabled:opacity-40"
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : <CalendarCheck className="size-5" />}
        {t("confirm")}
      </button>
    </div>
  );
}

export function QueueForm({ slug }: { slug: string }) {
  const t = useTranslations("booking");
  const tErr = useTranslations("errorCodes");
  const router = useRouter();
  const [party, setParty] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Party value={party} onChange={setParty} max={50} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("name")}
        className={field}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="09xx xxx xxxx"
        inputMode="tel"
        dir="ltr"
        className={cn(field, "text-start")}
      />
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending || !name.trim() || !phone.trim()}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await joinQueueAction(slug, { name, phone, partySize: party });
            if (res?.ok && res.data) router.push(`/r/${slug}/b/${res.data.code}`);
            else setError(res && !res.ok && tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
          })
        }
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-accent-fg shadow-accent disabled:opacity-40"
      >
        <Ticket className="size-5" />
        {t("takeTicket")}
      </button>
    </div>
  );
}

export function CancelBooking({ slug, code }: { slug: string; code: string }) {
  const t = useTranslations("booking");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        window.confirm(t("cancelConfirm")) &&
        start(async () => {
          await cancelBookingAction(slug, code);
          router.refresh();
        })
      }
      className="h-12 w-full rounded-2xl font-semibold text-danger ring-1 ring-danger/30"
    >
      {t("cancel")}
    </button>
  );
}

/** Queue status page refreshes itself while waiting. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
