import "server-only";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { DEADLINE_TIME_ZONE, SUBMISSION_PAGES_MAX } from "@/config/decisions";
import { DRAFT_READS_MAX, STUDENT_DAILY_READS_MAX } from "@/config/provisional";
import type { AiProvider, EvaluationError } from "@/lib/evaluation";
import type { PageReadingStatus, ReadingOutcome } from "@/lib/transcription";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignments, readingRuns, submissionDrafts, submissionPages, submissions, users } from "@/server/db/schema";
import { receivedBy } from "../assignments/received";
import { acknowledgedNotice } from "../notices/notices";
import { replacementOpen } from "./submissions";

// SUB-03 (E9, spec 0011): the student's draft of pages, before anything is
// sent. Every draft write first locks the draft row (FOR UPDATE), and bumps
// its updated_at on the database clock (the sweep's lifetime, DRAFT_TTL_MS).
// Only the draft's owner reads or writes it; the teacher never sees one.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A page already checked and encoded again by the server (page-image.ts). */
export type PreparedDraftPage = { bytes: Buffer; width: number; height: number; sha256: string };

export type NewDraftPage = {
  assignmentId: string;
  /** The browser's id of this upload: the same id again stores one page. */
  uploadRequestId: string;
  /** Wanted position; the next free one when absent. */
  position?: number;
  /** A retake: this page of the draft goes, the new one takes its position. */
  replacesPageId?: string;
  page: PreparedDraftPage;
};

/**
 * Stored (or the same upload again), or refused: the notice in force not read
 * (the only refusal the student sees as such, a 409), the most pages reached,
 * or a position taken or out of bounds. Null when the assignment is not one
 * the student may submit for (absent, not received, unconfirmed account, or
 * already submitted with no replacement open), or the page to retake is not
 * in their draft.
 */
export type AddDraftPageResult =
  | { ok: true; draftId: string; pageId: string; position: number }
  | { ok: false; reason: "notice_not_read" | "too_many_pages" | "bad_position" };

const confirmed = (userId: string) =>
  sql`exists (select 1 from ${users} where ${users.id} = ${userId} and ${users.emailVerified})`;

/**
 * Pages may go into a draft before the first submission, or while the
 * student may still replace it (AC-10, SUB-05: the guard of transition 11,
 * checked again at the confirmation).
 */
const mayAddPages = (userId: string) =>
  or(
    sql`not exists (select 1 from ${submissions} where ${submissions.assignmentId} = ${assignments.id} and ${submissions.studentId} = ${userId})`,
    sql`exists (select 1 from ${submissions} where ${submissions.assignmentId} = ${assignments.id} and ${submissions.studentId} = ${userId} and ${replacementOpen(userId)})`,
  );

/**
 * The student's draft for this assignment, found or created, then locked; its
 * updated_at bumped. Null when a confirmation or the sweep deleted it between
 * the insert (which locks nothing when the row exists) and the lock.
 */
async function lockOwnDraft(tx: Tx, assignmentId: string, userId: string): Promise<string | null> {
  await tx
    .insert(submissionDrafts)
    .values({ assignmentId, studentId: userId })
    .onConflictDoNothing({ target: [submissionDrafts.assignmentId, submissionDrafts.studentId] });
  const [draft] = await tx
    .select({ id: submissionDrafts.id })
    .from(submissionDrafts)
    .where(and(eq(submissionDrafts.assignmentId, assignmentId), eq(submissionDrafts.studentId, userId)))
    .for("update");
  if (!draft) return null;
  await tx.update(submissionDrafts).set({ updatedAt: sql`now()` }).where(eq(submissionDrafts.id, draft.id));
  return draft.id;
}

/**
 * The role check of addDraftPage alone, before the upload decodes its body
 * (the costly part): a role without the right throws AccessDeniedError here,
 * so no body is decoded for it. addDraftPage checks it again, with the rest.
 */
export function assertDraftWriter(actor: Actor): void {
  authorize(actor, "draft", "write");
}

/**
 * One transaction: the assignment is checked (received, account confirmed,
 * no submission yet or a replacement open, the notice read), the draft found or created and
 * locked, then the page stored. A retake drops the old page and stores the
 * new one at its position in the same transaction, so it works at
 * SUBMISSION_PAGES_MAX pages.
 */
