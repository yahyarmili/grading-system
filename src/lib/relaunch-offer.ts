import type { AssignmentLanguage } from "@/lib/assignment";
import type { NotAssessableCause } from "@/lib/evaluation";
import { publishedRubric } from "@/lib/rubric";
import type { SubmissionStatus } from "@/lib/submission-status";

// PRC-02 R4 (E7.6): whether a copy may be offered "Relaunch", decided
// without the database, so the list and the copy read relaunchConditions (the
// month's runs) and listRelaunchable only when it may (C8b). Pure: one rule
// for both pages, checked by tests/review-list-relaunch.test.ts.

/** What the rule reads of a copy: a list's ReviewRow fits as it is; the copy's page maps its request. */
export type RelaunchCandidate = {
  status: SubmissionStatus;
  /** A retry or relaunch the teacher asked waits for its run. */
  requested: boolean;
  cause: NotAssessableCause | null;
};

/**
 * Not assessable, not already asked, for a cause that can go:
 * rubric_unavailable once the rubric of the assignment's language is
 * published (the registry is in the code); ai_unavailable always, the cost
 * cap and the provider being read by listRelaunchable. no_content never.
 */
export function mayOfferRelaunch(copy: RelaunchCandidate, language: AssignmentLanguage): boolean {
  if (copy.status !== "not_assessable" || copy.requested) return false;
  if (copy.cause === "ai_unavailable") return true;
  return copy.cause === "rubric_unavailable" && publishedRubric(language) !== null;
}
