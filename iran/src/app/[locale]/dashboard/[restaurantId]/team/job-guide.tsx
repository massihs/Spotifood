"use client";

import { Check, Copy, ExternalLink, Link2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { JOBS, type Job } from "@/lib/jobs";
import { TEAM_JOB_ICONS } from "@/lib/team-jobs";
import { deleteTeamJobAction, saveTeamJobAction } from "./actions";
import { JOB_TONES, TEAM_ICONS, type TeamJobView } from "./job-meta";
import { TeamIcon } from "./team-icon";
import { ScreenPicker } from "./screen-picker";
import { cleanScreens, JOB_SCREENS, SCREENS, type Screen } from "@/lib/screens";

/**
 * The restaurant's jobs as it names them (Caisse, Chicha, Réception…), each with its icon and
 * the base job that sets what it can do and see. Tap a card to edit; "New job" adds one.
 */
export function JobGuide({
  restaurantId,
  jobs,
  counts,
  links,
  allowManager,
  kind,
}: {
  restaurantId: string;
  jobs: TeamJobView[];
  counts: Record<string, number>;
  links: Record<string, { url: string; qr: string }>;
  allowManager: boolean;
  kind: string;
}) {
  const t = useTranslations("team.jobs");
  const [edit, setEdit] = useState<TeamJobView | "new" | null>(null);
  const [share, setShare] = useState<TeamJobView | null>(null);
  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-fg-muted">{t("hint")}</p>
        </div>
        <button
          type="button"
          onClick={() => setEdit("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("new")}
        </button>
      </div>
      {/* Phones: one swipeable row instead of a column of cards before the team list. */}
      <div className="-mx-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
        {jobs.map((j) => {
          return (
            <div
              key={j.id}
              className="group relative w-56 shrink-0 snap-start rounded-2xl border border-border bg-surface text-start transition-colors hover:bg-surface-2 sm:w-auto"
            >
              <button type="button" onClick={() => setEdit(j)} className="block w-full p-4 pb-2 text-start">
                <span className="flex items-start justify-between">
                  <span
                    className={cn("grid size-10 place-items-center rounded-xl", JOB_TONES[j.baseJob as Job])}
                    aria-hidden="true"
                  >
                    <TeamIcon name={j.icon} className="size-5" />
                  </span>
                  <Pencil className="size-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 font-semibold">
                  <span className="truncate">{j.name}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-fg-muted tabular-nums">
                    {counts[j.id] ?? 0}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-fg-muted">
                  {t("worksAs", { job: t(`${j.baseJob as Job}.name`) })}
                </span>
              </button>
              {links[j.id] ? (
                <button
                  type="button"
                  onClick={() => setShare(j)}
                  className="mx-4 mb-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-semibold text-fg-muted ring-1 ring-border hover:text-fg"
                >
                  <Link2 className="size-3.5" aria-hidden="true" />
                  {t("link")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {share && links[share.id] ? (
        <StaffLinkSheet job={share} link={links[share.id]!} onClose={() => setShare(null)} />
      ) : null}
      {edit ? (
        <JobSheet
          key={edit === "new" ? "new" : edit.id}
          restaurantId={restaurantId}
          job={edit === "new" ? null : edit}
          held={edit === "new" ? 0 : (counts[edit.id] ?? 0)}
          allowManager={allowManager}
          kind={kind}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </section>
  );
}

function JobSheet({
  restaurantId,
  job,
  held,
  allowManager,
  kind,
  onClose,
}: {
  restaurantId: string;
  job: TeamJobView | null;
  held: number;
  allowManager: boolean;
  kind: string;
  onClose: () => void;
}) {
  const t = useTranslations("team.jobs");
  const tc = useTranslations("common");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(job?.name ?? "");
  const [icon, setIcon] = useState(job?.icon ?? "users");
  const [base, setBase] = useState<Job>((job?.baseJob as Job) ?? "waiter");
  const bases = JOBS.filter((j) => allowManager || j !== "manager" || base === "manager");
  // The job's screens: its own list, else its base job's default (managers: everything).
  const defaultsOf = (b: Job): Screen[] => [...(JOB_SCREENS[b] ?? SCREENS)];
  const [screens, setScreens] = useState<Screen[] | null>(job?.screens ? cleanScreens(job.screens) : null);
  const shown = screens ?? defaultsOf(base);
  return (
    <Sheet title={job ? job.name : t("new")} onClose={onClose}>
      <div className="space-y-5">
        <label className="block text-sm font-medium">
          {t("name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={48}
            className={cn(field, "mt-1")}
            autoFocus
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("icon")}</legend>
          <div className="grid grid-cols-8 gap-2">
            {TEAM_JOB_ICONS.map((k) => {
              const Icon = TEAM_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setIcon(k)}
                  aria-pressed={icon === k}
                  aria-label={k}
                  className={cn(
                    "grid aspect-square place-items-center rounded-xl transition-colors",
                    icon === k
                      ? cn(JOB_TONES[base], "ring-2 ring-current")
                      : "bg-surface-2 text-fg-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{t("base")}</legend>
          <p className="mb-2 text-xs text-fg-muted">{held ? t("baseLocked") : t("baseHint")}</p>
          <div className="space-y-2">
            {bases.map((b) => (
              <button
                key={b}
                type="button"
                disabled={held > 0 && b !== base}
                onClick={() => setBase(b)}
                aria-pressed={base === b}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl p-3 text-start ring-1 transition-colors disabled:opacity-40",
                  base === b ? "bg-accent-soft ring-accent" : "ring-border hover:bg-surface-2",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", JOB_TONES[b])}>
                  <TeamIcon
                    name={
                      {
                        manager: "crown",
                        cashier: "calculator",
                        waiter: "hand-platter",
                        bar: "coffee",
                        kitchen: "chef-hat",
                      }[b]
                    }
                    className="size-4"
                  />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t(`${b}.name`)}</span>
                  <span className="block text-xs leading-5 text-fg-muted">{t(`${b}.desc`)}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{t("screensTitle")}</legend>
          <ScreenPicker value={shown} onChange={setScreens} kind={kind} />
        </fieldset>

        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
        <div className="flex items-center gap-2">
          {job ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(t("deleteConfirm", { name: job.name })) &&
                run(() => deleteTeamJobAction(restaurantId, job.id), onClose)
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-danger ring-1 ring-danger/30"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {tc("delete")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () =>
                  saveTeamJobAction(restaurantId, {
                    ...(job ? { id: job.id } : {}),
                    name,
                    icon: icon as "users",
                    baseJob: base,
                    screens,
                  }),
                onClose,
              )
            }
            className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
          >
            {tc("save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** A job's sign-in link: copy it, open it, or print its QR code for the station's wall. */
function StaffLinkSheet({
  job,
  link,
  onClose,
}: {
  job: TeamJobView;
  link: { url: string; qr: string };
  onClose: () => void;
}) {
  const t = useTranslations("team.jobs");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      const el = document.getElementById("staff-link") as HTMLInputElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function print() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    const name = job.name.replace(/[<>&"]/g, "");
    w.document.write(
      `<!doctype html><meta charset="utf-8"><title>${name}</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:32px"><h1 style="font-size:28px;margin:0 0 16px">${name}</h1><div style="width:320px;margin:auto">${link.qr}</div><p style="font-size:13px;word-break:break-all;color:#555">${link.url}</p></body>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }
  return (
    <Sheet title={t("linkTitle", { job: job.name })} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">{t("linkHint", { job: job.name })}</p>
        <div
          className="mx-auto w-48 overflow-hidden rounded-xl bg-white p-2 ring-1 ring-border [&_svg]:size-full"
          // The QR code is an SVG generated on the server from this link.
          dangerouslySetInnerHTML={{ __html: link.qr }}
        />
        <input
          id="staff-link"
          readOnly
          value={link.url}
          dir="ltr"
          onFocus={(e) => e.currentTarget.select()}
          className={cn(field, "font-mono text-xs")}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? t("copied") : t("copy")}
          </button>
          <a
            href={link.url}
            target="_blank"
            rel="noopener"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {t("open")}
          </a>
          <button
            type="button"
            onClick={print}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3"
          >
            <Printer className="size-4" aria-hidden="true" />
            {t("print")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
