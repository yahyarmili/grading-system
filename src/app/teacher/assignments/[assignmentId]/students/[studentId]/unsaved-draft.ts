import { criterionIds, levels, type CriterionId, type Level } from "@/lib/rubric";

// C1 (REV-03 CA4): what the form holds while the teacher types, kept in the
// tab's sessionStorage while it differs from what is saved. The router keeps
// up to 3 pages (<Activity>) and evicts the oldest, which renders fresh;
// a reload or a page left by a plain link renders fresh too
// (node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md). The
// browser's back button cannot be held: without this copy, changes would be
// lost there without a word. sessionStorage: this tab only, gone when it is
// closed. One entry per submission, so that a stale one (another version,
// proposal or revision) is found and erased, never left behind.

/** What the form holds while the teacher types. */
export type Draft = {
  levels: Record<CriterionId, Level>;
  remarks: Record<CriterionId, string>;
  generalComment: string;
  /** One step per line. */
  nextSteps: string;
  gradeFixed: boolean;
  /** The typed grade, while fixed. */
  gradeText: string;
  /** "To re-read" cleared without changing the remark. */
  rereadDone: CriterionId[];
};

/** The form a draft was typed in: the submission, its version and proposal, and the revision saved under it. */
export type DraftScope = { submissionId: string; versionNumber: number; proposalId: string | null; revision: number };

/** What reading finds: a draft to restore, one typed over another revision (restored, the teacher chooses), or nothing. */
export type DraftRead = { kind: "restore"; draft: Draft } | { kind: "outdated"; draft: Draft } | { kind: "none" };

type Stored = Omit<DraftScope, "submissionId"> & { draft: Draft };

const keyOf = (submissionId: string) => `review-draft:${submissionId}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isDraft(value: unknown): value is Draft {
  if (!isRecord(value) || !isRecord(value.levels) || !isRecord(value.remarks)) return false;
  const { levels: lv, remarks } = value;
  return (
    criterionIds.every((id) => (levels as readonly unknown[]).includes(lv[id]) && typeof remarks[id] === "string") &&
    typeof value.generalComment === "string" &&
    typeof value.nextSteps === "string" &&
    typeof value.gradeFixed === "boolean" &&
    typeof value.gradeText === "string" &&
    Array.isArray(value.rereadDone) &&
    value.rereadDone.every((id) => (criterionIds as readonly unknown[]).includes(id))
  );
}

/** The tab's sessionStorage, or null where it is refused (private mode, blocked site data). */
export function sessionDrafts(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** What the tab keeps for this submission, as stored; "" for nothing (or storage refused). */
export function storedDraft(storage: Storage | null, submissionId: string): string {
  try {
    return storage?.getItem(keyOf(submissionId)) ?? "";
  } catch {
    return "";
  }
}

/**
 * Reads what storedDraft gave, for this form; erases nothing (the form erases
 * what it does not restore). Typed over another revision (saved since, in
 * another tab or window): "outdated", restored with the choice of a conflict
 * (load the saved version, or save it over): saved silently, it would go
 * whole over changes it never saw. Another version or proposal (the copy
 * replaced), nothing, or unreadable: "none".
 */
export function parseDraft(raw: string, scope: DraftScope): DraftRead {
  if (raw === "") return { kind: "none" };
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return { kind: "none" };
  }
  if (!isRecord(stored) || stored.versionNumber !== scope.versionNumber || stored.proposalId !== scope.proposalId || !isDraft(stored.draft)) {
    return { kind: "none" };
  }
  return { kind: stored.revision === scope.revision ? "restore" : "outdated", draft: stored.draft };
}

export function writeDraft(storage: Storage | null, { submissionId, ...scope }: DraftScope, draft: Draft) {
  try {
    storage?.setItem(keyOf(submissionId), JSON.stringify({ ...scope, draft } satisfies Stored));
  } catch {
    // Full or refused: the form keeps the changes in memory; the leave guard still asks.
  }
}

export function clearDraft(storage: Storage | null, submissionId: string) {
  try {
    storage?.removeItem(keyOf(submissionId));
  } catch {
    // Refused: nothing was kept either.
  }
}