export async function addDraftPage(actor: Actor, input: NewDraftPage): Promise<AddDraftPageResult | null> {
  const { userId } = authorize(actor, "draft", "write");
  return db.transaction(async (tx) => {
    const [assignment] = await tx
      .select({ noticeRead: sql<boolean>`${acknowledgedNotice(userId)}` })
      .from(assignments)
      .where(and(eq(assignments.id, input.assignmentId), receivedBy(userId), confirmed(userId), mayAddPages(userId)));
    if (!assignment) return null;
    if (!assignment.noticeRead) return { ok: false, reason: "notice_not_read" } as const;

    const draftId = await lockOwnDraft(tx, input.assignmentId, userId);
    if (!draftId) return null;
    const [same] = await tx
      .select({ id: submissionPages.id, position: submissionPages.position })
      .from(submissionPages)
      .where(and(eq(submissionPages.draftId, draftId), eq(submissionPages.uploadRequestId, input.uploadRequestId)));
    if (same) return { ok: true, draftId, pageId: same.id, position: same.position } as const;

    let position: number;
    if (input.replacesPageId) {
      const [old] = await tx
        .delete(submissionPages)
        .where(and(eq(submissionPages.id, input.replacesPageId), eq(submissionPages.draftId, draftId)))
        .returning({ position: submissionPages.position });
      if (!old) return null;
      position = old.position;
    } else {
      const pages = await tx.select({ position: submissionPages.position }).from(submissionPages).where(eq(submissionPages.draftId, draftId));
      if (pages.length >= SUBMISSION_PAGES_MAX) return { ok: false, reason: "too_many_pages" } as const;
      const taken = new Set(pages.map((page) => page.position));
      position = input.position ?? Math.max(0, ...taken) + 1;
      if (position < 1 || position > SUBMISSION_PAGES_MAX || taken.has(position)) return { ok: false, reason: "bad_position" } as const;
    }

    const [page] = await tx
      .insert(submissionPages)
      .values({
        draftId,
        position,
        image: input.page.bytes,
        byteLength: input.page.bytes.length,
        width: input.page.width,
        height: input.page.height,
        sha256: input.page.sha256,
        uploadRequestId: input.uploadRequestId,
      })
      .returning({ id: submissionPages.id });
    return { ok: true, draftId, pageId: page.id, position } as const;
  });
}

/** How one reading went, without content but its answer (QUA-02): what reading_runs stores. */
export type ReadingRunRecord = {
  outcome: ReadingOutcome;
  provider: AiProvider;
  modelRequested: string;
  modelAnswered: string | null;
  promptVersion: string;
  attempts: number;
  attemptErrors: EvaluationError[];
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
};

/** What a reading gave: the run, and the reading itself when one came. */
export type PageReadResult = { run: ReadingRunRecord; reading: { hasWriting: boolean; text: string } | null };

/**
 * A page's read, or why it did not happen: the page is not the student's
 * (null), already being read ("busy": a double tap is one billed call), or
 * already read ("read", nothing sent), or a read cap reached (AC-8, nothing
 * sent); "dropped" when the result came after the page left the draft (a
 * confirmation won): the run is still recorded.
 */
export type ReadDraftPageResult =
  | { ok: true; status: PageReadingStatus; reading: { hasWriting: boolean; text: string } | null }
  | { ok: false; reason: "busy" | "already_read" | "dropped" | "draft_cap" | "daily_cap" };

/**
 * AC-8: the interactive reads so far, of this draft and of this student over
 * the current day in DEADLINE_TIME_ZONE. Counted on reading_runs, which
 * outlive a deleted page or draft: deleting a draft resets neither count of
 * the day. Two pages read at the same moment may each pass the last free
 * read: the overshoot is bounded by the pages in flight.
 * The day starts in SQL, on the database clock, on purpose: the reading runs
 * are dated by that clock (src/server/db/AGENTS.md, two clocks), and a start
 * computed on the container clock would drift from them near midnight.
 */
async function readCapReached(tx: Tx, draftId: string, userId: string): Promise<"draft_cap" | "daily_cap" | null> {
  const dayStart = sql`date_trunc('day', now() at time zone ${DEADLINE_TIME_ZONE}) at time zone ${DEADLINE_TIME_ZONE}`;
  const [counts] = await tx
    .select({
      draft: sql<number>`count(*) filter (where ${readingRuns.draftId} = ${draftId})::int`,
      day: sql<number>`count(*) filter (where ${readingRuns.createdAt} >= ${dayStart})::int`,
    })
    .from(readingRuns)
    // Interactive reads only: a pipeline read carries the submission, not a draft.
    .where(and(eq(readingRuns.studentId, userId), isNotNull(readingRuns.draftId)));
  if (counts.draft >= DRAFT_READS_MAX) return "draft_cap";
  if (counts.day >= STUDENT_DAILY_READS_MAX) return "daily_cap";
  return null;
}

/** The advisory lock of a page's read: per page, so two pages read at once. */
const pageReadLock = (pageId: string) => sql`hashtextextended(${`page-read:${pageId}`}, 0)`;

