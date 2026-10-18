"use client";

import {
  ListMusic,
  Loader2,
  Pause,
  Play,
  Radio,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string | null;
  durationSec: number;
  url: string;
};

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Equalizer({ on }: { on: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("w-1 rounded-full bg-current", on ? "animate-[eq_0.9s_ease-in-out_infinite]" : "h-1")}
          style={on ? { animationDelay: `${i * 0.15}s` } : undefined}
        />
      ))}
    </span>
  );
}

/** The restaurant's playlist: plays in order (or shuffled), loops, with a track list. */
export function PlaylistPlayer({
  tracks,
  color,
  title,
  subtitle,
}: {
  tracks: PlayerTrack[];
  color: string;
  title: string;
  subtitle: string;
}) {
  const t = useTranslations("music.player");
  const audio = useRef<HTMLAudioElement>(null);
  const [order, setOrder] = useState(() => tracks.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolume] = useState(1);
  const current = tracks[order[pos] ?? 0];

  const go = useCallback(
    (next: number) => setPos(((next % order.length) + order.length) % order.length),
    [order.length],
  );

  useEffect(() => {
    const a = audio.current;
    if (!a || !current) return;
    a.src = current.url;
    if (playing) void a.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  // Lock screen / Bluetooth controls.
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? title,
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => go(pos + 1));
    navigator.mediaSession.setActionHandler("previoustrack", () => go(pos - 1));
  }, [current, go, pos, title]);

  if (!current) return null;
  const toggle = () => {
    const a = audio.current!;
    if (a.paused)
      void a
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    else {
      a.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-soft)]">
      <div
        className="relative p-5 text-white sm:p-6"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc 55%, #0f172a)` }}
      >
        <p className="text-sm opacity-80">{subtitle}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight">{title}</p>
        <div className="mt-6 flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <Equalizer on={playing} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold" dir="auto">
              {current.title}
            </p>
            <p className="truncate text-sm opacity-75" dir="auto">
              {current.artist ?? t("unknownArtist")}
            </p>
          </div>
        </div>
        <div className="mt-5" dir="ltr">
          <input
            type="range"
            min={0}
            max={current.durationSec || 1}
            step={1}
            value={Math.min(time, current.durationSec)}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.target.value);
            }}
            aria-label={t("seek")}
            className="w-full accent-white"
          />
          <div className="flex justify-between text-xs tabular-nums opacity-75">
            <span>{fmt(time)}</span>
            <span>{fmt(current.durationSec)}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3" dir="ltr">
          <button
            type="button"
            aria-pressed={shuffle}
            aria-label={t("shuffle")}
            onClick={() => {
              const next = !shuffle;
              setShuffle(next);
              const playingIdx = order[pos]!;
              const rest = tracks.map((_, i) => i).filter((i) => i !== playingIdx);
              if (next) rest.sort(() => Math.random() - 0.5);
              setOrder([playingIdx, ...rest]);
              setPos(0);
            }}
            className={cn(
              "grid size-10 place-items-center rounded-full",
              shuffle ? "bg-white/25" : "opacity-70 hover:opacity-100",
            )}
          >
            <Shuffle className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("previous")}
            onClick={() => go(pos - 1)}
            className="grid size-12 place-items-center rounded-full hover:bg-white/15"
          >
            <SkipBack className="size-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={playing ? t("pause") : t("play")}
            onClick={toggle}
            className="grid size-16 place-items-center rounded-full bg-white text-slate-900 shadow-lg transition-transform active:scale-95"
          >
            {playing ? (
              <Pause className="size-7" aria-hidden="true" />
            ) : (
              <Play className="size-7 translate-x-0.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label={t("next")}
            onClick={() => go(pos + 1)}
            className="grid size-12 place-items-center rounded-full hover:bg-white/15"
          >
            <SkipForward className="size-6" aria-hidden="true" />
          </button>
          <span className="grid size-10 place-items-center opacity-70" title={t("loop")}>
            <Repeat className="size-5" aria-hidden="true" />
          </span>
        </div>
        <label className="mx-auto mt-4 flex max-w-xs items-center gap-2 opacity-85" dir="ltr">
          <Volume2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">{t("volume")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-white"
          />
        </label>
      </div>
      <audio
        ref={audio}
        preload="auto"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onEnded={() => go(pos + 1)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-semibold">
        <ListMusic className="size-4 text-accent-text" aria-hidden="true" />
        {t("tracks", { count: tracks.length })}
      </div>
      <ol className="max-h-[28rem] divide-y divide-border overflow-y-auto">
        {order.map((ti, i) => {
          const tr = tracks[ti]!;
          const on = i === pos;
          return (
            <li key={tr.id}>
              <button
                type="button"
                onClick={() => {
                  setPos(i);
                  setPlaying(true);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-5 py-2.5 text-start hover:bg-surface-2",
                  on && "bg-accent-soft/60",
                )}
              >
                <span
                  className={cn(
                    "w-6 shrink-0 text-center text-xs tabular-nums",
                    on ? "text-accent-text" : "text-fg-subtle",
                  )}
                >
                  {on && playing ? <Equalizer on /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      on ? "font-semibold text-accent-text" : "font-medium",
                    )}
                    dir="auto"
                  >
                    {tr.title}
                  </span>
                  {tr.artist ? (
                    <span className="block truncate text-xs text-fg-subtle" dir="auto">
                      {tr.artist}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{fmt(tr.durationSec)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Live = {
  station: { slug: string; name: string; color: string };
  track: PlayerTrack;
  offsetSec: number;
  upNext: PlayerTrack[];
};

/** Live radio: asks the server what is on air and joins the song at the right second. */
export function RadioPlayer({ slug, name, color }: { slug: string; name: string; color: string }) {
  const t = useTranslations("music.radio");
  const audio = useRef<HTMLAudioElement>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");

  const tune = useCallback(async () => {
    const a = audio.current;
    if (!a) return;
    setState("loading");
    try {
      const asked = performance.now();
      const res = await fetch(`/api/v1/music/radio/${slug}`, { cache: "no-store" });
      if (!res.ok) throw new Error("off_air");
      const data = (await res.json()) as Live;
      setLive(data);
      // Listen before setting src (cached files can fire immediately), and force loading.
      const ready = new Promise<void>((resolve, reject) => {
        a.onloadedmetadata = () => resolve();
        a.onerror = () => reject(new Error("load"));
      });
      a.preload = "auto";
      a.src = data.track.url;
      a.load();
      await ready;
      a.currentTime = data.offsetSec + (performance.now() - asked) / 1000;
      await a.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }, [slug]);

  useEffect(() => {
    const a = audio.current;
    return () => a?.pause();
  }, [slug]);

  useEffect(() => {
    if (!live || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: live.track.title,
      artist: live.track.artist ?? name,
      album: name,
    });
  }, [live, name]);

  const on = state === "playing";
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[var(--shadow-float)] sm:p-8"
      style={{ background: `radial-gradient(120% 120% at 100% 0%, ${color}, #0b1220 70%)` }}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide">
          <span className={cn("size-2 rounded-full bg-red-500", on && "animate-pulse")} />
          {t("live")}
        </span>
        <Radio className="size-5 opacity-70" aria-hidden="true" />
      </div>
      <p className="mt-6 text-sm opacity-75">{t("station")}</p>
      <p className="text-3xl font-bold tracking-tight">{name}</p>
      <div className="mt-6 min-h-14">
        {live ? (
          <>
            <p className="text-xs uppercase opacity-60">{t("onAir")}</p>
            <p className="mt-0.5 truncate text-lg font-semibold" dir="auto">
              {live.track.title}
            </p>
            <p className="truncate text-sm opacity-75" dir="auto">
              {live.track.artist ?? "—"}
            </p>
          </>
        ) : (
          <p className="text-sm opacity-75">{t("tapToListen")}</p>
        )}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => (on ? (audio.current?.pause(), setState("idle")) : void tune())}
          aria-label={on ? t("stop") : t("listen")}
          className="grid size-16 shrink-0 place-items-center rounded-full bg-white text-slate-900 shadow-lg transition-transform active:scale-95"
        >
          {state === "loading" ? (
            <Loader2 className="size-7 animate-spin" aria-hidden="true" />
          ) : on ? (
            <Pause className="size-7" aria-hidden="true" />
          ) : (
            <Play className="size-7 translate-x-0.5" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0">
          <p className="font-semibold">{on ? t("listening") : t("listen")}</p>
          {state === "error" ? <p className="text-sm text-red-200">{t("offAir")}</p> : null}
        </div>
      </div>
      {live?.upNext.length ? (
        <div className="mt-6 border-t border-white/15 pt-4">
          <p className="mb-2 text-xs uppercase opacity-60">{t("upNext")}</p>
          <ul className="space-y-1.5 text-sm">
            {live.upNext.map((tr, i) => (
              <li key={`${tr.id}-${i}`} className="flex items-center gap-2 opacity-85">
                <span className="text-xs tabular-nums opacity-60">{i + 1}</span>
                <span className="truncate" dir="auto">
                  {tr.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* When a song ends, ask the clock again: the next song starts at second 0. */}
      <audio ref={audio} preload="none" onEnded={() => void tune()} />
    </div>
  );
}
