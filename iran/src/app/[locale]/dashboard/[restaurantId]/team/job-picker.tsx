"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { JOBS, STATION_JOBS, type Job } from "@/lib/jobs";
import { setMemberJobAction } from "./actions";
import { JOB_ICONS, JOB_TONES } from "./job-meta";

/** Inline job (and station) picker of a team row; saves on change. */
export function JobPicker({
  restaurantId,
  memberId,
  job,
  stationId,
  stations,
  allowManager,
  disabled,
}: {
  restaurantId: string;
  memberId: string;
  job: string | null;
  stationId: string | null;
  stations: { id: string; name: string }[];
  allowManager: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("team.jobs");
  const tErr = useTranslations("errorCodes");
  const [value, setValue] = useState(job ?? "");
  const [station, setStation] = useState(stationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (j: string, s: string) =>
    start(async () => {
      setError(null);
      const res = await setMemberJobAction(restaurantId, memberId, j || null, s || null);
      if (res && !res.ok) setError(tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
    });
  const Icon = JOBS.includes(value as Job) ? JOB_ICONS[value as Job] : null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          value ? JOB_TONES[value as Job] : "bg-surface-2 text-fg-subtle",
        )}
        aria-hidden="true"
      >
        {Icon ? <Icon className="size-4" /> : "—"}
      </span>
      <select
        value={value}
        disabled={disabled || pending}
        aria-label={t("label")}
        onChange={(e) => {
          setValue(e.target.value);
          save(e.target.value, STATION_JOBS.includes(e.target.value as Job) ? station : "");
        }}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
      >
        <option value="">{t("none")}</option>
        {JOBS.filter((j) => allowManager || j !== "manager").map((j) => (
          <option key={j} value={j}>
            {t(`${j}.name`)}
          </option>
        ))}
      </select>
      {STATION_JOBS.includes(value as Job) && stations.length ? (
        <select
          value={station}
          disabled={disabled || pending}
          aria-label={t("station")}
          onChange={(e) => {
            setStation(e.target.value);
            save(value, e.target.value);
          }}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
        >
          <option value="">{t("allStations")}</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
