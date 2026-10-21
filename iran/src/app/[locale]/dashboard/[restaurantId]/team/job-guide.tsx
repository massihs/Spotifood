import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import { JOBS } from "@/lib/jobs";
import { JOB_ICONS, JOB_TONES } from "./job-meta";

/** What each job sees and can do, so the owner picks the right one. */
export async function JobGuide({ counts = {} }: { counts?: Partial<Record<string, number>> }) {
  const t = await getTranslations("team.jobs");
  return (
    // Phones: one swipeable row instead of five full-width cards before the team list.
    <div className="-mx-4 mb-6 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
      {JOBS.map((j) => {
        const Icon = JOB_ICONS[j];
        return (
          <div
            key={j}
            className="w-56 shrink-0 snap-start rounded-2xl border border-border bg-surface p-4 sm:w-auto"
          >
            <span
              className={cn("grid size-10 place-items-center rounded-xl", JOB_TONES[j])}
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>
            <p className="mt-3 flex items-center justify-between gap-2 font-semibold">
              {t(`${j}.name`)}
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-fg-muted tabular-nums">
                {counts[j] ?? 0}
              </span>
            </p>
            <p className="mt-1 text-xs leading-5 text-fg-muted">{t(`${j}.desc`)}</p>
          </div>
        );
      })}
    </div>
  );
}
