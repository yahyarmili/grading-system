import "server-only";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { SUBMISSION_MAX_REPLACEMENTS } from "@/config/decisions";
import type { EvaluationRef } from "@/lib/evaluation";
import { sourcesOf } from "@/lib/submission-status";
import { checkSubmissionText } from "@/lib/submission-text";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assembleText, wordsOf, type WordChange } from "@/lib/transcription";
import {
  assignments,
  submissionDrafts,
  submissionPages,
  submissions,
  submissionTranscriptions,
  submissionVersions,
  transcriptionChanges,
  users,
} from "@/server/db/schema";
import { memberOfRecipients, receivedBy } from "../assignments/received";
import { acknowledgedNotice } from "../notices/notices";
import { isLate } from "./late";
import { applyTransition, insertReceived } from "./transitions";

// SUB-02, SUB-04: the first submission of a text. The student writes their
// own submission and never reads it back (A3): nothing here returns the text.

export type NewTextSubmission = {
  assignmentId: string;
  /** The assignment's content_version the student read (ASG-03). */
  contentVersion: number;
  /** One per form shown: a resent form is the same submission. */
  requestId: string;
  /** Already normalized and checked (src/lib/submission-text.ts). */
  text: string;
};

/**
 * Submitted (again, for the same request: idempotent), or refused: the task
 * changed since it was shown, the notice in force was not read (NFR-DON-04),
 * or the student already submitted with another form. Null when the assignment is absent, not received through an active
 * membership, or the account is not confirmed (§5.5, transition 1). `ref`
 * names the version to evaluate, for the trigger once committed (PRC-01).
 */
export type SubmitTextResult =
  | { ok: true; submittedAt: string; late: boolean; ref: EvaluationRef }
  | { ok: false; reason: "changed" | "already_submitted" | "notice_not_read" };

/** An account that confirmed its address; an unconfirmed one has no session, checked again here. */
const confirmed = (userId: string) =>
  sql`exists (select 1 from ${users} where ${users.id} = ${userId} and ${users.emailVerified})`;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What a first submission needs, whatever its mode. */
type FirstSubmissionInput = Omit<NewTextSubmission, "text">;

/**
 * The core of a first submission, shared by the text and the images (spec
 * 0011), inside the caller's transaction. The first statement locks the
 * assignment row (ASG-03): a teacher's change of the task waits for it, then
 * finds locked_at set and is refused; a change that came first moved the
 * content version, and the submission is refused instead. Lateness is
 * computed in SQL, strictly after the deadline, with the same now() as
 * submitted_at (SUB-04 R2): for images, the first confirmation, never the
 * first page. The unique pair decides between two forms. `insertVersion`
 * adds version 1 of the new submission, in its mode.
 */
async function submitFirst(
  tx: Tx,
  userId: string,
  input: FirstSubmissionInput,
  insertVersion: (submissionId: string) => Promise<void>,
): Promise<SubmitTextResult | null> {
  const allowed = and(eq(assignments.id, input.assignmentId), receivedBy(userId), confirmed(userId));
  const [assignment] = await tx
    .update(assignments)
    // updated_at stays: locking is not an edit of the assignment.
    .set({ lockedAt: sql`coalesce(${assignments.lockedAt}, now())`, updatedAt: sql`${assignments.updatedAt}` })
    .where(and(allowed, eq(assignments.contentVersion, input.contentVersion), acknowledgedNotice(userId)))
    // now() is the transaction's: the same instant as submitted_at.
    .returning({ teacherId: assignments.teacherId, late: isLate(sql`now()`, assignments.deadline) });
  if (!assignment) {
    const [shown] = await tx
      .select({ noticeRead: sql<boolean>`${acknowledgedNotice(userId)}` })
      .from(assignments)
      .where(allowed);
    if (!shown) return null;
    return { ok: false, reason: shown.noticeRead ? "changed" : "notice_not_read" } as const;
  }

  const created = await insertReceived(tx, {
    assignmentId: input.assignmentId,
    teacherId: assignment.teacherId,
    studentId: userId,
    late: assignment.late,
    contentVersion: input.contentVersion,
  });
  if (!created) {
    // The pair has its submission: the same request again is the same answer.
    const [same] = await tx
      .select({
        submittedAt: submissions.submittedAt,
        late: submissions.late,
        ref: { submissionId: submissions.id, versionNumber: submissions.currentVersion },
      })
      .from(submissions)
      .innerJoin(submissionVersions, eq(submissionVersions.submissionId, submissions.id))
      .where(
        and(
          eq(submissions.assignmentId, input.assignmentId),
          eq(submissions.studentId, userId),
          eq(submissionVersions.requestId, input.requestId),
        ),
      );
    return same
      ? ({ ok: true, submittedAt: same.submittedAt.toISOString(), late: same.late, ref: same.ref } as const)
      : ({ ok: false, reason: "already_submitted" } as const);
  }

  await insertVersion(created.id);
  return {
    ok: true,
    submittedAt: created.submittedAt.toISOString(),
    late: created.late,
    ref: { submissionId: created.id, versionNumber: 1 },
  } as const;
}

