import "server-only";
import { assignmentLanguages, type AssignmentLanguage } from "@/lib/assignment";
import { publishedRubric, type RubricVersion } from "@/lib/rubric";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";

// EVL-01 R2: the rubric, readable by every signed-in role (invariant 8). It
// lives in the code (src/lib/rubric.ts), not in a table: there is no write
// function to guard, and none is exposed.

/** The version in force of each language; null where none is published (French, Q6). */
export type PublishedRubrics = Record<AssignmentLanguage, RubricVersion | null>;

export async function getPublishedRubrics(actor: Actor): Promise<PublishedRubrics> {
  authorize(actor, "rubric", "read");
  return Object.fromEntries(
    assignmentLanguages.map((language) => [language, publishedRubric(language)]),
  ) as PublishedRubrics;
}
