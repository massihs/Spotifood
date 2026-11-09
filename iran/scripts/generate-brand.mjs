/**
 * Spotifood brand assets: the mark (a white plate on a dark tile, an orange "spot" with a bite on
 * it — the table you scan, the food, and a plate's rings that read as a record: Spotifood plays
 * music too) and the logo (mark + "spotifood" wordmark, letters drawn as paths so the files need
 * no font).
 *
 * Run: node scripts/generate-brand.mjs (needs the Inter fonts installed: apt install fonts-inter)
 * Writes the PWA icons (public/icons), the favicon (src/app/favicon.ico), the logo files
 * (public/brand) and the desktop app icon (../desktop/build/icon.png).
 * The same geometry lives in src/components/ui/logo.tsx for the inline mark.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");

const FONT = "/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf";

export const COLORS = {
  ink: "#141414",
  orange: "#EB6300",
  orangeOnDark: "#FF8A2A",
  white: "#FFFFFF",
};

/**
 * The mark on a 1024 grid. `radius`: tile corner (0 = full bleed, for maskable and Apple icons,
 * whose shape is cut by the system). `scale`: content size (maskable icons keep it in the safe
 * zone). `inset`: transparent margin around the tile (macOS app icons).
 */
export function markSvg({ radius = 232, scale = 1, inset = 0, size = 1024, outline = false } = {}) {
  const tile = 1024 - 2 * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#232323"/><stop offset="1" stop-color="#0D0D0D"/>
    </linearGradient>
    <radialGradient id="plate" cx="0.38" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.72" stop-color="#FCFAF7"/><stop offset="1" stop-color="#EEE6DF"/>
    </radialGradient>
    <linearGradient id="spot" x1="0.18" y1="0.08" x2="0.82" y2="0.96">
      <stop offset="0" stop-color="#FF9B30"/><stop offset="0.5" stop-color="#F06A0C"/><stop offset="1" stop-color="#D63F1E"/>
    </linearGradient>
    <radialGradient id="gloss" cx="0.34" cy="0.24" r="0.62">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.42"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sheen" cx="0.3" cy="0.08" r="0.9">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.09"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <mask id="bite">
      <rect width="1024" height="1024" fill="#fff"/>
      <circle cx="637" cy="389" r="62" fill="#000"/>
      <circle cx="580" cy="349" r="34" fill="#000"/>
      <circle cx="678" cy="447" r="34" fill="#000"/>
    </mask>
    <filter id="plateShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
    <filter id="spotShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#8A2A06" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${radius}" fill="url(#tile)"/>
  <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${radius}" fill="url(#sheen)"/>${
    outline
      ? `<rect x="${inset + 4}" y="${inset + 4}" width="${tile - 8}" height="${tile - 8}" rx="${radius - 4}" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="8"/>`
      : ""
  }
  <g transform="translate(512 512) scale(${scale * (tile / 1024)}) translate(-512 -512)">
    <circle cx="512" cy="512" r="330" fill="url(#plate)" filter="url(#plateShadow)"/>
    <circle cx="512" cy="512" r="268" fill="none" stroke="#E7DCD3" stroke-width="12"/>
    <circle cx="512" cy="512" r="236" fill="none" stroke="#F0E7E0" stroke-width="5"/>
    <circle cx="512" cy="512" r="208" fill="none" stroke="#F0E7E0" stroke-width="5"/>
    <g mask="url(#bite)">
      <circle cx="512" cy="512" r="168" fill="url(#spot)" filter="url(#spotShadow)"/>
      <circle cx="512" cy="512" r="168" fill="url(#gloss)"/>
    </g>
  </g>
</svg>`;
}

/** "spotifood" in Inter ExtraBold, as paths: "spoti" in ink (or white), "food" in orange. */
function wordmark(fontSize, x0, baseline, onDark) {
  // Inter Display ExtraBold (Debian/Ubuntu: apt install fonts-inter), drawn as paths.
  const base = fontkit.openSync(FONT);
  const glyphs = base.glyphsForString("spotifood");
  const s = fontSize / base.unitsPerEm;
  const tracking = -0.025 * base.unitsPerEm;
  let x = 0;
  const parts = glyphs.map((g, i) => {
    const fill = i < 5 ? (onDark ? COLORS.white : COLORS.ink) : onDark ? COLORS.orangeOnDark : COLORS.orange;
    const out = `<path fill="${fill}" transform="translate(${(x0 + x * s).toFixed(2)} ${baseline}) scale(${s.toFixed(5)} ${(-s).toFixed(5)})" d="${g.path.toSVG()}"/>`;
    x += g.advanceWidth + (i < glyphs.length - 1 ? tracking : 0);
    return out;
  });
  return { svg: parts.join(""), width: x * s };
}

/** Horizontal logo: the mark, then the wordmark, on a transparent background. */
function logoSvg({ onDark = false, height = 256 } = {}) {
  const H = height;
  const gap = Math.round(H * 0.26);
  const fontSize = H * 0.68;
  const baseline = Math.round(H * 0.7);
  const text = wordmark(fontSize, H + gap, baseline, onDark);
  const width = Math.ceil(H + gap + text.width + H * 0.04);
  // On a dark page the dark tile gets a fine light edge so it does not melt into the background.
  const mark = markSvg({ size: H, outline: onDark })
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">
  <g transform="scale(${H / 1024})">${mark}</g>
  ${text.svg}
</svg>`;
}

/** A Windows .ico holding PNG images (valid since Vista; every browser reads it). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

async function main() {
  mkdirSync("public/brand", { recursive: true });
  const rounded = markSvg();
  const save = async (file, svg, size) => {
    writeFileSync(file, await png(svg, size));
    console.log("✓", file);
  };

  // PWA + favicons
  writeFileSync("public/icons/icon.svg", rounded);
  console.log("✓ public/icons/icon.svg");
  await save("public/icons/icon-192.png", rounded, 192);
  await save("public/icons/icon-512.png", rounded, 512);
  // Maskable: full bleed, the plate inside the 80 % safe circle.
  await save("public/icons/maskable-512.png", markSvg({ radius: 0, scale: 0.86 }), 512);
  // iOS rounds the corners itself and wants no transparency.
  await save("public/icons/apple-touch-icon.png", markSvg({ radius: 0, scale: 0.92 }), 180);
  writeFileSync(
    "src/app/favicon.ico",
    ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(rounded, size) })))),
  );
  console.log("✓ src/app/favicon.ico");

  // Logo files (site, documents, social)
  writeFileSync("public/brand/spotifood-mark.svg", rounded);
  for (const [name, onDark] of [
    ["spotifood-logo", false],
    ["spotifood-logo-on-dark", true],
  ]) {
    const svg = logoSvg({ onDark });
    writeFileSync(`public/brand/${name}.svg`, svg);
    const big = logoSvg({ onDark, height: 512 });
    writeFileSync(
      `public/brand/${name}.png`,
      await sharp(Buffer.from(big)).png({ compressionLevel: 9 }).toBuffer(),
    );
    console.log("✓", `public/brand/${name}.svg/.png`);
  }
  await save("public/brand/spotifood-mark-1024.png", rounded, 1024);

  // Desktop app (macOS-style margin around the tile; Windows uses the same file)
  await save("../desktop/build/icon.png", markSvg({ radius: 186, inset: 100 }), 1024);
}

await main();
