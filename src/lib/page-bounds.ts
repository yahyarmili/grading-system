import { PAGE_LONG_SIDE_MAX_PX, PAGE_TOKENS_MAX } from "@/config/provisional";

// The vision bounds of a page (spec 0011), the same in the browser, which
// shrinks each photo before it uploads it, and on the server, which shrinks
// a page slightly over them instead of refusing it (page-image.ts).

/** The side of an image tile the vision bound counts in. */
const TILE_PX = 28;

const tiles = (width: number, height: number) => Math.ceil(width / TILE_PX) * Math.ceil(height / TILE_PX);

/**
 * The largest size of the same shape within the bounds: long side at most
 * PAGE_LONG_SIDE_MAX_PX, at most PAGE_TOKENS_MAX tiles. Never larger than the
 * image itself.
 */
export function fitWithin(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, PAGE_LONG_SIDE_MAX_PX / Math.max(width, height), Math.sqrt((PAGE_TOKENS_MAX * TILE_PX * TILE_PX) / (width * height)));
  let fitted = { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
  // The tile count rounds up: step down until it fits.
  while (tiles(fitted.width, fitted.height) > PAGE_TOKENS_MAX) {
    const ratio = (fitted.width - 1) / fitted.width;
    fitted = { width: fitted.width - 1, height: Math.max(1, Math.floor(fitted.height * ratio)) };
  }
  return fitted;
}
