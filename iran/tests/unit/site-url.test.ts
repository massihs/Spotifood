import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { absoluteUrl, pageUrl } from "@/lib/site-url";

describe("public addresses", () => {
  const other = LOCALES.find((l) => l !== DEFAULT_LOCALE)!;

  it("leaves the default language without a prefix", () => {
    expect(pageUrl("https://spotifood.ir/", DEFAULT_LOCALE)).toBe("https://spotifood.ir/");
    expect(pageUrl("https://spotifood.ir", DEFAULT_LOCALE, "/r/brielle")).toBe(
      "https://spotifood.ir/r/brielle",
    );
    expect(pageUrl("https://spotifood.ir", other, "/r/brielle")).toBe(
      `https://spotifood.ir/${other}/r/brielle`,
    );
  });

  it("makes file paths absolute", () => {
    expect(absoluteUrl("https://spotifood.ir/", "/api/v1/files/a.webp")).toBe(
      "https://spotifood.ir/api/v1/files/a.webp",
    );
    expect(absoluteUrl("https://spotifood.ir", "https://cdn.example/a.webp")).toBe(
      "https://cdn.example/a.webp",
    );
  });
});
