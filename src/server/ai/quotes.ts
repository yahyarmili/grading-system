import { QUOTE_MAX_ERROR_RATE } from "@/config/provisional";

// EVL-03: each quote of a proposal is an excerpt of the student's text. The
// model is asked to copy it character for character, mistakes included; the
// comparison forgives what copying changes without meaning to (typographic
// quotes, dashes, spaces, case) and, for a long quote, a few slips. Nothing
// here changes what is stored: the normalized forms serve the comparison only.

const SINGLE_QUOTES = /[‘’‚‛′ʼ`´]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐-―−﹘﹣－]/g;

/** For the comparison only: NFKC, lower case, ASCII quotes and dashes, spaces merged. */
export function normalizeForQuote(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The least edit distance between `pattern` and any substring of `text`
 * (Sellers' algorithm: the match may start anywhere), or limit + 1 when it is
 * over `limit`. O(text × pattern) time, O(pattern) memory.
 */
function bestSubstringDistance(pattern: readonly string[], text: readonly string[], limit: number): number {
  const m = pattern.length;
  // column[i]: distance between pattern[0..i) and the best substring ending at the current text position.
  let column = Array.from({ length: m + 1 }, (_, i) => i);
  let best = column[m];
  for (const char of text) {
    const next = [0];
    for (let i = 1; i <= m; i++) {
      const substitution = column[i - 1] + (pattern[i - 1] === char ? 0 : 1);
      next.push(Math.min(substitution, column[i] + 1, next[i - 1] + 1));
    }
    column = next;
    best = Math.min(best, column[m]);
    if (best === 0) break;
  }
  return best <= limit ? best : limit + 1;
}

/**
 * Whether `quote` is found in `text`: exactly once both are normalized, or
 * within floor(length × QUOTE_MAX_ERROR_RATE) edits of some excerpt. A short
 * quote (under 1 / QUOTE_MAX_ERROR_RATE characters) must be exact.
 */
export function quoteFound(quote: string, text: string, maxErrorRate = QUOTE_MAX_ERROR_RATE): boolean {
  const pattern = normalizeForQuote(quote);
  const haystack = normalizeForQuote(text);
  if (pattern === "") return false;
  if (haystack.includes(pattern)) return true;
  // By code point, on both sides: an emoji is one character, not two.
  const chars = [...pattern];
  const limit = Math.floor(chars.length * maxErrorRate);
  if (limit === 0) return false;
  return bestSubstringDistance(chars, [...haystack], limit) <= limit;
}
