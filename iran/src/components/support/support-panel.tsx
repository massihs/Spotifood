"use client";

import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Headset,
  LifeBuoy,
  MessageCircleQuestion,
  MessagesSquare,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "@/i18n/navigation";
import { useLiveEvent } from "@/components/realtime/live";
import { TimeAgo } from "@/components/ui/time-ago";
import { cn } from "@/lib/cn";
import {
  helpArticleAction,
  helpSearchAction,
  sendSupportAction,
  startSupportAction,
  supportConversationAction,
  supportOverviewAction,
} from "@/app/[locale]/dashboard/[restaurantId]/support-actions";
import { ChatComposer, ChatThread, StatusChip, type ChatMessage } from "./chat-parts";

type Conversation = {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: Date | string;
  unread: boolean;
  last: string | null;
};
type Article = { slug: string; title: string; excerpt?: string };
type View =
  | { kind: "home" }
  | { kind: "article"; slug: string; title: string; body: string }
  | { kind: "new" }
  | { kind: "chat"; id: string };

/**
 * "Help & support" in the dashboard's top bar: how-to articles found as you type, and a live
 * conversation with the Spotifood team when they are not enough.
 */
export function SupportPanel({
  restaurantId,
  initialUnread,
  timeZone,
}: {
  restaurantId: string;
  initialUnread: number;
  timeZone: string;
}) {
  const t = useTranslations("support");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [view, setView] = useState<View>({ kind: "home" });
  const [tab, setTab] = useState<"help" | "chats">("help");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Article[] | null>(null);
  const [draft, setDraft] = useState("");
  const [suggested, setSuggested] = useState<Article[]>([]);
  const [chat, setChat] = useState<{ subject: string; status: string; messages: ChatMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const loadOverview = useCallback(
    () =>
      start(async () => {
        const res = await supportOverviewAction(restaurantId);
        if (res?.ok && res.data) {
          setConversations(res.data.conversations as Conversation[]);
          setArticles(res.data.articles);
          setUnread(res.data.unread);
        }
      }),
    [restaurantId],
  );
  const loadChat = useCallback(
    (id: string) =>
      start(async () => {
        const res = await supportConversationAction(restaurantId, id);
        if (res?.ok && res.data) {
          setChat({ subject: res.data.subject, status: res.data.status, messages: res.data.messages });
          const again = await supportOverviewAction(restaurantId);
          if (again?.ok && again.data) {
            setConversations(again.data.conversations as Conversation[]);
            setUnread(again.data.unread);
          }
        }
      }),
    [restaurantId],
  );

  // An answer from the team: the badge, and the open conversation, update at once.
  useLiveEvent((type, data) => {
    if (type !== "support.message") return;
    if (open && view.kind === "chat" && data.conversationId === view.id) loadChat(view.id);
    else if (data.fromSupport) {
      setUnread((n) => n + 1);
      if (open) loadOverview();
    }
  });

  // Search as you type (help tab), and suggestions under a new question.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = (q: string, into: (a: Article[] | null) => void) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) return into(null);
    debounce.current = setTimeout(async () => {
      const res = await helpSearchAction(restaurantId, q);
      if (res?.ok && res.data) into(res.data);
    }, 250);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const openArticle = (slug: string) =>
    start(async () => {
      const res = await helpArticleAction(restaurantId, slug);
      if (res?.ok && res.data) setView({ kind: "article", ...res.data });
    });
  const openChat = (id: string) => {
    setChat(null);
    setView({ kind: "chat", id });
    loadChat(id);
  };
  const fail = (code?: string) =>
    setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

  const articleList = (list: Article[]) => (
    <ul className="space-y-1.5">
      {list.map((a) => (
        <li key={a.slug}>
          <button
            type="button"
            onClick={() => openArticle(a.slug)}
            className="flex w-full items-start gap-3 rounded-2xl p-3 text-start ring-1 ring-border/70 transition-colors hover:bg-surface-2"
          >
            <BookOpen className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold">{a.title}</span>
              {a.excerpt ? (
                <span className="mt-0.5 line-clamp-2 block text-sm text-fg-muted">{a.excerpt}</span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const back = (
    <button
      type="button"
      onClick={() => {
        setView({ kind: "home" });
        setError(null);
        loadOverview();
      }}
      className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-sm font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
    >
      <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
      {t("back")}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setView({ kind: "home" });
          loadOverview();
        }}
        aria-label={t("open", { count: unread })}
        title={t("title")}
        className="relative grid size-10 place-items-center rounded-full bg-surface-2 text-fg hover:bg-surface-3"
      >
        <LifeBuoy className="size-5" aria-hidden="true" />
        {unread ? (
          <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white tabular-nums ring-2 ring-bg">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[58] flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
        >
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
            className="animate-fade-in absolute inset-0 bg-black/40"
          />
          <div className="animate-sheet-up relative flex h-dvh w-full flex-col bg-bg shadow-[var(--shadow-float)] sm:w-[27rem] sm:animate-none">
            <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-accent text-accent-fg">
                <Headset className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{t("title")}</p>
                <p className="text-xs text-fg-muted">{t("subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="grid size-9 place-items-center rounded-full hover:bg-surface-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>

            {view.kind === "home" ? (
              <>
                <div className="grid grid-cols-2 gap-1 border-b border-border bg-surface p-2" role="tablist">
                  {(
                    [
                      ["help", BookOpen, t("tabs.help")],
                      ["chats", MessagesSquare, t("tabs.chats")],
                    ] as const
                  ).map(([id, Icon, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={tab === id}
                      onClick={() => setTab(id)}
                      className={cn(
                        "relative flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold",
                        tab === id ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                      {id === "chats" && unread ? (
                        <span className="size-2 rounded-full bg-danger" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {tab === "help" ? (
                    <div className="space-y-4">
                      <label className="relative block">
                        <span className="sr-only">{t("searchHelp")}</span>
                        <Search
                          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            search(e.target.value, setResults);
                          }}
                          placeholder={t("searchHelp")}
                          className="h-12 w-full rounded-2xl border border-border bg-surface ps-10 pe-4 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--ring)]"
                        />
                      </label>
                      {results ? (
                        results.length ? (
                          articleList(results)
                        ) : (
                          <p className="rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">
                            {t("noResults")}
                          </p>
                        )
                      ) : (
                        articleList(articles)
                      )}
                      <div className="rounded-3xl bg-accent-soft p-4">
                        <p className="flex items-center gap-2 font-bold">
                          <MessageCircleQuestion className="size-5 text-accent-text" aria-hidden="true" />
                          {t("notFound")}
                        </p>
                        <p className="mt-1 text-sm text-fg-muted">{t("notFoundHint")}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(query);
                            setSuggested([]);
                            setView({ kind: "new" });
                          }}
                          className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-fg"
                        >
                          <Headset className="size-4" aria-hidden="true" />
                          {t("talkToUs")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft("");
                          setSuggested([]);
                          setView({ kind: "new" });
                        }}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-sm font-bold text-accent-fg"
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        {t("newChat")}
                      </button>
                      {conversations.length === 0 ? (
                        <p className="py-10 text-center text-sm text-fg-muted">{t("noChats")}</p>
                      ) : (
                        <ul className="space-y-2">
                          {conversations.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => openChat(c.id)}
                                className={cn(
                                  "flex w-full items-start gap-3 rounded-2xl p-3 text-start ring-1 transition-colors hover:bg-surface-2",
                                  c.unread ? "bg-accent-soft/50 ring-accent/30" : "ring-border/70",
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate font-bold">{c.subject}</span>
                                    {c.unread ? (
                                      <span
                                        className="size-2 shrink-0 rounded-full bg-danger"
                                        aria-hidden="true"
                                      />
                                    ) : null}
                                  </span>
                                  <span className="mt-0.5 block truncate text-sm text-fg-muted">
                                    {c.last}
                                  </span>
                                  <span className="mt-1 block text-xs text-fg-subtle">
                                    <TimeAgo date={c.lastMessageAt} timeZone={timeZone} />
                                  </span>
                                </span>
                                <StatusChip status={c.status} />
                                <ChevronLeft
                                  className="mt-1 size-4 shrink-0 text-fg-subtle ltr:rotate-180"
                                  aria-hidden="true"
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : view.kind === "article" ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {back}
                <article className="mt-2 rounded-3xl bg-surface p-5 ring-1 ring-border/70">
                  <h2 className="text-xl font-extrabold tracking-tight">{view.title}</h2>
                  <p className="mt-3 text-[15px] leading-8 whitespace-pre-line">{view.body}</p>
                </article>
                <div className="mt-4 rounded-3xl bg-surface-2 p-4 text-sm">
                  <p className="font-semibold">{t("stillStuck")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(`${view.title}: `);
                      setSuggested([]);
                      setView({ kind: "new" });
                    }}
                    className="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 font-bold ring-1 ring-border"
                  >
                    <Headset className="size-4" aria-hidden="true" />
                    {t("talkToUs")}
                  </button>
                </div>
              </div>
            ) : view.kind === "new" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {back}
                  <p className="mt-2 text-lg font-extrabold">{t("newChatTitle")}</p>
                  <p className="mt-1 text-sm text-fg-muted">{t("newChatHint")}</p>
                  {suggested.length ? (
                    <div className="mt-4">
                      <p className="mb-2 text-sm font-bold text-accent-text">{t("maybeThis")}</p>
                      {articleList(suggested)}
                    </div>
                  ) : null}
                  {error ? (
                    <p role="alert" className="mt-3 text-sm font-medium text-danger">
                      {error}
                    </p>
                  ) : null}
                </div>
                <div className="border-t border-border bg-surface p-3">
                  <ChatComposer
                    value={draft}
                    onChange={(v) => {
                      setDraft(v);
                      search(v, (a) => setSuggested(a ?? []));
                    }}
                    pending={pending}
                    autoFocus
                    placeholder={t("questionPlaceholder")}
                    onSend={(body) =>
                      start(async () => {
                        setError(null);
                        const res = await startSupportAction(restaurantId, { body, page: pathname });
                        if (res?.ok && res.data) {
                          setTab("chats");
                          openChat(res.data.id);
                        } else {
                          setDraft(body);
                          fail(res?.ok === false ? res.error : undefined);
                        }
                      })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
                  {back}
                  <p className="min-w-0 flex-1 truncate font-bold">{chat?.subject ?? "…"}</p>
                  {chat ? <StatusChip status={chat.status} /> : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {chat ? (
                    <>
                      <ChatThread messages={chat.messages} mineIsSupport={false} timeZone={timeZone} />
                      {chat.messages.every((m) => !m.fromSupport) ? (
                        <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-center text-sm text-fg-muted">
                          {t("waitingAnswer")}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="h-40 animate-pulse rounded-3xl bg-surface-2" />
                  )}
                  {error ? (
                    <p role="alert" className="mt-3 text-sm font-medium text-danger">
                      {error}
                    </p>
                  ) : null}
                </div>
                <div className="border-t border-border bg-surface p-3">
                  <ChatComposer
                    pending={pending}
                    placeholder={t("replyPlaceholder")}
                    onSend={(body) =>
                      start(async () => {
                        setError(null);
                        const res = await sendSupportAction(restaurantId, view.id, body);
                        if (res?.ok) loadChat(view.id);
                        else fail(res?.error);
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
