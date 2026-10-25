import { IMAGE_ACCEPTED_FORMATS, IMAGE_ORIGINAL_MAX_BYTES } from "@/config/decisions";

// In the browser (SUB-03 CA2, spec 0011): a photo the student chose is
// checked before it is opened. Its format is read on its first bytes, never
// trusted from its name or type, and must match its extension; a PDF has its
// own message. The server checks the JPEG it receives again (page-image.ts).

type AcceptedFormat = (typeof IMAGE_ACCEPTED_FORMATS)[number];

/** Why a chosen file is refused, or null when it may be opened. */
export type PhotoFileRefusal = "pdf" | "format" | "mismatch" | "tooLarge" | "empty";

/** How many first bytes the check reads. */
export const PHOTO_HEAD_BYTES = 12;

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** The format the first bytes show: JPEG, PNG, WebP, HEIC, a PDF, or none of them. */
export function formatOfHead(head: Uint8Array): AcceptedFormat | "pdf" | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (ascii(head, 0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "webp";
  if (ascii(head, 4, 8) === "ftyp" && ["heic", "heix", "mif1"].includes(ascii(head, 8, 12))) return "heic";
  if (ascii(head, 0, 4) === "%PDF") return "pdf";
  return null;
}

const EXTENSIONS: Record<string, AcceptedFormat | "pdf"> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heic",
  heif: "heic",
  pdf: "pdf",
};

/**
 * Why the file is refused, from its name, size and first bytes. A name
 * without an extension (some phones' camera) is judged on its bytes alone;
 * an extension that names another format, or none of the accepted ones, is
 * refused.
 */
export function checkPhotoFile(name: string, size: number, head: Uint8Array): PhotoFileRefusal | null {
  if (size === 0) return "empty";
  const format = formatOfHead(head);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
  const named = extension === null ? undefined : (EXTENSIONS[extension] ?? null);
  if (format === "pdf" || named === "pdf") return "pdf";
  if (format === null || named === null) return "format";
  if (named !== undefined && named !== format) return "mismatch";
  if (size > IMAGE_ORIGINAL_MAX_BYTES) return "tooLarge";
  return null;
}
