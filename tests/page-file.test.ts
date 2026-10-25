import { describe, expect, it } from "vitest";
import { IMAGE_ORIGINAL_MAX_BYTES } from "@/config/decisions";
import { checkPhotoFile, formatOfHead, PHOTO_HEAD_BYTES } from "@/lib/page-file";

// SUB-03 CA2, AC-2 (spec 0011): the browser's check of a chosen photo, on
// its first bytes, before it is opened. The server checks the JPEG it
// receives again (page-image.test.ts, e9-replays).

const head = (...parts: (number[] | string)[]) => {
  const bytes = parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  const out = new Uint8Array(PHOTO_HEAD_BYTES);
  out.set(bytes.slice(0, PHOTO_HEAD_BYTES));
  return out;
};

const JPEG = head([0xff, 0xd8, 0xff, 0xe0]);
const PNG = head([0x89], "PNG\r\n\x1a\n");
const WEBP = head("RIFF", [0, 0, 0, 0], "WEBP");
const HEIC = head([0, 0, 0, 0x18], "ftypheic");
const PDF = head("%PDF-1.7");
const TEXT = head("hello world!");
const SIZE = 2_000_000;

describe("formatOfHead", () => {
  it("reads each accepted format on its first bytes", () => {
    expect(formatOfHead(JPEG)).toBe("jpeg");
    expect(formatOfHead(PNG)).toBe("png");
    expect(formatOfHead(WEBP)).toBe("webp");
    expect(formatOfHead(HEIC)).toBe("heic");
  });

  it("reads the HEIF brands phones write: heix and mif1", () => {
    expect(formatOfHead(head([0, 0, 0, 0x18], "ftypheix"))).toBe("heic");
    expect(formatOfHead(head([0, 0, 0, 0x18], "ftypmif1"))).toBe("heic");
  });

  it("tells a PDF apart, and gives null for anything else", () => {
    expect(formatOfHead(PDF)).toBe("pdf");
    expect(formatOfHead(TEXT)).toBeNull();
    expect(formatOfHead(head("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull();
    expect(formatOfHead(new Uint8Array(0))).toBeNull();
  });
});

describe("checkPhotoFile (AC-2)", () => {
  it("accepts a photo whose bytes match its extension, whatever its case", () => {
    expect(checkPhotoFile("page1.jpg", SIZE, JPEG)).toBeNull();
    expect(checkPhotoFile("PAGE1.JPEG", SIZE, JPEG)).toBeNull();
    expect(checkPhotoFile("scan.png", SIZE, PNG)).toBeNull();
    expect(checkPhotoFile("scan.webp", SIZE, WEBP)).toBeNull();
    expect(checkPhotoFile("IMG_0001.HEIC", SIZE, HEIC)).toBeNull();
    expect(checkPhotoFile("IMG_0001.heif", SIZE, HEIC)).toBeNull();
  });

  it("judges a name without an extension on its bytes alone", () => {
    expect(checkPhotoFile("image", SIZE, JPEG)).toBeNull();
    expect(checkPhotoFile(".jpg", SIZE, JPEG)).toBeNull();
    expect(checkPhotoFile("image", SIZE, TEXT)).toBe("format");
  });

  it("refuses a PDF with its own reason, by its bytes or by its name", () => {
    expect(checkPhotoFile("copy.pdf", SIZE, PDF)).toBe("pdf");
    expect(checkPhotoFile("copy.jpg", SIZE, PDF)).toBe("pdf");
    expect(checkPhotoFile("copy.pdf", SIZE, JPEG)).toBe("pdf");
  });

  it("refuses a PNG renamed .jpg as a mismatch", () => {
    expect(checkPhotoFile("page.jpg", SIZE, PNG)).toBe("mismatch");
    expect(checkPhotoFile("page.png", SIZE, JPEG)).toBe("mismatch");
  });

  it("refuses an extension of no accepted format, and bytes of no accepted format", () => {
    expect(checkPhotoFile("page.gif", SIZE, JPEG)).toBe("format");
    expect(checkPhotoFile("page.jpg", SIZE, TEXT)).toBe("format");
  });

  it("refuses a photo over IMAGE_ORIGINAL_MAX_BYTES, and accepts one exactly at it", () => {
    expect(checkPhotoFile("page.jpg", IMAGE_ORIGINAL_MAX_BYTES + 1, JPEG)).toBe("tooLarge");
    expect(checkPhotoFile("page.jpg", IMAGE_ORIGINAL_MAX_BYTES, JPEG)).toBeNull();
  });

  it("refuses an empty file before anything else", () => {
    expect(checkPhotoFile("copy.pdf", 0, PDF)).toBe("empty");
  });

  it("names the format refusal before the size: a 21 MB PDF is a PDF", () => {
    expect(checkPhotoFile("copy.pdf", IMAGE_ORIGINAL_MAX_BYTES + 1, PDF)).toBe("pdf");
  });
});