/** One transaction, Read Committed: the shared core (submitFirst), then the text as version 1. */
export async function submitText(actor: Actor, input: NewTextSubmission): Promise<SubmitTextResult | null> {
  const { userId } = authorize(actor, "submission", "write");
  if (checkSubmissionText(input.text)) throw new Error("submitText: the text was not checked");
  return db.transaction((tx) =>
    submitFirst(tx, userId, input, async (submissionId) => {
      await tx.insert(submissionVersions).values({ submissionId, number: 1, mode: "text", text: input.text, requestId: input.requestId });
    }),
  );
}

// SUB-03 (E9, spec 0011): the first submission of pages, confirmed from the
// student's draft. The submission is created only here, with its pages in
// the chosen order and its transcription; the draft goes in the same
// transaction.

/** One word the student replaced; checked again against the page's reading. */
export type ConfirmedChange = { pageId: string; wordIndex: number; engineWord: string; studentWord: string };

export type ConfirmImagesInput = FirstSubmissionInput & {
  draftId: string;
  /** Already normalised and checked one by one (src/server/submissions/images.ts). */
  changes: readonly ConfirmedChange[];
  /**
   * "checked": every page read and checked by the student. "unchecked"
   * (AC-7): a reading failed or the AI was closed; sent as it is, without
   * changes, the pipeline reads the pages left (transition 2 to transcribing).
   */
  mode: "checked" | "unchecked";
};

/**
 * Confirmed (again, for the same request: idempotent, although the draft is
 * gone) as version 1, or as a replacement when the student already submitted
 * (AC-10: text or pages replaced by pages; `replacedAt` then), or refused as
 * a text is, or as a replacement is (the teacher started, no replacement
 * left), or: a page not read yet (checked), every
 * page read ("all_read": unchecked, which is for a page left to read), a
 * change that no longer matches the reading ("stale_change"), two changes of
 * one word, a change on a page without writing, or any change sent unchecked
 * ("bad_change"), a draft without pages. Null when the draft is not the
 * student's, or the assignment not theirs to submit.
 */
export type ConfirmImagesResult =
  | SubmitTextResult
  | ReplaceTextResult
  | { ok: false; reason: "no_pages" | "page_not_read" | "all_read" | "stale_change" | "bad_change" };

/**
 * One transaction. The request is looked up first among the student's
 * versions for this assignment: a confirmation sent again finds its
 * submission, the draft already deleted. Then the draft row is locked (every
 * draft write takes it first), its pages read and checked, the text
 * assembled from the readings and the changes (never from the browser), and
 * a shared core creates the version in mode images: version 1 of a new
 * submission (submitFirst), or the next one when the student has a
 * submission (replaceWith, which keeps its submitted_at and late); the pages
 * are attached in one statement, the transcription and the changes added,
 * the draft deleted. Unchecked (AC-7): the same, without changes nor text,
 * checked_by_student false for the whole version.
 */
