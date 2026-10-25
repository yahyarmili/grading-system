import { SHORT_TEXT_MIN_WORDS } from "@/config/provisional";
import type { AssignmentLanguage } from "@/lib/assignment";
import type { NotAssessableCause } from "@/lib/evaluation";
import { publishedRubric, type RubricVersion } from "@/lib/rubric";

// The alerts the system raises itself (EVL-04), deterministic, from the text
// and the assignment's language alone. The model's flags (other language, off
// topic, addressed to the marker) are best effort and come with its answer.

/**
 * The blocking alerts, before any request, in this order: pages of an image
 * copy all read without writing (no_writing, E9, AC-6; `noWriting` comes
 * from the pages, beside the text), no letter at all (no_content, a
 * defensive case: SUB-02 already refuses an empty text), then no published
 * rubric for the language (rubric_unavailable: French, Q6 [D]). A French
 * text without content gets no_content, so that it is not offered a new
 * evaluation when French is activated. Otherwise, the rubric in force.
 */
export function checkBlockingAlerts(
  input: { text: string; language: AssignmentLanguage },
  registry: readonly RubricVersion[],
  noWriting = false,
): { cause: NotAssessableCause } | { rubric: RubricVersion } {
  if (noWriting) return { cause: "no_writing" };
  if (!/\p{L}/u.test(input.text)) return { cause: "no_content" };
  const rubric = publishedRubric(input.language, registry);
  return rubric ? { rubric } : { cause: "rubric_unavailable" };
}

/** Words as Intl.Segmenter finds them in the language; numbers count, punctuation does not. */
export function countWords(text: string, language: AssignmentLanguage): number {
  let words = 0;
  for (const segment of new Intl.Segmenter(language, { granularity: "word" }).segment(text)) {
    if (segment.isWordLike) words++;
  }
  return words;
}

/** The information alert "very short" (R2): under SHORT_TEXT_MIN_WORDS words; the proposal is still produced. */
export function isVeryShort(text: string, language: AssignmentLanguage, minWords = SHORT_TEXT_MIN_WORDS): boolean {
  return countWords(text, language) < minWords;
}
