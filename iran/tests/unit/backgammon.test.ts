import { describe, expect, it } from "vitest";
import {
  autoPlay,
  diceToPlay,
  gamePoints,
  initialBoard,
  legalMoves,
  legalSequences,
  pips,
  tryMove,
  type Board,
} from "@/lib/backgammon";

const empty = (): Board => ({ points: Array(24).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } });
const count = (b: Board, c: "w" | "b") =>
  b.points.reduce((s, v) => s + (c === "w" ? Math.max(v, 0) : Math.max(-v, 0)), 0) + b.bar[c] + b.off[c];

describe("backgammon rules", () => {
  it("starts with 15 checkers each and 167 pips", () => {
    const b = initialBoard();
    expect(count(b, "w")).toBe(15);
    expect(count(b, "b")).toBe(15);
    expect(pips(b, "w")).toBe(167);
    expect(pips(b, "b")).toBe(167);
  });

  it("plays both dice, keeps checker counts, and the classic 3-1 makes the 5 point", () => {
    const seqs = legalSequences(initialBoard(), "w", [3, 1]);
    expect(seqs.every((s) => s.moves.length === 2)).toBe(true);
    expect(seqs.every((s) => count(s.board, "w") === 15)).toBe(true);
    expect(seqs.some((s) => s.board.points[4] === 2)).toBe(true); // 8/5 6/5
    expect(legalSequences(initialBoard(), "b", diceToPlay([6, 6])).every((s) => s.moves.length === 4)).toBe(
      true,
    );
  });

  it("blocks points with two opposing checkers and hits a blot", () => {
    const b = empty();
    b.points[10] = 1;
    b.points[7] = -2;
    b.points[8] = -1;
    expect(tryMove(b, "w", 10, 3)).toBeNull();
    const hit = tryMove(b, "w", 10, 2)!;
    expect(hit.move.hit).toBe(true);
    expect(hit.board.bar.b).toBe(1);
    expect(hit.board.points[8]).toBe(1);
  });

  it("must enter from the bar first, and passes when it cannot", () => {
    const b = initialBoard();
    b.points[23] = 1;
    b.bar.w = 1;
    expect(legalMoves(b, "w", [6, 5]).every((m) => m.from === "bar")).toBe(true);
    // Black's home fully closed: White cannot enter.
    const closed = empty();
    closed.bar.w = 1;
    for (let i = 18; i < 24; i++) closed.points[i] = -2;
    expect(legalMoves(closed, "w", [3, 4])).toEqual([]);
  });

  it("bears off exactly or with a higher die from the farthest checker only", () => {
    const b = empty();
    b.points[4] = 1; // 5 point
    b.points[1] = 1; // 2 point
    b.off.w = 13;
    expect(tryMove(b, "w", 1, 6)).toBeNull(); // a checker is farther (5 point)
    expect(tryMove(b, "w", 4, 6)?.move.to).toBe("off");
    expect(tryMove(b, "w", 1, 2)?.move.to).toBe("off");
    const notHome = initialBoard();
    expect(tryMove(notHome, "w", 5, 6)?.move.to).not.toBe("off");
  });

  it("with one die playable out of two, plays the higher one", () => {
    const b = empty();
    b.points[13] = 1;
    b.points[12] = -2; // 1 blocked
    b.points[7] = -2; // 6 then 1 blocked... only one die playable
    b.points[6] = -2;
    const seqs = legalSequences(b, "w", [6, 1]);
    expect(seqs.every((s) => s.moves.length <= 1)).toBe(true);
  });

  it("scores single, gammon and backgammon", () => {
    const b = empty();
    b.off.w = 15;
    b.off.b = 3;
    expect(gamePoints(b, "w")).toBe(1);
    b.off.b = 0;
    b.points[20] = -15;
    expect(gamePoints(b, "w")).toBe(2);
    b.points[20] = -14;
    b.points[2] = -1; // in White's home
    expect(gamePoints(b, "w")).toBe(3);
  });

  it("auto-play picks a complete legal play", () => {
    const b = initialBoard();
    const s = autoPlay(b, "w", diceToPlay([6, 6]));
    expect(s.moves).toHaveLength(4);
    expect(count(s.board, "w")).toBe(15);
  });
});
