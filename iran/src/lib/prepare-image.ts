"use client";

/**
 * Makes any picture the browser can show acceptable to the server before upload:
 * - iPhone HEIC photos (the server cannot decode HEVC) are converted
 * - very large photos are scaled down, so uploads are quicker on mobile data and stay under 8 MB
 * If the browser cannot decode the file either, it is sent as is and the server explains why.
 */
const SERVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const LIGHT_ENOUGH = 4 * 1024 * 1024;

export const IMAGE_ACCEPT = "image/*,.heic,.heif";

export async function prepareImage(file: File, { maxSide = 2400, keepAlpha = false } = {}): Promise<File> {
  if (file.type === "image/svg+xml") return file; // vector: the server decides (logos only)
  if (SERVER_TYPES.has(file.type) && file.size <= LIGHT_ENOUGH) return file;
  try {
    const img = await decode(file);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return file;
    const alpha =
      keepAlpha || file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
    if (!alpha) {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w, h);
    }
    g.imageSmoothingQuality = "high";
    g.drawImage(img.source, 0, 0, w, h);
    img.done();
    const type = alpha ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.9));
    if (!blob || blob.size === 0) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (alpha ? ".png" : ".jpg");
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; done: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
    } catch {
      /* Safari < 17 and HEIC: fall back to an <img> element */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    done: () => URL.revokeObjectURL(url),
  };
}

/** Puts the prepared file back in the form's input, so the form submits it. */
export function setInputFile(input: HTMLInputElement, file: File) {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch {
    /* very old browsers: the original file is submitted */
  }
}
