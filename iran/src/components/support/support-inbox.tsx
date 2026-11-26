"use client";

import { ArrowRight, Check, MessageSquareText, RotateCcw, Store, Zap } from "@/components/icons";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useLiveEvent } from "@/components/realtime/live";
import { chime } from "@/components/dashboard/order-alerts";
import { TimeAgo } from "@/components/ui/time-ago";
import { cn } from "@/lib/cn";
import {
  cannedRepliesAction,
  inboxAction,
  teamConversationAction,
  teamReplyAction,
  teamStatusAction,
} from "@/app/[locale]/admin/support/actions";
import { ChatComposer, ChatThread, StatusChip, type ChatMessage } from "./chat-parts";

type Row = {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: Date | string;
  restaurant: string;
  unread: boolean;
  last: string | null;
};
type Detail = {
  conv: { id: string; subject: string; status: string; context: Record<string, string> };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    phone: string | null;
    status: string;
  };
  openedBy: { name: string | null; email: string | null } | null;
  messages: ChatMessage[];
  others: { id: string; subject: string; status: string; lastMessageAt: Date | string }[];
};
const FILTERS = ["open", "pending", "resolved", "all"] as const;

/** The Spotifood team's inbox: every restaurant's questions, live, with ready answers. */
export function SupportInbox() {
  const t = useTranslations("support");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState({ open: 0, unread: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [canned, setCanned] = useState<{ id: string; title: string; body: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const audio = useRef<AudioContext | null>(null);

  const loadList = useCallback(
    (f = filter) =>
      start(async () => {
        const res = await inboxAction(f);
        if (res?.ok && res.data) {
          setRows(res.data.list as Row[]);
          setCounts(res.data.counts);
        }
      }),
    [filter],
  );
  const loadDetail = useCallback(
    (id: string) =>
      start(async () => {
        const res = await teamConversationAction(id);
        if (res?.ok && res.data) setDetail(res.data as Detail);
        const list = await inboxAction(filter);
        if (list?.ok && list.data) {
          setRows(list.data.list as Row[]);
          setCounts(list.data.counts);
        }
      }),
    [filter],
  );

  useEffect(() => {
    loadList("open");
    start(async () => {
      const res = await cannedRepliesAction();
      if (res?.ok && res.data) setCanned(res.data);
    });
    const unlock = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLiveEvent((type, data) => {
    if (type !== "support.message") return;
    // A restaurant wrote: a sound, then the list (and the open conversation) refresh.
    if (!data.fromSupport && audio.current) chime(audio.current);
    if (selected && data.conversationId === selected) loadDetail(selected);
    else loadList();
  });

  const select = (id: string) => {
    setSelected(id);
    setDetail(null);
    setDraft("");
    setError(null);
    loadDetail(id);
  };

  return (
    <div className="grid min-h-[calc(100dvh-10rem)] gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section
        className={cn(
          "flex min-h-0 flex-col rounded-3xl border border-border bg-surface",
          selected && "max-lg:hidden",
        )}
      >
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-extrabold">{t("inbox")}</h2>
            <span className="text-xs text-fg-muted">
              {t("counts", { open: counts.open, unread: counts.unread })}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  loadList(f);
                }}
                className={cn(
                  "h-8 rounded-lg text-xs font-bold",
                  filter === f ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted",
                )}
              >
                {t(`filters.${f}`)}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {rows === null ? (
            <li className="m-3 h-20 animate-pulse rounded-2xl bg-surface-2" />
          ) : rows.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-fg-muted">{t("inboxEmpty")}</li>
          ) : (
            rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => select(r.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-2",
                    selected === r.id && "bg-accent-soft/60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-2 size-2 shrink-0 rounded-full",
                      r.unread ? "bg-danger" : "bg-transparent",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">{r.restaurant}</span>
                      <span className="shrink-0 text-[11px] text-fg-subtle">
                        <TimeAgo date={r.lastMessageAt} timeZone="Asia/Tehran" />
                      </span>
                    </span>
                    <span
                      className={cn("block truncate text-sm", r.unread ? "font-semibold" : "text-fg-muted")}
                    >
                      {r.subject}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-fg-subtle">{r.last}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section
        className={cn(
          "flex min-h-0 flex-col rounded-3xl border border-border bg-surface",
          !selected && "max-lg:hidden",
        )}
      >
        {!selected ? (
          <div className="grid flex-1 place-items-center p-10 text-center text-fg-muted">
            <div>
              <MessageSquareText className="mx-auto size-10 opacity-50" aria-hidden="true" />
              <p className="mt-3 text-sm">{t("pickConversation")}</p>
            </div>
          </div>
        ) : !detail ? (
          <div className="m-4 h-60 animate-pulse rounded-3xl bg-surface-2" />
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="grid size-9 place-items-center rounded-full hover:bg-surface-2 lg:hidden"
                aria-label={t("back")}
              >
                <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold">{detail.conv.subject}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
                  <span className="inline-flex items-center gap-1 font-semibold text-fg">
                    <Store className="size-3.5" aria-hidden="true" />
                    {detail.restaurant.name}
                  </span>
                  {detail.restaurant.city ? <span>{detail.restaurant.city}</span> : null}
                  {detail.openedBy?.name ? <span>{detail.openedBy.name}</span> : null}
                  {detail.openedBy?.email ? (
                    <a href={`mailto:${detail.openedBy.email}`} className="underline" dir="ltr">
                      {detail.openedBy.email}
                    </a>
                  ) : null}
                  {detail.restaurant.phone ? (
                    <a href={`tel:${detail.restaurant.phone}`} className="underline" dir="ltr">
                      {detail.restaurant.phone}
                    </a>
                  ) : null}
                  {detail.conv.context.page ? (
                    <code className="rounded bg-surface-2 px-1.5 text-xs" dir="ltr">
                      {detail.conv.context.page}
                    </code>
                  ) : null}
                </p>
              </div>
              <StatusChip status={detail.conv.status} />
              {detail.conv.status === "resolved" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await teamStatusAction(detail.conv.id, "open");
                      loadDetail(detail.conv.id);
                    })
                  }
                  className="kashi-btn inline-flex h-9 items-center gap-1.5 bg-surface-2 px-3 text-sm font-bold"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {t("reopen")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await teamStatusAction(detail.conv.id, "resolved");
                      loadDetail(detail.conv.id);
                    })
                  }
                  className="kashi-btn inline-flex h-9 items-center gap-1.5 bg-success px-3 text-sm font-bold text-white"
                >
                  <Check className="size-4" aria-hidden="true" />
                  {t("resolve")}
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ChatThread messages={detail.messages} mineIsSupport timeZone="Asia/Tehran" />
              {detail.others.length ? (
                <div className="mt-6 rounded-2xl bg-surface-2 p-3">
                  <p className="mb-2 text-xs font-bold text-fg-muted">{t("history")}</p>
                  <ul className="space-y-1">
                    {detail.others.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => select(o.id)}
                          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-sm hover:bg-surface"
                        >
                          <span className="min-w-0 flex-1 truncate">{o.subject}</span>
                          <StatusChip status={o.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="space-y-2 border-t border-border p-3">
              {canned.length ? (
                <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto">
                  {canned.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setDraft((d) => (d ? `${d}\n${c.body}` : c.body))}
                      className="kashi-btn inline-flex h-8 shrink-0 items-center gap-1 bg-surface-2 px-3 text-xs font-semibold [--cut:5px] hover:bg-surface-3"
                    >
                      <Zap className="size-3.5 text-accent-text" aria-hidden="true" />
                      {c.title}
                    </button>
                  ))}
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <ChatComposer
                value={draft}
                onChange={setDraft}
                pending={pending}
                placeholder={t("teamReplyPlaceholder")}
                onSend={(body) =>
                  start(async () => {
                    const res = await teamReplyAction(detail.conv.id, body);
                    if (res?.ok) {
                      setError(null);
                      loadDetail(detail.conv.id);
                    } else {
                      setDraft(body);
                      setError(t("errors.generic"));
                    }
                  })
                }
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
