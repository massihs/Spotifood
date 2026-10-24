"use client";

import { Clock, Crown, DoorOpen, Flag, Trophy, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  heartbeatAction,
  moveAction,
  resignAction,
  joinGameAction,
} from "@/app/[locale]/table/games/actions";
import { useLiveEvent } from "@/components/realtime/live";
import { Link } from "@/i18n/navigation";
import type { Color, From, Move, To } from "@/lib/backgammon";
import { cn } from "@/lib/cn";
import type { GameView } from "@/server/modules/games/service";

// Game art (fixed colours, the same in light and dark mode).
const FELT = "#1d4a3c";
const RIM = "#5b3a24";
const TRI = ["#e8dcc0", "#b4532f"];
const CHECKER: Record<Color, { fill: string; ring: string; text: string }> = {
  w: { fill: "#f6f1e6", ring: "#c9bda4", text: "#3b3324" },
  b: { fill: "#27262d", ring: "#57555f", text: "#f1efe9" },
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, used, size = 34 }: { value: number; used?: boolean; size?: number }) {
  return (
    <span
      className={cn(
        "grid grid-cols-3 grid-rows-3 rounded-lg bg-white p-1 shadow-md ring-1 ring-black/10 transition-opacity",
        used && "opacity-30",
      )}
      style={{ width: size, height: size }}
      aria-label={String(value)}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="grid place-items-center">
          {PIPS[value]?.includes(i) ? <span className="size-[5px] rounded-full bg-neutral-900" /> : null}
        </span>
      ))}
    </span>
  );
}

