// In the browser (spec 0011): a photo's size read on its first bytes, turned
// upright as `createImageBitmap(file, { imageOrientation: "from-image" })`
// would, so the shrink decodes it once, already resized, never at full size
// first. JPEG (its frame and its Exif orientation), PNG and WebP; anything
// else, or a header it cannot follow, gives null and the caller decodes once
// to measure.

/** How many first bytes the size is looked for in: a phone's Exif block fits well within. */
export const PHOTO_SIZE_HEAD_BYTES = 256 * 1024;

export type PhotoSize = { width: number; height: number };

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** The upright size of the photo, or null when its header does not say it plainly. */
export function photoSizeOfHead(head: Uint8Array): PhotoSize | null {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  try {
    if (head[0] === 0xff && head[1] === 0xd8) return jpegSize(head, view);
    if (ascii(head, 0, 8) === "\x89PNG\r\n\x1a\n" && ascii(head, 12, 16) === "IHDR") {
      return checked({ width: view.getUint32(16), height: view.getUint32(20) });
    }
    if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return webpSize(head, view);
  } catch {
    // A header cut short by the bytes read (a RangeError): measured by decoding instead.
  }
  return null;
}

const checked = (size: PhotoSize): PhotoSize | null => (size.width > 0 && size.height > 0 ? size : null);

/** Start of frame markers that carry the size: C0 to CF, except DHT (C4), JPG (C8) and DAC (CC). */
const isFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(head: Uint8Array, view: DataView): PhotoSize | null {
  let orientation = 1;
  let at = 2;
  while (at + 4 <= head.length) {
    if (head[at] !== 0xff) return null;
    const marker = head[at + 1];
    // Fill bytes, and the markers without a length.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = view.getUint16(at + 2);
    if (length < 2) return null;
    if (marker === 0xe1 && ascii(head, at + 4, at + 10) === "Exif\0\0") orientation = exifOrientation(view, at + 10) ?? orientation;
    if (isFrame(marker)) {
      const size = checked({ height: view.getUint16(at + 5), width: view.getUint16(at + 7) });
      if (!size) return null;
      // Orientations 5 to 8 turn the photo a quarter: its sides swap.
      return orientation >= 5 && orientation <= 8 ? { width: size.height, height: size.width } : size;
    }
    at += 2 + length;
  }
  return null;
}

/** The Exif orientation tag (0x0112) of the first image directory, from the TIFF header at `tiff`. */
function exifOrientation(view: DataView, tiff: number): number | null {
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const directory = tiff + view.getUint32(tiff + 4, little);
  const entries = view.getUint16(directory, little);
  for (let i = 0; i < entries; i++) {
    const entry = directory + 2 + i * 12;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

function webpSize(head: Uint8Array, view: DataView): PhotoSize | null {
  const chunk = ascii(head, 12, 16);
  if (chunk === "VP8X") {
    // An Exif block may turn it: left to the decoder.
    if (head[20] & 0x08) return null;
    const uint24 = (at: number) => head[at] | (head[at + 1] << 8) | (head[at + 2] << 16);
    return checked({ width: uint24(24) + 1, height: uint24(27) + 1 });
  }
  if (chunk === "VP8L" && head[20] === 0x2f) {
    const bits = view.getUint32(21, true);
    return checked({ width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 });
  }
  if (chunk === "VP8 " && head[23] === 0x9d && head[24] === 0x01 && head[25] === 0x2a) {
    return checked({ width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff });
  }
  return null;
}
