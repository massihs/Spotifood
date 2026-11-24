/** Where one station's part of an order stands, from its lines (client and server). */
export type StationState = "waiting" | "preparing" | "ready";

export function stationState(
  lines: { startedAt?: Date | string | null; readyAt?: Date | string | null }[],
): StationState {
  if (lines.length && lines.every((l) => l.readyAt)) return "ready";
  if (lines.some((l) => l.startedAt)) return "preparing";
  return "waiting";
}

/** Each station's part of an order, for the chips on a card ("Kitchen · cooking", "Bar · ready"). */
export function stationProgress<S extends { id: string; name: string; color: string }>(
  items: { stationId?: string | null; startedAt?: Date | string | null; readyAt?: Date | string | null }[],
  stations: S[],
) {
  return stations
    .map((s) => {
      const lines = items.filter((i) => i.stationId === s.id);
      return lines.length ? { id: s.id, name: s.name, color: s.color, state: stationState(lines) } : null;
    })
    .filter((x) => x != null);
}
