import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PHOTO_SIZE_HEAD_BYTES, photoSizeOfHead } from "@/lib/photo-size";

// Spec 0011: the browser reads a photo's upright size on its header, so the
// shrink decodes it once, already resized (page-shrink.ts). Real files made
// by sharp; anything the header does not say plainly gives null, and the
// browser measures by decoding instead.

const W = 300;
const H = 200;
const blank = () => sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } });
const headOf = (bytes: Buffer) => new Uint8Array(bytes.subarray(0, PHOTO_SIZE_HEAD_BYTES));

describe("photoSizeOfHead", () => {
  it("reads a JPEG's frame", async () => {
    expect(photoSizeOfHead(headOf(await blank().jpeg().toBuffer()))).toEqual({ width: W, height: H });
  });

  it.each([1, 2, 3, 4])("keeps the sides of a JPEG with Exif orientation %i", async (orientation) => {
    const jpeg = await blank().jpeg().withMetadata({ orientation }).toBuffer();
    expect(photoSizeOfHead(headOf(jpeg))).toEqual({ width: W, height: H });
  });

  it.each([5, 6, 7, 8])("swaps the sides of a JPEG with Exif orientation %i, as the browser turns it", async (orientation) => {
    const jpeg = await blank().jpeg().withMetadata({ orientation }).toBuffer();
    expect(photoSizeOfHead(headOf(jpeg))).toEqual({ width: H, height: W });
  });

  it("reads a progressive JPEG", async () => {
    expect(photoSizeOfHead(headOf(await blank().jpeg({ progressive: true }).toBuffer()))).toEqual({ width: W, height: H });
  });

  it("reads a PNG", async () => {
    expect(photoSizeOfHead(headOf(await blank().png().toBuffer()))).toEqual({ width: W, height: H });
  });

  it.each([
    ["lossy", { quality: 80 }],
    ["lossless", { lossless: true }],
  ] as const)("reads a %s WebP", async (_kind, options) => {
    expect(photoSizeOfHead(headOf(await blank().webp(options).toBuffer()))).toEqual({ width: W, height: H });
  });

  it("reads an extended WebP (with alpha)", async () => {
    const webp = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } })
      .webp({ quality: 80 })
      .toBuffer();
    expect(photoSizeOfHead(headOf(webp))).toEqual({ width: W, height: H });
  });

  it("gives null for a header cut short, a HEIC or anything else", async () => {
    const jpeg = await blank().jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(photoSizeOfHead(headOf(jpeg).subarray(0, 40))).toBeNull();
    const heic = new Uint8Array([0, 0, 0, 0x18, ...[..."ftypheic"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
    expect(photoSizeOfHead(heic)).toBeNull();
    expect(photoSizeOfHead(new TextEncoder().encode("hello world, not a photo"))).toBeNull();
    expect(photoSizeOfHead(new Uint8Array())).toBeNull();
  });
});
