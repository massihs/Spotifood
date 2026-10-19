import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import { JOBS } from "@/lib/jobs";
import { JOB_ICONS, JOB_TONES } from "./job-meta";

/** What each job sees and can do, so the owner picks the right one. */
export async function JobGuide() {
  const t = await getTranslations("team.jobs");
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {JOBS.map((j) => {
        const Icon = JOB_ICONS[j];
        return (
          <div key={j} className="rounded-2xl border border-border bg-surface p-4">
            <span
              className={cn("grid size-10 place-items-center rounded-xl", JOB_TONES[j])}
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>
            <p className="mt-3 font-semibold">{t(`${j}.name`)}</p>
            <p className="mt-1 text-xs leading-5 text-fg-muted">{t(`${j}.desc`)}</p>
          </div>
        );
      })}
    </div>
  );
}