export async function confirmImages(actor: Actor, input: ConfirmImagesInput): Promise<ConfirmImagesResult | null> {
  const { userId } = authorize(actor, "submission", "write");
  authorize(actor, "draft", "write");
  authorize(actor, "transcription", "write");

  return db.transaction(async (tx) => {
    const [same] = await tx
      .select({
        submittedAt: submissions.submittedAt,
        late: submissions.late,
        submissionId: submissions.id,
        currentVersion: submissions.currentVersion,
        number: submissionVersions.number,
        createdAt: submissionVersions.createdAt,
      })
      .from(submissions)
      .innerJoin(submissionVersions, eq(submissionVersions.submissionId, submissions.id))
      .where(
        and(
          eq(submissions.assignmentId, input.assignmentId),
          eq(submissions.studentId, userId),
          eq(submissionVersions.requestId, input.requestId),
        ),
      );
    if (same) {
      const ref = { submissionId: same.submissionId, versionNumber: same.number };
      return same.number === 1
        ? ({ ok: true, submittedAt: same.submittedAt.toISOString(), late: same.late, ref } as const)
        : ({ ok: true, replacedAt: same.createdAt.toISOString(), replacementsLeft: left(same.currentVersion), ref } as const);
    }

    const [draft] = await tx
      .select({ id: submissionDrafts.id })
      .from(submissionDrafts)
      .where(
        and(
          eq(submissionDrafts.id, input.draftId),
          eq(submissionDrafts.assignmentId, input.assignmentId),
          eq(submissionDrafts.studentId, userId),
        ),
      )
      .for("update");
    if (!draft) return null;
    // Read after the lock, in a statement of its own (READ COMMITTED: a join under FOR UPDATE is not reread).
    const pages = await tx
      .select({
        id: submissionPages.id,
        position: submissionPages.position,
        status: submissionPages.readingStatus,
        text: submissionPages.readingText,
        hasWriting: submissionPages.hasWriting,
      })
      .from(submissionPages)
      .where(eq(submissionPages.draftId, draft.id));
    if (pages.length === 0) return { ok: false, reason: "no_pages" } as const;
    if (input.mode === "unchecked") {
      // AC-7: the pages as they are, read ones keeping their reading; no change, no text yet.
      if (input.changes.length > 0) return { ok: false, reason: "bad_change" } as const;
      if (pages.every((page) => page.status === "read")) return { ok: false, reason: "all_read" } as const;
      return submitPages(tx, userId, input, draft.id, null, []);
    }
    if (pages.some((page) => page.status !== "read")) return { ok: false, reason: "page_not_read" } as const;

    const byPage = new Map(pages.map((page) => [page.id, { ...page, changes: [] as WordChange[] }]));
    for (const change of input.changes) {
      const page = byPage.get(change.pageId);
      if (!page || !page.hasWriting || page.changes.some((c) => c.wordIndex === change.wordIndex)) {
        return { ok: false, reason: "bad_change" } as const;
      }
      const words = wordsOf(page.text!);
      // AC-8: an existing word of a read page; no word inserted.
      if (change.wordIndex >= words.length) return { ok: false, reason: "bad_change" } as const;
      // A change to the same word changes nothing: refused, so the teacher never sees it highlighted.
      if (change.studentWord === change.engineWord) return { ok: false, reason: "bad_change" } as const;
      if (words[change.wordIndex] !== change.engineWord) return { ok: false, reason: "stale_change" } as const;
      page.changes.push({ wordIndex: change.wordIndex, engineWord: change.engineWord, studentWord: change.studentWord });
    }
    const text = assembleText([...byPage.values()].map((page) => ({ ...page, hasWriting: page.hasWriting!, text: page.text! })));

    return submitPages(tx, userId, input, draft.id, text, input.changes);
  });
}

/**
 * The draft's pages as a new version in mode images: version 1 when the
 * student has no submission for the assignment, else a replacement (AC-10).
 * A first submission made meanwhile by another tab is refused by the unique
 * pair ("already_submitted"), as for a text.
 */
async function submitPages(
  tx: Tx,
  userId: string,
  input: ConfirmImagesInput,
  draftId: string,
  text: string | null,
  changes: readonly ConfirmedChange[],
): Promise<ConfirmImagesResult | null> {
  const insertPages = async (submissionId: string, number: number) => {
    const [version] = await tx
      .insert(submissionVersions)
      .values({ submissionId, number, mode: "images", text: null, requestId: input.requestId })
      .returning({ id: submissionVersions.id, createdAt: submissionVersions.createdAt });
    await attachDraft(tx, draftId, version.id, text, changes);
    return version.createdAt;
  };
  const [existing] = await tx
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.assignmentId, input.assignmentId), eq(submissions.studentId, userId)));
  if (existing) return replaceWith(tx, userId, input, insertPages);
  return submitFirst(tx, userId, input, async (submissionId) => {
    await insertPages(submissionId, 1);
  });
}

/**
 * The draft becomes the pages of a version (the attach, once, 0022), with
 * its transcription and the changes; then the draft goes. A text means
 * checked by the student; null, sent unchecked (the pipeline writes it once
 * it has read the pages). Inside a confirmation's transaction, the draft row locked.
 */
async function attachDraft(tx: Tx, draftId: string, versionId: string, text: string | null, changes: readonly ConfirmedChange[]) {
  await tx.update(submissionPages).set({ draftId: null, versionId }).where(eq(submissionPages.draftId, draftId));
  await tx.insert(submissionTranscriptions).values({ versionId, text, checkedByStudent: text !== null });
  if (changes.length > 0) await tx.insert(transcriptionChanges).values(changes.map((change) => ({ ...change, versionId })));
  await tx.delete(submissionDrafts).where(eq(submissionDrafts.id, draftId));
}

// SUB-05: replacing the submission with a new text version.