/**
 * Reads a page of the student's own draft. One transaction holds an advisory
 * lock on the page for the read (a second read of it gets "busy"), reads its
 * JPEG, hands it to `read` (the reading service: the guard, the reader, its
 * retry), then records the run and, under the draft's lock, the result: only
 * when the page still has its draft and is pending or failed. The JPEG never
 * leaves through the result.
 * The transaction stays open during the AI call (up to READ_REQUEST_MAX_MS):
 * it holds a pooled connection and the advisory lock, not the page row. Kept
 * on purpose, for the demo's load: the lock is what makes a double tap one
 * billed call. Splitting it (mark the page "reading", call outside, write in a
 * second transaction) would turn that lock into a status, with its own
 * release on a crash.
 */
export async function readDraftPage(
  actor: Actor,
  pageId: string,
  read: (jpeg: Buffer) => Promise<PageReadResult | "closed">,
): Promise<ReadDraftPageResult | "closed" | null> {
  const { userId } = authorize(actor, "draft", "write");
  return db.transaction(async (tx) => {
    // Ownership before the lock: another student's page answers null, never "busy".
    const [owned] = await tx
      .select({ id: submissionPages.id })
      .from(submissionPages)
      .innerJoin(submissionDrafts, eq(submissionDrafts.id, submissionPages.draftId))
      .where(and(eq(submissionPages.id, pageId), eq(submissionDrafts.studentId, userId)));
    if (!owned) return null;
    const [{ locked }] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${pageReadLock(pageId)}) as locked`).then((r) => r.rows);
    if (!locked) return { ok: false, reason: "busy" } as const;
    // Read again under the lock (read committed: a fresh snapshot): a read that
    // committed between the first select and the lock is seen, not billed twice.
    const [page] = await tx
      .select({ draftId: submissionPages.draftId, status: submissionPages.readingStatus, image: submissionPages.image })
      .from(submissionPages)
      .where(eq(submissionPages.id, pageId));
    if (!page?.draftId) return null;
    if (page.status === "read") return { ok: false, reason: "already_read" } as const;
    const capped = await readCapReached(tx, page.draftId, userId);
    if (capped) return { ok: false, reason: capped } as const;

    const result = await read(page.image);
    if (result === "closed") return "closed";
    const [run] = await tx
      .insert(readingRuns)
      // A page deleted during its read leaves the run without it (on delete set null).
      .values({ ...result.run, pageId: sql`(select ${submissionPages.id} from ${submissionPages} where ${submissionPages.id} = ${pageId})`, draftId: page.draftId, studentId: userId })
      .returning({ id: readingRuns.id });

    const [draft] = await tx
      .select({ id: submissionDrafts.id })
      .from(submissionDrafts)
      .where(eq(submissionDrafts.id, page.draftId))
      .for("update");
    if (!draft) return { ok: false, reason: "dropped" } as const;
    const { reading } = result;
    const [written] = await tx
      .update(submissionPages)
      .set(
        reading
          ? { readingStatus: "read", readingText: reading.text, hasWriting: reading.hasWriting, readingRunId: run.id, readAt: sql`now()` }
          : { readingStatus: "failed" },
      )
      .where(and(eq(submissionPages.id, pageId), eq(submissionPages.draftId, draft.id), inArray(submissionPages.readingStatus, ["pending", "failed"])))
      .returning({ status: submissionPages.readingStatus });
    if (!written) return { ok: false, reason: "dropped" } as const;
    await tx.update(submissionDrafts).set({ updatedAt: sql`now()` }).where(eq(submissionDrafts.id, draft.id));
    return { ok: true, status: written.status, reading } as const;
  });
}

/** The student's own draft, locked (FOR UPDATE) and its updated_at bumped; null when it is not theirs or is gone. */
async function lockDraftById(tx: Tx, draftId: string, userId: string): Promise<string | null> {
  const [draft] = await tx
    .select({ id: submissionDrafts.id })
    .from(submissionDrafts)
    .where(and(eq(submissionDrafts.id, draftId), eq(submissionDrafts.studentId, userId)))
    .for("update");
  if (!draft) return null;
  await tx.update(submissionDrafts).set({ updatedAt: sql`now()` }).where(eq(submissionDrafts.id, draft.id));
  return draft.id;
}

/**
 * Gives the pages of the draft the positions 1, 2, … in the order of
 * `pageIds`, in one statement each, under the draft's lock; the unique
 * position is checked at the commit (deferrable, 0022), so pages swap.
 */
async function placePages(tx: Tx, draftId: string, pageIds: readonly string[]) {
  for (const [index, id] of pageIds.entries()) {
    await tx
      .update(submissionPages)
      .set({ position: index + 1 })
      .where(and(eq(submissionPages.id, id), eq(submissionPages.draftId, draftId)));
  }
}

/**
 * AC-3: the pages of the student's draft in the order chosen. `pageIds` must
 * be exactly the draft's pages, each once ("mismatch" otherwise: a page added
 * or deleted in another tab). Null when the draft is not theirs or is gone.
 */
export async function reorderDraftPages(
  actor: Actor,
  draftId: string,
  pageIds: readonly string[],
): Promise<{ ok: true } | { ok: false; reason: "mismatch" } | null> {
  const { userId } = authorize(actor, "draft", "write");
  return db.transaction(async (tx) => {
    const draft = await lockDraftById(tx, draftId, userId);
    if (!draft) return null;
    const pages = await tx.select({ id: submissionPages.id }).from(submissionPages).where(eq(submissionPages.draftId, draft));
    const wanted = new Set(pageIds);
    if (wanted.size !== pageIds.length || pages.length !== pageIds.length || pages.some((page) => !wanted.has(page.id))) {
      return { ok: false, reason: "mismatch" } as const;
    }
    await placePages(tx, draft, pageIds);
    return { ok: true } as const;
  });
}

/**
 * A page out of the student's draft; the pages after it move up one place,
 * so positions stay 1, 2, … and the next page goes last. A page being read
 * goes too: its run stays, without it. Null when the page is not in a draft
 * of theirs.
 */
export async function deleteDraftPage(actor: Actor, pageId: string): Promise<{ ok: true } | null> {
  const { userId } = authorize(actor, "draft", "write");
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ draftId: submissionPages.draftId })
      .from(submissionPages)
      .innerJoin(submissionDrafts, eq(submissionDrafts.id, submissionPages.draftId))
      .where(and(eq(submissionPages.id, pageId), eq(submissionDrafts.studentId, userId)));
    if (!owned?.draftId) return null;
    const draft = await lockDraftById(tx, owned.draftId, userId);
    if (!draft) return null;
    const [deleted] = await tx
      .delete(submissionPages)
      .where(and(eq(submissionPages.id, pageId), eq(submissionPages.draftId, draft)))
      .returning({ id: submissionPages.id });
    if (!deleted) return null;
    const left = await tx
      .select({ id: submissionPages.id })
      .from(submissionPages)
      .where(eq(submissionPages.draftId, draft))
      .orderBy(asc(submissionPages.position));
    await placePages(tx, draft, left.map((page) => page.id));
    return { ok: true } as const;
  });
}

/** A page of the student's draft, as the screen shows it: never its bytes (the image route serves them). */
export type OwnDraftPage = Readonly<{
  id: string;
  position: number;
  status: PageReadingStatus;
  /** The engine's reading, when read. */
  text: string | null;
  hasWriting: boolean | null;
}>;

export type OwnDraft = Readonly<{ id: string; pages: readonly OwnDraftPage[] }>;

/** The student's own draft for an assignment, pages in order; null when they have none. */
export async function getOwnDraft(actor: Actor, assignmentId: string): Promise<OwnDraft | null> {
  const { userId } = authorize(actor, "draft", "read");
  const [draft] = await db
    .select({ id: submissionDrafts.id })
    .from(submissionDrafts)
    .where(and(eq(submissionDrafts.assignmentId, assignmentId), eq(submissionDrafts.studentId, userId)));
  if (!draft) return null;
  const pages = await db
    .select({
      id: submissionPages.id,
      position: submissionPages.position,
      status: submissionPages.readingStatus,
      text: submissionPages.readingText,
      hasWriting: submissionPages.hasWriting,
    })
    .from(submissionPages)
    .where(eq(submissionPages.draftId, draft.id))
    .orderBy(asc(submissionPages.position));
  return { id: draft.id, pages };
}

/**
 * AC-18, the sweep (no Actor, called only by src/server/evaluation/sweep.ts):
 * deletes the drafts with no write for `ttlMs` (DRAFT_TTL_MS), their pages
 * with them (cascade); their reading runs stay, without the page. A draft
 * locked by a write in progress (an upload, a read's result, a confirmation)
 * is skipped, not waited for: that write bumps its updated_at, and a
 * confirmation deletes it anyway. Identifiers of the deleted drafts.
 */
export async function deleteStaleDrafts(ttlMs: number): Promise<string[]> {
  return db.transaction(async (tx) => {
    const stale = await tx
      .select({ id: submissionDrafts.id })
      .from(submissionDrafts)
      .where(sql`${submissionDrafts.updatedAt} < now() - make_interval(secs => ${ttlMs / 1000})`)
      .for("update", { skipLocked: true });
    if (stale.length === 0) return [];
    const deleted = await tx
      .delete(submissionDrafts)
      .where(inArray(submissionDrafts.id, stale.map((draft) => draft.id)))
      .returning({ id: submissionDrafts.id });
    return deleted.map((draft) => draft.id);
  });
}