function Checker({
  color,
  size,
  label,
  glow,
}: {
  color: Color;
  size: number;
  label?: string;
  glow?: boolean;
}) {
  const c = CHECKER[color];
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full text-[11px] font-bold",
        glow && "ring-4 ring-amber-300",
      )}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, ${c.fill}, ${c.fill} 55%, ${c.ring})`,
        boxShadow: `inset 0 0 0 2px ${c.ring}, 0 2px 3px rgba(0,0,0,.35)`,
        color: c.text,
        ...(glow ? { outline: "3px solid #fcd34d", outlineOffset: 2 } : {}),
      }}
    >
      {label}
    </span>
  );
}

export function GameBoard({ initial }: { initial: GameView }) {
  const t = useTranslations("games");
  const [view, setView] = useState(initial);
  const [skew, setSkew] = useState(0);
  // The selection belongs to one turn (a new turn clears it).
  const [sel, setSel] = useState<{ turnNo: number; from: From } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  const apply = useCallback((v: GameView) => {
    setView(v);
    setSkew(v.serverNow - Date.now());
  }, []);

  const refresh = useCallback(() => {
    heartbeatAction(initial.id)
      .then((r) => r?.ok && r.data && apply(r.data))
      .catch(() => {});
  }, [initial.id, apply]);

  // At the board: ping every 3 s while visible (keeps the clock running, catches up).
  useEffect(() => {
    refresh();
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), 3000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  useLiveEvent((type, data) => {
    if (type === "game.updated" && data.id === initial.id) refresh();
  });
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = view.state;
  const me = view.me;
  const persp: Color = me ?? "w";
  const opp: Color = persp === "w" ? "b" : "w";
  const myTurn = Boolean(s && view.status === "playing" && me && s.turn === me);

  // A new turn of mine: buzz.
  const lastTurn = useRef(s?.turnNo);
  useEffect(() => {
    if (!s || s.turnNo === lastTurn.current) return;
    lastTurn.current = s.turnNo;
    if (myTurn && "vibrate" in navigator) navigator.vibrate?.(60);
  }, [s, myTurn]);
  const froms = [...new Set(view.legal.map((m) => m.from))];
  const chosen = sel && s && sel.turnNo === s.turnNo && froms.includes(sel.from) ? sel.from : null;
  // Only one checker can move (e.g. from the bar): it is selected already.
  const selected: From | null = chosen ?? (myTurn && froms.length === 1 ? froms[0]! : null);
  const setSelected = (f: From | null) => setSel(f == null || !s ? null : { turnNo: s.turnNo, from: f });

  const play = (m: Move) =>
    start(async () => {
      setError(null);
      const res = await moveAction(view.id, m.from, m.die, s!.turnNo);
      setSelected(null);
      if (res?.ok && res.data) apply(res.data);
      else {
        if (res && !res.ok && res.error !== "stale") setError(t("errors.move"));
        refresh();
      }
    });

  const targets: To[] =
    selected == null ? [] : view.legal.filter((m) => m.from === selected).map((m) => m.to);
  const clickFrom = (f: From) => {
    if (!myTurn || pending) return;
    setSelected(froms.includes(f) ? (selected === f ? null : f) : null);
  };
  const clickTo = (to: To) => {
    if (!myTurn || pending || selected == null) return false;
    const options = view.legal
      .filter((m) => m.from === selected && m.to === to)
      .sort((a, b) => a.die - b.die);
    if (!options.length) return false;
    play(options[0]!);
    return true;
  };
  const clickPoint = (idx: number) => {
    if (!clickTo(idx)) clickFrom(idx);
  };

  // Geometry: 12 points + bar + bear-off tray across; two rows.
  const units = 12 + 0.8 + 1;
  const col = width / units;
  const d = Math.min(col * 0.9, 40);
  const rowH = col * 5.4;
  const lastTo = new Set((s?.last && s.last.color !== persp ? s.last.moves : []).map((m) => m.to));

  const top =
    persp === "w" ? [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const bottom =
    persp === "w" ? [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] : [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  const point = (idx: number, pos: number, isTop: boolean) => {
    const v = s?.board.points[idx] ?? 0;
    const color: Color | null = v > 0 ? "w" : v < 0 ? "b" : null;
    const n = Math.abs(v);
    const step = n > 1 ? Math.min(d, (rowH - d) / (n - 1)) : d;
    const canFrom = myTurn && froms.includes(idx);
    const isTarget = targets.includes(idx);
    return (
      <button
        key={idx}
        type="button"
        onClick={() => clickPoint(idx)}
        data-from={canFrom ? "" : undefined}
        data-target={isTarget ? "" : undefined}
        className="relative h-full"
        style={{ width: col }}
        aria-label={t("point", { n: persp === "w" ? idx + 1 : 24 - idx, count: n })}
      >
        <span
          className="absolute inset-x-[6%]"
          style={{
            [isTop ? "top" : "bottom"]: 0,
            height: rowH * 0.92,
            background: TRI[(pos + (isTop ? 0 : 1)) % 2],
            clipPath: isTop ? "polygon(0 0,100% 0,50% 100%)" : "polygon(50% 0,100% 100%,0 100%)",
            opacity: 0.95,
          }}
        />
        {lastTo.has(idx) ? (
          <span
            className="absolute inset-x-[30%] rounded-full bg-amber-300/70"
            style={{ [isTop ? "top" : "bottom"]: -6, height: 4 }}
          />
        ) : null}
        {color
          ? Array.from({ length: n }, (_, i) => (
              <span
                key={i}
                className="absolute left-1/2 -translate-x-1/2"
                style={{ [isTop ? "top" : "bottom"]: i * step + 2 }}
              >
                <Checker
                  color={color}
                  size={d}
                  glow={canFrom && i === n - 1 && (selected === idx || selected == null)}
                  label={i === n - 1 && n > Math.floor((rowH - d) / d) + 1 ? String(n) : undefined}
                />
              </span>
            ))
          : null}
        {isTarget ? (
          <span
            className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-dashed border-amber-300 bg-amber-300/25"
            style={{ [isTop ? "top" : "bottom"]: n * Math.min(step, d) + 2, width: d, height: d }}
          />
        ) : null}
      </button>
    );
  };

  const row = (list: number[], isTop: boolean) => (
    <div className="flex" style={{ height: rowH }}>
      {list.slice(0, 6).map((idx, i) => point(idx, i, isTop))}
      <div style={{ width: col * 0.8 }} />
      {list.slice(6).map((idx, i) => point(idx, i + 6, isTop))}
    </div>
  );

  const bar = (color: Color, isTop: boolean) => {
    const n = s?.board.bar[color] ?? 0;
    const mine = color === me;
    const canFrom = myTurn && mine && froms.includes("bar");
    return (
      <button
        type="button"
        onClick={() => mine && clickFrom("bar")}
        data-from={canFrom ? "" : undefined}
        className={cn("absolute flex w-full flex-col items-center gap-0.5", isTop ? "top-2" : "bottom-2")}
        aria-label={t("bar", { count: n })}
      >
        {n ? (
          <Checker color={color} size={d * 0.9} label={n > 1 ? String(n) : undefined} glow={canFrom} />
        ) : null}
      </button>
    );
  };

  const offTray = (color: Color, isTop: boolean) => {
    const n = s?.board.off[color] ?? 0;
    const isTarget = color === me && targets.includes("off");
    return (
      <button
        type="button"
        onClick={() => clickTo("off")}
        data-target={isTarget ? "" : undefined}
        className={cn(
          "absolute inset-x-1 flex flex-col items-center justify-end gap-[2px] rounded-md p-1",
          isTop ? "top-1 bottom-[51%] flex-col-reverse" : "top-[51%] bottom-1",
          isTarget ? "bg-amber-300/40 ring-2 ring-amber-300" : "bg-black/25",
        )}
        aria-label={t("off", { count: n })}
      >
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            className="w-full rounded-[2px]"
            style={{
              height: Math.max(2, (rowH * 0.85) / 16),
              background: CHECKER[color].fill,
              boxShadow: `inset 0 0 0 1px ${CHECKER[color].ring}`,
            }}
          />
        ))}
      </button>
    );
  };

  const secondsLeft =
    view.deadline && view.status === "playing"
      ? Math.max(0, Math.ceil((view.deadline - (now + skew)) / 1000))
      : null;

  const playerBar = (c: Color, bottomSide: boolean) => {
    const p = view.players[c];
    const active = s && view.status === "playing" && s.turn === c;
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border bg-surface px-3 py-2.5",
          active ? "border-accent ring-2 ring-accent/25" : "border-border",
        )}
      >
        <Checker color={c} size={26} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate font-bold">{p ? p.name : t("waitingOpponent")}</span>
            {p ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-tone-amber/15 px-1.5 py-0.5 text-[11px] font-bold text-tone-amber">
                <Trophy className="size-3" aria-hidden="true" />
                {p.wins}
              </span>
            ) : null}
            {p && c === me ? <span className="shrink-0 text-xs text-fg-muted">({t("you")})</span> : null}
          </p>
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            {p?.table ? <span>{t("table", { table: p.table })}</span> : null}
            {p ? (
              p.present ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <Wifi className="size-3" aria-hidden="true" />
                  {t("here")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <WifiOff className="size-3" aria-hidden="true" />
                  {t("away")}
                </span>
              )
            ) : null}
            <span
              className="inline-flex gap-0.5"
              title={t("strikes", { n: p?.strikes ?? 0, max: view.maxStrikes })}
            >
              {Array.from({ length: view.maxStrikes }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-1.5 rounded-full",
                    i < (p?.strikes ?? 0) ? "bg-danger" : "bg-border-strong",
                  )}
                />
              ))}
            </span>
          </p>
        </div>
        {active && secondsLeft != null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-bold tabular-nums",
              secondsLeft <= 5 ? "bg-danger-soft text-danger" : "bg-surface-2",
            )}
          >
            <Clock className="size-3.5" aria-hidden="true" />
            {secondsLeft}
          </span>
        ) : null}
        <span className="text-end">
          <span className="block text-2xl leading-none font-extrabold tabular-nums">{s?.score[c] ?? 0}</span>
          <span className="block text-[10px] text-fg-muted">/ {view.target}</span>
        </span>
        {bottomSide ? null : null}
      </div>
    );
  };

  const oppPlayer = view.players[opp];
  const status = (() => {
    if (view.status === "open") return t("waitingForJoin", { n: view.target });
    if (view.status === "cancelled" || view.status === "abandoned") return t("closed");
    if (view.status === "finished" || !s) return null;
    if (s.turn === me) return selected == null ? t("yourTurnPick") : t("yourTurnTarget");
    const mover = view.players[s.turn];
    if (mover && !mover.present) return t("opponentAway", { name: mover.name });
    return t("opponentTurn", { name: mover?.name ?? "" });
  })();
  const lastNote = (() => {
    if (!s?.last || view.status !== "playing") return null;
    const who = view.players[s.last.color]?.name ?? "";
    if (s.last.pass) return t("passed", { name: who });
    if (s.last.auto) return t("autoPlayed", { name: who });
    return null;
  })();

  const winnerName = view.winner ? view.players[view.winner]?.name : null;

  return (
    <div className="space-y-3">
      {playerBar(opp, false)}

      <div ref={boardRef} dir="ltr" className="relative w-full select-none">
        <div
          className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-float)]"
          style={{ background: FELT, border: `6px solid ${RIM}` }}
        >
          <div className="relative" style={{ paddingInlineEnd: col }}>
            {row(top, true)}
            <div className="relative flex items-center" style={{ height: col * 1.6 }}>
              {s && view.status === "playing"
                ? (() => {
                    const all =
                      s.dice[0] === s.dice[1] ? [s.dice[0]!, s.dice[0]!, s.dice[0]!, s.dice[0]!] : s.dice;
                    // Dice no longer in `remaining` are shown as used.
                    const left = [...s.remaining];
                    const dice = all.map((v, i) => {
                      const k = left.indexOf(v);
                      if (k >= 0) left.splice(k, 1);
                      return <Die key={i} value={v} used={k < 0} size={Math.max(24, d * 0.85)} />;
                    });
                    const half = (mine: boolean) => (
                      <div className="flex items-center justify-center gap-1.5" style={{ width: col * 6 }}>
                        {(s.turn === persp) === mine ? dice : null}
                      </div>
                    );
                    return (
                      <>
                        {half(false)}
                        <div style={{ width: col * 0.8 }} />
                        {half(true)}
                      </>
                    );
                  })()
                : null}
            </div>
            {row(bottom, false)}
            {/* Bar */}
            <div
              className="absolute top-0 bottom-0"
              style={{ left: col * 6, width: col * 0.8, background: RIM }}
            >
              {bar(opp, true)}
              {bar(persp, false)}
            </div>
          </div>
          {/* Bear-off tray */}
          <div
            className="absolute top-0 right-0 bottom-0"
            style={{ width: col, background: "rgba(0,0,0,.25)" }}
          >
            {offTray(opp, true)}
            {offTray(persp, false)}
          </div>
        </div>
      </div>

      {playerBar(persp, true)}

      <div className="min-h-12 space-y-1 text-center">
        {status ? (
          <p className={cn("text-sm font-semibold", myTurn && "text-accent-text")}>{status}</p>
        ) : null}
        {lastNote ? <p className="text-xs text-fg-muted">{lastNote}</p> : null}
        {s?.lastGame && view.status === "playing" && s.gameNo > 1 ? (
          <p className="text-xs text-fg-muted">
            {t("gameWon", {
              name: view.players[s.lastGame.winner]?.name ?? "",
              points: s.lastGame.points,
            })}
          </p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>

      {view.status === "open" && !me ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await joinGameAction(view.id);
              refresh();
            })
          }
          className="h-12 w-full rounded-full bg-accent font-bold text-accent-fg"
        >
          {t("join")}
        </button>
      ) : null}

      <div className="flex gap-2">
        <Link
          href="/table/games"
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-surface-2 text-sm font-semibold"
        >
          <DoorOpen className="size-4" aria-hidden="true" />
          {view.status === "playing" ? t("leave") : t("backToRoom")}
        </Link>
        {view.status === "playing" && me ? (
          confirmResign ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await resignAction(view.id);
                  if (r?.ok && r.data) apply(r.data);
                  setConfirmResign(false);
                })
              }
              className="h-11 rounded-full bg-danger px-4 text-sm font-bold text-white"
            >
              {t("resignConfirm")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmResign(true)}
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-fg-muted ring-1 ring-border"
            >
              <Flag className="size-4" aria-hidden="true" />
              {t("resign")}
            </button>
          )
        ) : null}
      </div>
      {view.status === "playing" ? (
        <p className="text-center text-xs text-fg-muted">
          {t("leaveHint", { s: view.turnSeconds, n: view.maxStrikes })}
        </p>
      ) : null}

      {view.status === "finished" ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="animate-pop-in w-full max-w-sm rounded-3xl bg-surface p-6 text-center">
            <Crown
              className={cn("mx-auto size-12", view.winner === me ? "text-tone-amber" : "text-fg-muted")}
              aria-hidden="true"
            />
            <h2 className="mt-3 text-xl font-extrabold">
              {me
                ? view.winner === me
                  ? t("youWon")
                  : t("youLost")
                : t("winnerIs", { name: winnerName ?? "" })}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {t(`reason_${view.finishReason ?? "points"}`, { name: oppPlayer?.name ?? "" })}
            </p>
            <p className="mt-4 text-3xl font-extrabold tabular-nums">
              {s?.score.w ?? 0} – {s?.score.b ?? 0}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {view.players.w.name} · {view.players.b?.name}
            </p>
            <Link
              href="/table/games"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-accent font-bold text-accent-fg"
            >
              {t("backToRoom")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
