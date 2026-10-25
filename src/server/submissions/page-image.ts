import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { PAGE_JPEG_QUALITY } from "@/config/provisional";
import { fitWithin } from "@/lib/page-bounds";

// A page as the AI reads it (spec 0011): decoded strictly, turned upright,
// shrunk within the vision bounds, flattened on white, encoded again as a
// JPEG without any metadata. The only importer of sharp (eslint.config.mjs).
// The browser shrinks each page the same way before it uploads it; the
// server shrinks a page slightly over the bounds instead of refusing it, and
// the handwriting trial (ai:read) prepares its photos here.

export type PageFormat = "jpeg" | "png" | "webp" | "heif";

export type PreparedPage = { bytes: Buffer; width: number; height: number; sha256: string };

/** The bytes are not an image of an accepted format, or not a whole one. Carries no content. */
export class PageImageError extends Error {
  constructor(readonly reason: "unreadable" | "format") {
    super(reason === "format" ? "The page is not an image of an accepted format." : "The page could not be decoded.");
    this.name = "PageImageError";
  }
}

/** EXIF orientations 5 to 8 turn the image a quarter: its upright width is its stored height. */
const isQuarterTurn = (orientation: number | undefined) => orientation !== undefined && orientation >= 5;

/**
 * The page ready to be stored and read. `formats`: what the caller accepts
 * (the server, JPEG only; the trial, the photos it is given). `maxInputPixels`:
 * the largest image decoded at all (sharp's own limit when absent).
 */
export async function preparePage(input: Uint8Array, { formats, maxInputPixels }: { formats: readonly PageFormat[]; maxInputPixels?: number }): Promise<PreparedPage> {
  const decoder = () => sharp(input, { failOn: "error", ...(maxInputPixels === undefined ? {} : { limitInputPixels: maxInputPixels }) });
  let metadata: Metadata;
  try {
    metadata = await decoder().metadata();
  } catch {
    throw new PageImageError("unreadable");
  }
  if (!metadata.format || !(formats as readonly string[]).includes(metadata.format)) throw new PageImageError("format");
  if (!metadata.width || !metadata.height) throw new PageImageError("unreadable");

  const [width, height] = isQuarterTurn(metadata.orientation) ? [metadata.height, metadata.width] : [metadata.width, metadata.height];
  const size = fitWithin(width, height);
  try {
    const { data, info } = await decoder()
      .rotate()
      .resize(size.width, size.height, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: Math.round(PAGE_JPEG_QUALITY * 100) })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
  } catch {
    // A truncated body may pass the header and fail on the pixels.
    throw new PageImageError("unreadable");
  }
}
