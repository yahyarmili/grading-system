import { SUBMISSION_TEXT_MAX_LENGTH } from "@/config/decisions";

// SUB-02: the text a student submits, checked the same way in the browser and
// on the server (the server decides). Nothing is corrected: the one change is
// line endings, which the browser itself turns into CRLF when it sends a form.

export const SUBMISSION_TEXT_ERRORS = {
  empty: "Write or paste your text before submitting.",
  tooLong: `Your text is longer than ${SUBMISSION_TEXT_MAX_LENGTH.toLocaleString("en-US")} characters. Shorten it, then submit again.`,
  invalid: "Your text contains a character that can't be saved. Remove it, then submit again.",
} as const;

export type SubmissionTextError = keyof typeof SUBMISSION_TEXT_ERRORS;

/** CRLF and lone CR become LF: what the student sees in the text box. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * [D, 2026-10-15] Characters as displayed: "é" written as e + accent, an emoji
 * or a flag count 1. Counts the text as given; normalize line endings first.
 */
export function countCharacters(text: string): number {
  return Array.from(graphemes.segment(text)).length;
}

/**
 * Why the (normalized) text is refused, or null. Empty or only white space;
 * over the limit; U+0000, which PostgreSQL cannot store.
 */
export function checkSubmissionText(text: string): SubmissionTextError | null {
  if (!/\S/u.test(text)) return "empty";
  if (text.includes("\u0000")) return "invalid";
  if (countCharacters(text) > SUBMISSION_TEXT_MAX_LENGTH) return "tooLong";
  return null;
}
