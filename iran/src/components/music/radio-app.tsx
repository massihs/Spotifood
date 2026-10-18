"use client";

import { Library, Pause, Play, Radio, Signal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Cover, Equalizer, Mosaic } from "./cover";
import { fmt, Progress, SPOTIFY_GREEN, useRadio, VolumeControl } from "./players";

export type Station = {
  slug: string;
  name: string;
  description: string | null;
  color: string;
  cover: string | null;
  mosaic: string[];
  trackCount: number;
  minutes: number;
};

function BigPlay({
  on,
  loading,
  onClick,
  label,
}: {
  on: boolean;
  loading?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-14 shrink-0 place-items-center rounded-full text-black shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 active:scale-95"
      style={{ background: SPOTIFY_GREEN }}
    >
      {loading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
      ) : on ? (
        <Pause className="size-6 fill-current" aria-hidden="true" />
      ) : (
        <Play className="size-6 translate-x-[1px] fill-current" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Spotify-style live radio: station library, a station page with artwork and the songs on air,
 * and a fixed player bar. Every listener hears the same second of the same song.
 */
export function RadioApp({ stations, initialSlug }: { stations: Station[]; initialSlug: string }) {
  const t = useTranslations("music.radio");
  const [slug, setSlug] = useState(initialSlug);
  const wantPlay = useRef(false);
  const r = useRadio(slug);
  const station = stations.find((s) => s.slug === slug) ?? stations[0]!;
  const on = r.state === "playing";
  const live = r.live?.station.slug === slug ? r.live : null;

  // Switching station from a click keeps playing (the click is the user gesture).
  useEffect(() => {
    if (wantPlay.current) void r.tune();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const pick = (s: string, play: boolean) => {
    wantPlay.current = play;
    if (s === slug) {
      if (play && !on) void r.tune();
      return;
    }
    setSlug(s);
    const url = new URL(window.location.href);
    url.searchParams.set("s", s);
    window.history.replaceState(null, "", url);
  };
  const toggle = () => (on ? r.stop() : ((wantPlay.current = true), void r.tune()));
  const art = live?.track.cover ?? station.cover;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:pb-24">
      {/* Library */}
      <aside className="rounded-lg bg-[#121212] p-2 lg:sticky lg:top-2 lg:h-[calc(100dvh-7.5rem)] lg:overflow-y-auto">
        <p className="flex items-center gap-3 px-3 py-3 font-bold text-white/80">
          <Library className="size-6" aria-hidden="true" />
          {t("stations")}
        </p>
        <ul className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible">
          {stations.map((s) => {
            const active = s.slug === slug;
            return (
              <li key={s.slug} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => pick(s.slug, on)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-56 items-center gap-3 rounded-md p-2 text-start transition-colors lg:w-full",
                    active ? "bg-white/10" : "hover:bg-white/5",
                  )}
                >
                  <Mosaic
                    covers={s.cover ? [s.cover] : s.mosaic}
                    color={s.color}
                    className="size-12"
                    rounded="rounded"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate font-medium",
                        active && on ? "text-[#1ed760]" : "text-white",
                      )}
                    >
                      {s.name}
                    </span>
                    <span className="block truncate text-sm text-white/60">
                      {t("stationMeta", { count: s.trackCount })}
                    </span>
                  </span>
                  {active && on ? <Equalizer on className="text-[#1ed760]" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Station page */}
      <main className="min-w-0 overflow-hidden rounded-lg bg-[#121212]">
        <section
          className="flex flex-col gap-6 px-5 pt-10 pb-6 sm:flex-row sm:items-end sm:px-8"
          style={{
            background: `linear-gradient(180deg, ${station.color}cc 0%, ${station.color}55 60%, #121212 100%)`,
          }}
        >
          <Cover
            src={art}
            color={station.color}
            alt={station.name}
            className="size-48 sm:size-56"
            rounded="rounded-md"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Signal className="size-4" aria-hidden="true" />
              {t("liveStation")}
            </p>
            <h1 className="mt-2 text-4xl leading-none font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
              {station.name}
            </h1>
            {station.description ? <p className="mt-4 text-sm text-white/75">{station.description}</p> : null}
            <p className="mt-2 text-sm text-white/80">
              <b>Spotifood</b> · {t("stationMeta", { count: station.trackCount })} ·{" "}
              {t("minutes", { count: station.minutes })}
            </p>
          </div>
        </section>

        <div className="bg-gradient-to-b from-black/25 to-transparent px-5 pt-5 pb-8 sm:px-8">
          <div className="flex items-center gap-5">
            <BigPlay
              on={on}
              loading={r.state === "loading"}
              onClick={toggle}
              label={on ? t("stop") : t("listen")}
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-bold text-white">
              <span className={cn("size-2 rounded-full bg-red-500", on && "animate-pulse")} />
              {t("live")}
            </span>
            {r.state === "error" ? <span className="text-sm text-red-300">{t("offAir")}</span> : null}
          </div>

          {live ? (
            <div className="mt-8">
              <div className="grid grid-cols-[2rem_1fr_auto] gap-3 border-b border-white/10 px-3 pb-2 text-xs text-white/60">
                <span className="text-center">#</span>
                <span>{t("titleCol")}</span>
                <span>{t("durationCol")}</span>
              </div>
              <ol className="mt-2 space-y-0.5">
                {[live.track, ...live.upNext].map((tr, i) => (
                  <li
                    key={`${tr.id}-${i}`}
                    className={cn(
                      "grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-3 py-2",
                      i === 0 ? "bg-white/10" : "hover:bg-white/5",
                    )}
                  >
                    <span
                      className={cn(
                        "text-center text-sm tabular-nums",
                        i === 0 ? "text-[#1ed760]" : "text-white/60",
                      )}
                    >
                      {i === 0 ? <Equalizer on={on} className="mx-auto" /> : i + 1}
                    </span>
                    <span className="flex min-w-0 items-center gap-3">
                      <Cover src={tr.cover} color={station.color} className="size-10" rounded="rounded" />
                      <span className="min-w-0">
                        <span
                          className={cn("block truncate", i === 0 ? "text-[#1ed760]" : "text-white")}
                          dir="auto"
                        >
                          {tr.title}
                        </span>
                        <span className="block truncate text-sm text-white/60" dir="auto">
                          {tr.artist ?? "—"}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm text-white/60 tabular-nums">
                      {i === 0 ? t("onAir") : fmt(tr.durationSec)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="mt-8 rounded-lg bg-white/5 px-5 py-6 text-sm text-white/70">{t("tapToListen")}</p>
          )}

          {stations.length > 1 ? (
            <div className="mt-10">
              <h2 className="mb-4 text-2xl font-bold text-white">{t("moreStations")}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {stations
                  .filter((s) => s.slug !== slug)
                  .map((s) => (
                    <button
                      key={s.slug}
                      type="button"
                      onClick={() => pick(s.slug, true)}
                      className="group rounded-lg bg-[#181818] p-3 text-start transition-colors hover:bg-[#282828]"
                    >
                      <span className="relative block">
                        <Mosaic
                          covers={s.cover ? [s.cover] : s.mosaic}
                          color={s.color}
                          className="w-full"
                          rounded="rounded-md"
                        />
                        <span
                          className="absolute end-2 bottom-2 grid size-11 translate-y-2 place-items-center rounded-full text-black opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100"
                          style={{ background: SPOTIFY_GREEN }}
                          aria-hidden="true"
                        >
                          <Play className="size-5 fill-current" />
                        </span>
                      </span>
                      <span className="mt-3 block truncate font-bold text-white">{s.name}</span>
                      <span className="mt-1 line-clamp-2 block text-sm text-white/60">
                        {s.description ?? t("stationMeta", { count: s.trackCount })}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* Player bar */}
      <footer className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/10 bg-black px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:grid-cols-[1fr_2fr_1fr] lg:px-4 lg:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Cover src={art} color={station.color} className="size-12 lg:size-14" rounded="rounded" />
          <div className="min-w-0">
            <p
              className={cn("truncate text-sm font-semibold", on ? "text-white" : "text-white/80")}
              dir="auto"
            >
              {live?.track.title ?? station.name}
            </p>
            <p className="truncate text-xs text-white/60" dir="auto">
              {live ? (live.track.artist ?? station.name) : t("liveStation")}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 lg:gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={on ? t("stop") : t("listen")}
            className="grid size-9 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
          >
            {on ? (
              <Pause className="size-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-4 translate-x-[1px] fill-current" aria-hidden="true" />
            )}
          </button>
          <div
            className="hidden w-full max-w-xl items-center gap-2 text-[11px] text-white/60 tabular-nums lg:flex"
            dir="ltr"
          >
            <span className="w-9 text-end">{live ? fmt(r.time) : "0:00"}</span>
            <Progress value={live ? r.time : 0} max={live?.track.durationSec ?? 1} label={t("onAir")} />
            <span className="w-9">{live ? fmt(live.track.durationSec) : "0:00"}</span>
          </div>
        </div>
        <div className="hidden items-center justify-end gap-4 lg:flex">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70">
            <Radio className="size-4" aria-hidden="true" />
            {t("live")}
          </span>
          <VolumeControl volume={r.volume} onChange={r.setVolume} label={t("volume")} />
        </div>
        {/* Mobile: thin live progress on top of the bar. */}
        <span
          className="absolute inset-x-3 top-0 h-0.5 overflow-hidden rounded-full bg-white/15 lg:hidden"
          aria-hidden="true"
        >
          <span
            className="block h-full bg-white"
            style={{ width: live ? `${(r.time / Math.max(1, live.track.durationSec)) * 100}%` : "0%" }}
          />
        </span>
      </footer>
      {r.element}
    </div>
  );
}
