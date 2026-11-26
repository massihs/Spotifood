"use client";

import { Headset, SendHorizontal } from "@/components/icons";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { TimeAgo } from "@/components/ui/time-ago";
import { cn } from "@/lib/cn";

export type ChatMessage = {
  id: string;
  body: string;
  fromSupport: boolean;
  createdAt: Date | string;
  author: string | null;
};

/**
 * The messages of a support conversation, oldest first, kept scrolled to the latest. `mine`
 * says which side is the reader's: the restaurant (`false`) or the team (`true`).
 */
export function ChatThread({
  messages,
  mineIsSupport,
  timeZone,
  className,
}: {
  messages: ChatMessage[];
  mineIsSupport: boolean;
  timeZone: string;
  className?: string;
}) {
  const t = useTranslations("support");
  const end = useRef<HTMLDivElement>(null);
  // A block body: scrollIntoView returns a promise in recent browsers, never a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  return (
    <div className={cn("space-y-3", className)}>
      {messages.map((m) => {
        const mine = m.fromSupport === mineIsSupport;
        return (
          <div key={m.id} className={cn("flex flex-col", mine ? "items-start" : "items-end")}>
            {!mine && m.fromSupport ? (
              <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold text-accent-text">
                <Headset className="size-3.5" aria-hidden="true" />
                {t("team")}
              </span>
            ) : !mine && m.author ? (
              <span className="mb-1 text-xs font-semibold text-fg-muted">{m.author}</span>
            ) : null}
            <div
              className={cn(
                "max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-7 break-words whitespace-pre-line",
                mine
                  ? "rounded-ss-md bg-accent text-accent-fg"
                  : "rounded-se-md bg-surface-2 text-fg ring-1 ring-border/60",
              )}
            >
              {m.body}
            </div>
            <span className="mt-1 px-1 text-[11px] text-fg-subtle">
              <TimeAgo date={m.createdAt} timeZone={timeZone} />
            </span>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

/** Text box + send: Enter sends, Shift+Enter starts a new line. */
export function ChatComposer({
  onSend,
  pending,
  placeholder,
  value: controlled,
  onChange,
  autoFocus,
}: {
  onSend: (body: string) => void;
  pending?: boolean;
  placeholder: string;
  value?: string;
  onChange?: (v: string) => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("support");
  const [own, setOwn] = useState("");
  const value = controlled ?? own;
  const set = onChange ?? setOwn;
  const send = () => {
    const body = value.trim();
    if (!body || pending) return;
    onSend(body);
    set("");
  };
  return (
    <div className="flex items-end gap-2 rounded-3xl bg-surface p-2 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent">
      <textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={Math.min(5, Math.max(1, value.split("\n").length))}
        maxLength={4000}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-fg-subtle"
      />
      <button
        type="button"
        onClick={send}
        disabled={!value.trim() || pending}
        aria-label={t("send")}
        title={t("send")}
        className="kashi-tile grid size-10 shrink-0 place-items-center bg-accent text-accent-fg transition-transform active:scale-90 disabled:opacity-40"
      >
        <SendHorizontal className="size-[18px] rtl:-scale-x-100" aria-hidden="true" />
      </button>
    </div>
  );
}

/** open / pending / resolved, as a small chip. */
export function StatusChip({ status }: { status: string }) {
  const t = useTranslations("support.status");
  return (
    <span
      className={cn(
        "kashi-btn inline-flex shrink-0 items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold [--cut:5px]",
        status === "resolved"
          ? "bg-success-soft text-success"
          : status === "pending"
            ? "bg-surface-2 text-fg-muted"
            : "bg-accent-soft text-accent-text",
      )}
    >
      {t(status === "resolved" || status === "pending" ? status : "open")}
    </span>
  );
}
