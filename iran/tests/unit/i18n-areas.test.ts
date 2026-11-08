import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeAreas } from "../../scripts/i18n-areas";
import { CLIENT_NAMESPACES } from "@/i18n/client-namespaces";
import { pickMessages } from "@/i18n/area-messages";
import fa from "../../messages/fa.json";

describe("messages sent to the browser per area", () => {
  const { areas, unassigned } = computeAreas(path.resolve(__dirname, "../.."));

  it("covers every route folder", () => {
    expect(unassigned).toEqual([]);
  });

  it.each(Object.keys(areas))("lists every namespace the %s area's client components use", (area) => {
    const listed = new Set<string>(CLIENT_NAMESPACES[area as keyof typeof CLIENT_NAMESPACES]);
    const missing = areas[area as keyof typeof areas].filter((ns) => !listed.has(ns));
    // Run `npx tsx scripts/i18n-areas.ts --write` after adding translations to a client component.
    expect(missing).toEqual([]);
  });

  it("keeps the guest menu and the public site light", () => {
    const size = (area: keyof typeof CLIENT_NAMESPACES) =>
      JSON.stringify(pickMessages(fa as never, area)).length / JSON.stringify(fa).length;
    expect(size("table")).toBeLessThan(0.4);
    expect(size("site")).toBeLessThan(0.2);
  });
});
