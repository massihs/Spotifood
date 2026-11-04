import sharp, { type Metadata } from "sharp";
import { AppError } from "@/server/errors";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000; // ~ 7700×5200, rejects decompression bombs
// "heif" covers AVIF (libvips here has no HEVC decoder: iPhone HEIC photos are converted in the
// browser before upload, see lib/prepare-image.ts). GIF: first frame only.
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "gif"]);
const MAX_SVG_BYTES = 1024 * 1024;

export type ImageVariant = {
  suffix: string;
  width: number;
  format: "webp" | "png";
  /** WebP quality (default 78: photos). Logos use more: flat colors and text show artifacts. */
  quality?: number;
};

export const PRODUCT_VARIANTS: ImageVariant[] = [
  { suffix: "sm", width: 320, format: "webp" },
  { suffix: "md", width: 640, format: "webp" },
  { suffix: "lg", width: 1280, format: "webp" },
];

/** Same suffixes as dish photos, so a dish photo can serve as the guide cover as is. */
export const COVER_VARIANTS: ImageVariant[] = [
  { suffix: "md", width: 640, format: "webp" },
  { suffix: "lg", width: 1600, format: "webp" },
];

/**
 * Suffixes are kept so existing logo URLs stay valid, but encoded at twice their name: "256" is the
 * on-screen logo (sharp on 3× phone screens up to ~170 px), "512" the PNG for PDFs and print.
 */
export const LOGO_VARIANTS: ImageVariant[] = [
  { suffix: "256", width: 512, format: "webp", quality: 92 },
  { suffix: "512", width: 1024, format: "png" },
];

export type ProcessedImage = {
  width: number;
  height: number;
  placeholder: string;
  variants: { suffix: string; body: Buffer; contentType: string }[];
};

/**
 * Validates and re-encodes an untrusted upload.
 * - format detected from the bytes (never trusts the filename or the client MIME type)
 * - SVG/GIF/others rejected; oversized or pixel-bomb images rejected
 * - EXIF orientation applied then all metadata stripped (GPS etc.)
 * - re-encoding neutralizes polyglot payloads
 */
export async function processImage(
  input: Buffer,
  variants: ImageVariant[],
  opts: { allowSvg?: boolean } = {},
): Promise<ProcessedImage> {
  if (input.byteLength === 0) throw new AppError("VALIDATION", "image_empty");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "image_too_large");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new AppError("VALIDATION", "image_invalid");
  }
  if (meta.format === "svg" && opts.allowSvg) {
    input = await rasterizeSvg(input, meta, Math.max(...variants.map((v) => v.width)));
    meta = await sharp(input).metadata();
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new AppError("VALIDATION", "image_format");
  if (!meta.width || !meta.height) throw new AppError("VALIDATION", "image_invalid");

  const base = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();

  const out: ProcessedImage["variants"] = [];
  let width = meta.width;
  let height = meta.height;
  for (const v of variants) {
    const pipeline = base().resize({ width: v.width, withoutEnlargement: true });
    const { data, info } =
      v.format === "png"
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
        : await pipeline
            .webp(
              (v.quality ?? 78) >= 90
                ? { quality: v.quality, alphaQuality: 100, smartSubsample: true, effort: 6 }
                : { quality: v.quality ?? 78, effort: 4 },
            )
            .toBuffer({ resolveWithObject: true });
    out.push({ suffix: v.suffix, body: data, contentType: v.format === "png" ? "image/png" : "image/webp" });
    width = info.width;
    height = info.height;
  }

  const tiny = await base().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return { width, height, placeholder: `data:image/webp;base64,${tiny.toString("base64")}`, variants: out };
}

/**
 * Logos are often vector files. An SVG is only accepted as a self-contained drawing (no scripts,
 * no entities, no external references), then rendered to a PNG large enough for every variant.
 */
async function rasterizeSvg(input: Buffer, meta: Metadata, targetWidth: number): Promise<Buffer> {
  if (input.byteLength > MAX_SVG_BYTES) throw new AppError("VALIDATION", "image_too_large");
  const text = input.toString("utf8");
  if (/<!(DOCTYPE|ENTITY)|<script|<foreignObject|\bon[a-z]+\s*=/i.test(text))
    throw new AppError("VALIDATION", "image_format");
  for (const m of text.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    const ref = m[1]!.trim();
    if (!ref.startsWith("#") && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(ref))
      throw new AppError("VALIDATION", "image_format");
  }
  if (/url\(\s*(?!["']?#)|@import/i.test(text)) throw new AppError("VALIDATION", "image_format");
  const width = meta.width || 300;
  const density = Math.min(4000, Math.max(72, Math.ceil((72 * targetWidth) / width)));
  try {
    return await sharp(input, { density, limitInputPixels: MAX_INPUT_PIXELS }).png().toBuffer();
  } catch {
    throw new AppError("VALIDATION", "image_invalid");
  }
}
