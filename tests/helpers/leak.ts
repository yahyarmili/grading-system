import {
  evaluationErrors,
  evaluationFailureLabel,
  notAssessableCauseLabels,
  notAssessableCauses,
  proposalAlertLabels,
  proposalAlerts,
} from "../../src/lib/evaluation";
import { statusLabels, storedSubmissionStatuses } from "../../src/lib/submission-status";

// E8.4, NFR-EXP-04 (E8 plan §6): the leak sweep. Unique markers are put in
// the proposal and in the teacher's evaluation; everything the student
// receives is searched for them, and for the review's internal words. Shared
// by tests/student-leak.int.test.ts and e2e/student-leak.spec.ts (relative
// imports: Playwright reads it too).

/** Markers for one run: letters, digits and dashes, never escaped in HTML, JSON or a RSC payload. */
export function leakMarkers() {
  const run = crypto.randomUUID().slice(0, 8);
  const proposal = { justification: `PROP-${run}-why`, comment: `PROP-${run}-comment`, nextStep: `PROP-${run}-step` };
  const teacher = {
    remarks: {
      task: `EVAL-${run}-task`,
      organization: `EVAL-${run}-organization`,
      vocabulary: `EVAL-${run}-vocabulary`,
      grammar: `EVAL-${run}-grammar`,
      mechanics: `EVAL-${run}-mechanics`,
    },
    generalComment: `EVAL-${run}-comment`,
    nextSteps: [`EVAL-${run}-step-one`, `EVAL-${run}-step-two`],
  };
  return {
    proposal,
    teacher,
    /** Every text of the proposal (the justifications end with their criterion id: the prefix finds them). */
    proposalMarkers: [proposal.justification, proposal.comment, proposal.nextStep],
    teacherMarkers: [...Object.values(teacher.remarks), teacher.generalComment, ...teacher.nextSteps],
  };
}

/**
 * Words of the review the student never reads: the stored states, the
 * causes, the errors and the alerts, as codes (quoted, as JSON writes them)
 * and as the teacher reads them. "To submit" and the student's own labels
 * are not among them. The teacher's start is an admitted leak (E8 plan §5:
 * SUB-05's refusal says the teacher started marking), so not searched.
 */
export const INTERNAL_CODES: readonly string[] = [
  ...storedSubmissionStatuses,
  ...notAssessableCauses,
  ...evaluationErrors,
  ...proposalAlerts,
]
  // The student's own reason when they cannot submit or replace (SUB-02, SUB-05): the same word as an AI call error.
  .filter((code) => code !== "unavailable")
  .map((code) => `"${code}"`);

export const INTERNAL_LABELS: readonly string[] = [
  ...storedSubmissionStatuses.map((s) => statusLabels[s]),
  ...Object.values(notAssessableCauseLabels),
  ...evaluationErrors.map((e) => evaluationFailureLabel(e)),
  ...Object.values(proposalAlertLabels),
  "AI proposal",
  "To re-read",
];

export type Received = { source: string; body: string };

/**
 * The first forbidden word found, as "<word> in <source>", or null. Read in
 * order, so the test fails at the first marker found and names it.
 */
export function findLeak(received: readonly Received[], forbidden: readonly string[]): string | null {
  for (const { source, body } of received) {
    for (const word of forbidden) if (body.includes(word)) return `${word} in ${source}`;
  }
  return null;
}