/**
 * Transition 11 is open on the student's submission: the teacher has neither
 * changed nor validated it (E7, E8 set teacher_started_at), its state is one
 * transition 11 leaves, fewer than SUBMISSION_MAX_REPLACEMENTS replacements
 * (Q3 [D]), and the student is still an active member of a recipient class
 * (SUB-01 R4). The write guard and the screen read the same predicate.
 */
export const replacementOpen = (userId: string) =>
  and(
    isNull(submissions.teacherStartedAt),
    inArray(submissions.status, sourcesOf(11, "received")),
    lte(submissions.currentVersion, SUBMISSION_MAX_REPLACEMENTS),
    memberOfRecipients(userId, submissions.assignmentId),
  );

/** Replacements left once `currentVersion` versions exist: 2, 1, then 0. */
const left = (currentVersion: number) => Math.max(0, SUBMISSION_MAX_REPLACEMENTS + 1 - currentVersion);

export type ReplaceTextInput = Omit<NewTextSubmission, "contentVersion">;

/**
 * Replaced (again, for the same request: idempotent), or refused: the
 * teacher started first, or no replacement is left. Null when the student has
 * no submission for this assignment, or is no longer an active member.
 * `ref` names the active version, to evaluate again (SUB-05 R2).
 */
export type ReplaceTextResult =
  | { ok: true; replacedAt: string; replacementsLeft: number; ref: EvaluationRef }
  | { ok: false; reason: "teacher_started" | "limit_reached" };

/**
 * The core of a replacement, shared by the text and the images (spec 0011,
 * AC-10), inside the caller's transaction. The submission row is locked
 * first (FOR UPDATE): two replacements, or a replacement and the teacher's
 * first act (E7, E8: an update of this row that names the version seen), run
 * one after the other, and the first one wins. The guard is in the write
 * statement itself. submitted_at and late stay those of the first submission
 * (SUB-04 R2), whatever the mode. `insertVersion` adds the new version, in
 * its mode, and gives back its creation date.
 */
async function replaceWith(
  tx: Tx,
  userId: string,
  input: { assignmentId: string; requestId: string },
  insertVersion: (submissionId: string, number: number) => Promise<Date>,
): Promise<ReplaceTextResult | null> {
  const [submission] = await tx
    .select({
      id: submissions.id,
      currentVersion: submissions.currentVersion,
      teacherStarted: sql<boolean>`${submissions.teacherStartedAt} is not null`,
    })
    .from(submissions)
    .where(and(eq(submissions.assignmentId, input.assignmentId), eq(submissions.studentId, userId)))
    .for("update");
  if (!submission) return null;

  // The same form sent again: the same answer, nothing counted twice.
  const [same] = await tx
    .select({ createdAt: submissionVersions.createdAt })
    .from(submissionVersions)
    .where(and(eq(submissionVersions.submissionId, submission.id), eq(submissionVersions.requestId, input.requestId)));
  if (same) {
    return {
      ok: true,
      replacedAt: same.createdAt.toISOString(),
      replacementsLeft: left(submission.currentVersion),
      ref: { submissionId: submission.id, versionNumber: submission.currentVersion },
    } as const;
  }

  const replaced = await applyTransition(tx, submission.id, 11, "received", {
    where: replacementOpen(userId),
    // The proposal in force was of the old version: none is current any more (SUB-05 R2).
    set: { currentVersion: sql`${submissions.currentVersion} + 1`, currentProposalId: null },
  });
  if (!replaced) {
    if (submission.teacherStarted) return { ok: false, reason: "teacher_started" } as const;
    if (left(submission.currentVersion) === 0) return { ok: false, reason: "limit_reached" } as const;
    // Validated or published without the mark is impossible (check constraint): not a member.
    return null;
  }

  const createdAt = await insertVersion(submission.id, replaced.currentVersion);
  return {
    ok: true,
    replacedAt: createdAt.toISOString(),
    replacementsLeft: left(replaced.currentVersion),
    ref: { submissionId: submission.id, versionNumber: replaced.currentVersion },
  } as const;
}

/** One transaction: the shared core (replaceWith), then the text as the new version. */
export async function replaceText(actor: Actor, input: ReplaceTextInput): Promise<ReplaceTextResult | null> {
  const { userId } = authorize(actor, "submission", "write");
  if (checkSubmissionText(input.text)) throw new Error("replaceText: the text was not checked");

  return db.transaction((tx) =>
    replaceWith(tx, userId, input, async (submissionId, number) => {
      const [version] = await tx
        .insert(submissionVersions)
        .values({ submissionId, number, mode: "text", text: input.text, requestId: input.requestId })
        .returning({ createdAt: submissionVersions.createdAt });
      return version.createdAt;
    }),
  );
}
