import { PAGE_JPEG_QUALITY } from "@/config/provisional";
import { fitWithin } from "./page-bounds";

// In the browser (spec 0011): a photo turned upright and shrunk within the
// vision bounds, encoded as a JPEG on white, before it is uploaded. The
// server checks it again and stores only what it encoded itself.

/** The photo could not be opened by this browser (a HEIC on most browsers, a damaged file). */
export class PhotoOpenError extends Error {
  constructor() {
    super("This browser cannot open this photo.");
    this.name = "PhotoOpenError";
  }
}

export async function shrinkPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = fitWithin(probe.width, probe.height);
    probe.close();
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: "high",
    });
  } catch {
    throw new PhotoOpenError();
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoOpenError();
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PAGE_JPEG_QUALITY));
  if (!blob) throw new PhotoOpenError();
  return blob;
}
