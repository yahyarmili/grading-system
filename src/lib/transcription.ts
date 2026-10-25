// The reading of image pages and the student's check (E9, spec 0011). Kept
// free of imports: the database schema reads the lists below, and drizzle-kit
// loads the schema alone.

/** Where a page's reading stands: not read yet, read, or its last read failed. */
export const pageReadingStatuses = ["pending", "read", "failed"] as const;
export type PageReadingStatus = (typeof pageReadingStatuses)[number];

/** What one reading run gave: a text, a page without writing, or a failure. */
export const readingOutcomes = ["read", "no_writing", "failed"] as const;
export type ReadingOutcome = (typeof readingOutcomes)[number];

/**
 * A word: a maximal run of non whitespace characters of a page's reading,
 * punctuation included (the student replaces `word,` as a whole);
 * `[illisible]` is one word. Indexes count from 0 on each page.
 */
export function wordsOf(reading: string): string[] {
  return reading.match(/\S+/g) ?? [];
}

/** One word of a page replaced by the student: by its index, with the engine's word it replaced. */
export type WordChange = { wordIndex: number; engineWord: string; studentWord: string };

/** A page as the assembly reads it, in any order: its position, its reading, the student's changes. */
export type AssembledPage = {
  position: number;
  /** False for a page read without writing: skipped. */
  hasWriting: boolean;
  text: string;
  changes?: readonly WordChange[];
};

/** The reading of one page with the student's changes applied, its whitespace and line breaks kept. */
export function applyWordChanges(reading: string, changes: readonly WordChange[] = []): string {
  if (changes.length === 0) return reading;
  const byIndex = new Map(changes.map((c) => [c.wordIndex, c]));
  let index = 0;
  return reading.replace(/\S+/g, (word) => {
    const change = byIndex.get(index++);
    if (!change) return word;
    if (change.engineWord !== word) throw new Error("applyWordChanges: the engine's word does not match");
    return change.studentWord;
  });
}

/**
 * The text sent to evaluation: each page with writing, its changes applied,
 * in position order, joined by one blank line; a word split across two pages
 * stays two words. No page with writing gives "" (never null: null means not
 * read yet). The server always rebuilds it, never trusts a text from the browser.
 */
export function assembleText(pages: readonly AssembledPage[]): string {
  return [...pages]
    .sort((a, b) => a.position - b.position)
    .filter((page) => page.hasWriting)
    .map((page) => applyWordChanges(page.text, page.changes))
    .join("\n\n");
}
