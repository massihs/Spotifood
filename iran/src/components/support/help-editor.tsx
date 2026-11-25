"use client";

import { BookOpen, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import {
  deleteArticleAction,
  deleteCannedAction,
  saveArticleAction,
  saveCannedAction,
} from "@/app/[locale]/admin/support/actions";

type Article = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  body: string;
  keywords: string;
  audience: string;
  sortOrder: number;
  published: boolean;
};
type Canned = { id: string; title: string; body: string };

const field =
  "mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[var(--ring)]";

/** The team edits the help center's articles and its ready answers. */
export function HelpEditor({ articles, canned }: { articles: Article[]; canned: Canned[] }) {
  const t = useTranslations("support");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Partial<Article> | null>(null);
  const [cannedEdit, setCannedEdit] = useState<Partial<Canned> | null>(null);
  const [locale, setLocale] = useState("fa");
  const [error, setError] = useState<string | null>(null);
  const shown = articles.filter((a) => a.locale === locale);
  const locales = [...new Set(["fa", "en", "ar", ...articles.map((a) => a.locale)])];

  const run = (fn: () => Promise<{ ok: boolean } | undefined | null>, done: () => void) =>
    start(async () => {
      const res = await fn();
      if (res?.ok) {
        setError(null);
        done();
        router.refresh();
      } else setError(t("errors.generic"));
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="rounded-3xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 font-extrabold">
            <BookOpen className="size-5 text-accent-text" aria-hidden="true" />
            {t("articles")}
          </h2>
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {locales.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={cn(
                  "h-8 rounded-lg px-3 text-xs font-bold uppercase",
                  locale === l ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing({ locale, audience: "restaurant", published: true, sortOrder: 0 })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("newArticle")}
          </button>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {shown.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="text-xs text-fg-muted" dir="ltr" style={{ textAlign: "start" }}>
                  {a.slug} · {a.audience}
                  {a.published ? "" : " · draft"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(a)}
                aria-label={t("edit")}
                className="grid size-9 place-items-center rounded-full hover:bg-surface-2"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() =>
                  window.confirm(t("deleteConfirm")) &&
                  run(
                    () => deleteArticleAction(a.id),
                    () => undefined,
                  )
                }
                aria-label={t("delete")}
                className="grid size-9 place-items-center rounded-full text-danger hover:bg-danger-soft"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="py-8 text-center text-sm text-fg-muted">{t("noArticles")}</li>
          ) : null}
        </ul>
      </section>

      <section className="h-fit rounded-3xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 font-extrabold">
            <Zap className="size-5 text-accent-text" aria-hidden="true" />
            {t("cannedTitle")}
          </h2>
          <button
            type="button"
            onClick={() => setCannedEdit({})}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-bold"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("newCanned")}
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">{t("cannedHint")}</p>
        <ul className="mt-3 space-y-2">
          {canned.map((c) => (
            <li key={c.id} className="rounded-2xl bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 truncate font-semibold">{c.title}</p>
                <button
                  type="button"
                  onClick={() => setCannedEdit(c)}
                  aria-label={t("edit")}
                  className="grid size-8 place-items-center rounded-full hover:bg-surface"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.confirm(t("deleteConfirm")) &&
                    run(
                      () => deleteCannedAction(c.id),
                      () => undefined,
                    )
                  }
                  aria-label={t("delete")}
                  className="grid size-8 place-items-center rounded-full text-danger hover:bg-danger-soft"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-danger xl:col-span-2">
          {error}
        </p>
      ) : null}

      {editing ? (
        <Modal title={editing.id ? t("editArticle") : t("newArticle")} onClose={() => setEditing(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                () =>
                  saveArticleAction(editing.id ?? null, {
                    locale: f.get("locale"),
                    slug: f.get("slug"),
                    title: f.get("title"),
                    body: f.get("body"),
                    keywords: f.get("keywords"),
                    audience: f.get("audience"),
                    sortOrder: f.get("sortOrder"),
                    published: f.get("published") === "on",
                  }),
                () => setEditing(null),
              );
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              <label className="text-sm font-medium">
                {t("fields.locale")}
                <select name="locale" defaultValue={editing.locale} className={field}>
                  {["fa", "en", "ar"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {t("fields.audience")}
                <select name="audience" defaultValue={editing.audience} className={field}>
                  {["restaurant", "guest", "all"].map((l) => (
                    <option key={l} value={l}>
                      {t(`audience.${l}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {t("fields.order")}
                <input
                  name="sortOrder"
                  type="number"
                  defaultValue={editing.sortOrder ?? 0}
                  className={field}
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              {t("fields.slug")}
              <input name="slug" required defaultValue={editing.slug} dir="ltr" className={field} />
            </label>
            <label className="block text-sm font-medium">
              {t("fields.title")}
              <input name="title" required maxLength={160} defaultValue={editing.title} className={field} />
            </label>
            <label className="block text-sm font-medium">
              {t("fields.body")}
              <textarea name="body" required rows={9} defaultValue={editing.body} className={field} />
            </label>
            <label className="block text-sm font-medium">
              {t("fields.keywords")}
              <input name="keywords" defaultValue={editing.keywords} className={field} />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input name="published" type="checkbox" defaultChecked={editing.published ?? true} />
              {t("fields.published")}
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-full bg-accent font-bold text-accent-fg disabled:opacity-60"
            >
              {t("save")}
            </button>
          </form>
        </Modal>
      ) : null}

      {cannedEdit ? (
        <Modal title={cannedEdit.id ? t("edit") : t("newCanned")} onClose={() => setCannedEdit(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                () =>
                  saveCannedAction(cannedEdit.id ?? null, {
                    title: String(f.get("title") ?? ""),
                    body: String(f.get("body") ?? ""),
                  }),
                () => setCannedEdit(null),
              );
            }}
          >
            <label className="block text-sm font-medium">
              {t("fields.title")}
              <input name="title" required maxLength={80} defaultValue={cannedEdit.title} className={field} />
            </label>
            <label className="block text-sm font-medium">
              {t("fields.body")}
              <textarea name="body" required rows={6} defaultValue={cannedEdit.body} className={field} />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-full bg-accent font-bold text-accent-fg disabled:opacity-60"
            >
              {t("save")}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" aria-label="close" onClick={onClose} className="absolute inset-0" />
      <div className="relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl bg-bg p-5 shadow-[var(--shadow-float)]">
        <p className="mb-4 text-lg font-extrabold">{title}</p>
        {children}
      </div>
    </div>
  );
}
