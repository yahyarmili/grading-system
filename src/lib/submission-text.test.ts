import { describe, expect, it } from "vitest";
import { SUBMISSION_TEXT_MAX_LENGTH } from "@/config/decisions";
import { checkSubmissionText, countCharacters, normalizeLineEndings } from "./submission-text";

// SUB-02 R1, R2 and NFR-TRT-02: the text is checked, never corrected.

describe("countCharacters: characters as displayed [D]", () => {
  it.each([
    ["plain letters", "abc", 3],
    ["a precomposed é", "café", 4],
    ["an e with a combining accent (NFD)", "café", 4],
    ["an emoji", "I 💙 it", 6],
    ["a flag", "🇲🇦", 1],
    ["a family emoji", "👨‍👩‍👧", 1],
    ["Arabic letters", "مرحبا", 5],
    ["a line break", "a\nb", 3],
  ])("%s", (_, text, count) => {
    expect(countCharacters(text)).toBe(count);
  });
});

describe("normalizeLineEndings", () => {
  it("turns CRLF and lone CR into LF, and nothing else", () => {
    expect(normalizeLineEndings("one\r\ntwo\rthree\nfour\r\n\r\n")).toBe("one\ntwo\nthree\nfour\n\n");
  });

  it("leaves everything else as written, byte for byte", () => {
    const text = "  i has went , it were grate !!\tl’été  café « oui » 🇲🇦  ";
    expect(normalizeLineEndings(text)).toBe(text);
  });
});

describe("checkSubmissionText", () => {
  it.each([
    ["empty", ""],
    ["spaces", "     "],
    ["line breaks and tabs", "\n\n\t \n"],
    ["no-break spaces", "  "],
  ])("refuses a text that is %s", (_, text) => {
    expect(checkSubmissionText(text)).toBe("empty");
  });

  it("accepts a text with mistakes, accents and spaces around it", () => {
    expect(checkSubmissionText("  i has went to the beach, l’été était grate  \n")).toBeNull();
  });

  it(`accepts ${SUBMISSION_TEXT_MAX_LENGTH} characters and refuses one more`, () => {
    expect(checkSubmissionText("a".repeat(SUBMISSION_TEXT_MAX_LENGTH))).toBeNull();
    expect(checkSubmissionText("a".repeat(SUBMISSION_TEXT_MAX_LENGTH + 1))).toBe("tooLong");
  });

  it("counts displayed characters at the limit, not code units", () => {
    // Each "é" in NFD is 2 code points; each flag is 4 UTF-16 units: both count 1.
    expect(checkSubmissionText("é".repeat(SUBMISSION_TEXT_MAX_LENGTH))).toBeNull();
    expect(checkSubmissionText("🇲🇦".repeat(SUBMISSION_TEXT_MAX_LENGTH))).toBeNull();
    expect(checkSubmissionText("🇲🇦".repeat(SUBMISSION_TEXT_MAX_LENGTH + 1))).toBe("tooLong");
  });

  it("refuses U+0000, which the database cannot store", () => {
    expect(checkSubmissionText("my\u0000town")).toBe("invalid");
  });
});
