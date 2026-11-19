import { describe, expect, it } from "vitest";
import { itemsToCsv, parseSnappfoodMenu, vendorCodeFromUrl } from "@/server/modules/menu/import-snappfood";
import { mapRows, parseCsv } from "@/server/modules/menu/import";

describe("menu import from Snappfood", () => {
  it("finds the vendor code in a Snappfood link", () => {
    expect(vendorCodeFromUrl("https://snappfood.ir/restaurant/menu/%DA%A9%D8%A7%D9%81%D9%87-r-0x9a2b/")).toBe(
      "0x9a2b",
    );
    expect(vendorCodeFromUrl("https://snappfood.ir/restaurant/menu/kafe-r-p3ld5q")).toBe("p3ld5q");
    expect(vendorCodeFromUrl("https://snappfood.ir/x?vendorCode=AbC123")).toBe("abc123");
    expect(vendorCodeFromUrl("https://example.com")).toBeNull();
  });

  it("reads categories and dishes whatever the exact shape, without doubles", () => {
    const json = {
      data: {
        vendor: { title: "Kafe" },
        menus: [
          {
            category: "پیتزا",
            products: [{ title: "پیتزا مخصوص", price: 2_450_000, description: "پنیر، قارچ" }],
          },
          {
            category: "نوشیدنی",
            products: [
              { title: "دوغ", productVariations: [{ price: 350_000 }] },
              { title: "دوغ", price: 350_000 },
            ],
          },
        ],
      },
    };
    const items = parseSnappfoodMenu(json);
    expect(items).toEqual([
      { category: "پیتزا", name: "پیتزا مخصوص", price: 2_450_000, description: "پنیر، قارچ" },
      { category: "نوشیدنی", name: "دوغ", price: 350_000, description: null },
    ]);
    // Rials ÷ 10 → tomans, read back by the spreadsheet import as the restaurant's prices.
    const rows = mapRows(parseCsv(itemsToCsv(items, true)), "IRR");
    expect(rows.map((r) => [r.category, r.name, r.priceCents, r.error])).toEqual([
      ["پیتزا", "پیتزا مخصوص", 245_000 * 1000, null],
      ["نوشیدنی", "دوغ", 35_000 * 1000, null],
    ]);
  });
});
