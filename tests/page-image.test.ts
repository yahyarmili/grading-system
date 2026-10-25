import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PAGE_LONG_SIDE_MAX_PX, PAGE_TOKENS_MAX } from "@/config/provisional";
import { fitWithin } from "@/lib/page-bounds";
import { PageImageError, preparePage } from "@/server/submissions/page-image";

// Spec 0011: a page as the AI reads it, upright, within the vision bounds,
// a JPEG without metadata; anything that is not a whole image of an accepted
// format is refused with a reason and no content.

const tiles = (w: number, h: number) => Math.ceil(w / 28) * Math.ceil(h / 28);

/** A plain image of this size and format, with its options (an EXIF orientation, an alpha channel). */
async function image(width: number, height: number, format: "jpeg" | "png" | "webp", options: { orientation?: number; alpha?: boolean } = {}) {
  const channels = options.alpha ? 4 : 3;
  let pipeline = sharp({ create: { width, height, channels, background: options.alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : "#808080" } });
  if (options.orientation) pipeline = pipeline.withMetadata({ orientation: options.orientation });
  return pipeline.toFormat(format).toBuffer();
}

describe("fitWithin", () => {
  it.each([
    [4000, 3000],
    [3000, 4000],
    [8000, 6000],
    [2576, 100],
    [2000, 2000],
    [2600, 1900],
  ])("keeps %i × %i within the long side and the tile bound", (w, h) => {
    const fitted = fitWithin(w, h);
    expect(Math.max(fitted.width, fitted.height)).toBeLessThanOrEqual(PAGE_LONG_SIDE_MAX_PX);
    expect(tiles(fitted.width, fitted.height)).toBeLessThanOrEqual(PAGE_TOKENS_MAX);
    // Its shape kept, within a pixel of rounding.
    expect(Math.abs(fitted.width / fitted.height - w / h)).toBeLessThan(0.01);
    // As large as the bounds allow: one more pixel each way would not fit.
    expect(tiles(fitted.width + 28, fitted.height + 28) > PAGE_TOKENS_MAX || Math.max(fitted.width, fitted.height) >= PAGE_LONG_SIDE_MAX_PX * 0.98).toBe(true);
  });

  it("never enlarges a small page", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("preparePage", () => {
  it("shrinks a large photo within the bounds and encodes it as a JPEG", async () => {
    const page = await preparePage(await image(4000, 3000, "jpeg"), { formats: ["jpeg"] });
    const meta = await sharp(page.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect({ width: meta.width, height: meta.height }).toEqual({ width: page.width, height: page.height });
    expect(tiles(page.width, page.height)).toBeLessThanOrEqual(PAGE_TOKENS_MAX);
    expect(page.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("turns a page upright from its EXIF orientation, then drops every metadata", async () => {
    const page = await preparePage(await image(1200, 800, "jpeg", { orientation: 6 }), { formats: ["jpeg"] });
    expect({ width: page.width, height: page.height }).toEqual({ width: 800, height: 1200 });
    const meta = await sharp(page.bytes).metadata();
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it("flattens a transparent PNG on white, when the caller accepts PNG", async () => {
    const page = await preparePage(await image(100, 100, "png", { alpha: true }), { formats: ["png"] });
    const { data } = await sharp(page.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
  });

  it("refuses a format the caller does not accept: a PNG for the server", async () => {
    const error = await preparePage(await image(100, 100, "png"), { formats: ["jpeg"] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PageImageError);
    expect(error).toMatchObject({ reason: "format" });
  });

  it("refuses what is not an image, and a truncated JPEG", async () => {
    const pdf = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n");
    await expect(preparePage(pdf, { formats: ["jpeg"] })).rejects.toMatchObject({ reason: "unreadable" });
    const whole = await image(600, 400, "jpeg");
    const truncated = whole.subarray(0, Math.floor(whole.length / 2));
    await expect(preparePage(truncated, { formats: ["jpeg"] })).rejects.toMatchObject({ reason: "unreadable" });
  });

  it("refuses an image over the pixels the caller allows", async () => {
    await expect(preparePage(await image(2000, 2000, "jpeg"), { formats: ["jpeg"], maxInputPixels: 1_000_000 })).rejects.toMatchObject({
      reason: "unreadable",
    });
  });
});
