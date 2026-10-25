import "server-only";
import { z } from "zod";
import { SUBMISSION_MAX_REPLACEMENTS, SUBMISSION_PAGES_MAX } from "@/config/decisions";
import { DRAFT_READS_MAX, PAGE_INPUT_MAX_PIXELS, PAGE_UPLOAD_MAX_BYTES, STUDENT_DAILY_READS_MAX } from "@/config/provisional";
import { normalizeStudentWord } from "@/lib/submission-text";
import { wordsOf } from "@/lib/transcription";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { addDraftPage, deleteDraftPage, readDraftPage, reorderDraftPages } from "@/server/data/submissions/drafts";
import { confirmImages, type ConfirmedChange } from "@/server/data/submissions/submissions";
import { readPageWith, type ReadingDeps } from "@/server/evaluation/read-page";
import { PageImageError, preparePage } from "./page-image";
import { SUBMISSION_MESSAGES, type SubmissionContext } from "./submissions";

// SUB-03, TRX-01 (E9, spec 0011): a submission by photographed pages, without
// Next request APIs so integration tests can call it. The student uploads
// each page to their draft, has it read by the AI one at a time, checks the
// reading, then confirms: only then is the submission created.

const accessDenied = async (actor: Actor) =>
  recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });

// Upload (the route /api/drafts/[assignmentId]/pages).

/** What the upload route answers: a status and a JSON body, never the image. */
export type UploadPageAnswer =
  | { status: 200; body: { draftId: string; pageId: string; position: number } }
  | { status: 409; body: { reason: "noticeNotRead" } }
  | { status: 413 | 422; body: { reason: "tooLarge" | "notJpeg" | "tooManyPages" | "badPosition" } }
  | { status: 404; body: null };

const notFound = { status: 404, body: null } as const;

const uploadHeaders = z.object({
  uploadRequestId: z.uuid(),
  position: z.coerce.number().int().positive().optional(),
  replacesPageId: z.uuid().optional(),
});

/**
 * One page into the student's draft. The body must be a decodable JPEG within
 * the byte and pixel bounds: it is decoded strictly, turned upright, shrunk if
 * slightly over the bounds, and encoded again without any metadata
 * (page-image.ts); a refused body stores nothing. The only refusal that is
 * not a 404 besides the body's own: the notice in force not read (409).
 */
export async function uploadDraftPage(
  actor: Actor,
  assignmentId: string,
  headers: { uploadRequestId?: string | null; position?: string | null; replacesPageId?: string | null },
  body: Uint8Array,
): Promise<UploadPageAnswer> {
  const fields = uploadHeaders.safeParse({
    uploadRequestId: headers.uploadRequestId ?? undefined,
    position: headers.position || undefined,
    replacesPageId: headers.replacesPageId || undefined,
  });
  if (!z.uuid().safeParse(assignmentId).success || !fields.success) return notFound;
  if (body.length > PAGE_UPLOAD_MAX_BYTES) return { status: 413, body: { reason: "tooLarge" } };

  let page;
  try {
    page = await preparePage(body, { formats: ["jpeg"], maxInputPixels: PAGE_INPUT_MAX_PIXELS });
  } catch (error) {
    if (error instanceof PageImageError) return { status: 422, body: { reason: "notJpeg" } };
    throw error;
  }
  try {
    const result = await addDraftPage(actor, { assignmentId, ...fields.data, page });
    if (!result) return notFound;
    if (result.ok) return { status: 200, body: { draftId: result.draftId, pageId: result.pageId, position: result.position } };
    if (result.reason === "notice_not_read") return { status: 409, body: { reason: "noticeNotRead" } };
    return { status: 422, body: { reason: result.reason === "too_many_pages" ? "tooManyPages" : "badPosition" } };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await accessDenied(actor);
    return notFound;
  }
}

// Reading (readPageAction).

export const READING_MESSAGES = {
  notAllowed: SUBMISSION_MESSAGES.notAllowed,
  unavailable: "This page is no longer in your draft. Reload the page.",
  busy: "This page is already being read. Wait a few seconds.",
  failed: "The page could not be read. Try again.",
  closed: "Reading is not available right now. Try again later.",
  draftCap: `You have asked for ${DRAFT_READS_MAX} readings of these pages, the most allowed. Send your pages as they are, or ask your teacher.`,
  dailyCap: `You have asked for ${STUDENT_DAILY_READS_MAX} readings today, the most allowed in a day. Try again tomorrow.`,
} as const;

export type ReadPageState =
  | { status: "read"; text: string; words: string[]; hasWriting: boolean }
  | { status: "error"; reason: keyof typeof READING_MESSAGES; message: string };

const readFailed = (reason: keyof typeof READING_MESSAGES) => ({ status: "error", reason, message: READING_MESSAGES[reason] }) as const;

/** A page of the student's draft read for their check: its words, in order, and whether it has writing. */
export async function readStudentPage(actor: Actor, rawPageId: unknown, deps: ReadingDeps = {}): Promise<ReadPageState> {
  const pageId = z.uuid().safeParse(rawPageId);
  if (!pageId.success) return readFailed("unavailable");
  try {
    const result = await readDraftPage(actor, pageId.data, readPageWith(pageId.data, deps));
    if (result === null) return readFailed("unavailable");
    if (result === "closed") return readFailed("closed");
    if (!result.ok) {
      const reasons = { busy: "busy", already_read: "unavailable", dropped: "unavailable", draft_cap: "draftCap", daily_cap: "dailyCap" } as const;
      return readFailed(reasons[result.reason]);
    }
    if (!result.reading) return readFailed("failed");
    return { status: "read", text: result.reading.text, words: wordsOf(result.reading.text), hasWriting: result.reading.hasWriting };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await accessDenied(actor);
    return readFailed("notAllowed");
  }
}

// Order and deletion (reorderPagesAction, deletePageAction).

export const DRAFT_MESSAGES = {
  notAllowed: SUBMISSION_MESSAGES.notAllowed,
  unavailable: "Your pages changed in another window. Reload the page.",
} as const;

export type DraftEditState = { status: "done" } | { status: "error"; reason: keyof typeof DRAFT_MESSAGES; message: string };

const draftEditFailed = (reason: keyof typeof DRAFT_MESSAGES) => ({ status: "error", reason, message: DRAFT_MESSAGES[reason] }) as const;

const reorderFields = z.object({ draftId: z.uuid(), pageIds: z.array(z.uuid()).min(1).max(SUBMISSION_PAGES_MAX) });

/** AC-3: the student's pages in the order they chose, every page of the draft named once. */
export async function reorderStudentPages(actor: Actor, raw: unknown): Promise<DraftEditState> {
  const fields = reorderFields.safeParse(raw);
  if (!fields.success) return draftEditFailed("unavailable");
  try {
    const result = await reorderDraftPages(actor, fields.data.draftId, fields.data.pageIds);
    return result?.ok ? { status: "done" } : draftEditFailed("unavailable");
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await accessDenied(actor);
    return draftEditFailed("notAllowed");
  }
}

/** A page out of the student's draft; the ones after it move up. */
export async function deleteStudentPage(actor: Actor, rawPageId: unknown): Promise<DraftEditState> {
  const pageId = z.uuid().safeParse(rawPageId);
  if (!pageId.success) return draftEditFailed("unavailable");
  try {
    return (await deleteDraftPage(actor, pageId.data)) ? { status: "done" } : draftEditFailed("unavailable");
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await accessDenied(actor);
    return draftEditFailed("notAllowed");
  }
}

// Confirmation (confirmImagesAction).

export const CONFIRM_MESSAGES = {
  ...SUBMISSION_MESSAGES,
  noPages: "Add at least one page before you send.",
  pageNotRead: "Every page must be read before you send. Read the pages left, then send.",
  staleChange: "A page was read again since you changed it. Check your changes, then send.",
  badChange: "One of your changes is not valid. Check them, then send.",
  allRead: "Every page is read now. Check the reading, then send.",
  // AC-10, SUB-05: pages sent in place of the submission.
  teacherStarted: "Your teacher has started marking your submission: it can no longer be replaced. Your pages were not sent.",
  limitReached: `You have already replaced this submission ${SUBMISSION_MAX_REPLACEMENTS} times, the most allowed. Your pages were not sent.`,
} as const;

export type ConfirmImagesState =
  | { status: "idle" }
  | { status: "error"; reason: keyof typeof CONFIRM_MESSAGES; message: string }
  | { status: "done"; submittedAt: string; late: boolean }
  /** AC-10: the pages replaced the submission; its first date and late mark stay. */
  | { status: "replaced"; replacedAt: string; replacementsLeft: number };

const confirmFields = z.object({
  assignmentId: z.uuid(),
  draftId: z.uuid(),
  contentVersion: z.coerce.number().int().positive(),
  requestId: z.uuid(),
  changes: z
    .array(z.object({ pageId: z.uuid(), wordIndex: z.number().int().nonnegative(), engineWord: z.string(), studentWord: z.string() }))
    .max(10_000),
  mode: z.enum(["checked", "unchecked"]),
});

const notConfirmed = (reason: keyof typeof CONFIRM_MESSAGES) => ({ status: "error", reason, message: CONFIRM_MESSAGES[reason] }) as const;

/**
 * AC-1: the pages read and checked become one submission (mode images), its
 * pages in the chosen order, its transcription the readings with the
 * student's changes; the dated confirmation comes back. The same request
 * again gives the same confirmation. Confirmed: the version is handed to
 * `ctx.onReceived` and evaluated on the confirmed text, as a pasted one.
 * AC-7, sent "unchecked" after a failed reading: the pipeline reads the
 * pages left first, and the teacher sees the text "not checked by the student".
 * AC-10: once submitted, the pages replace the submission, under the guards
 * of a text replacement (SUB-05), and are evaluated again.
 */
export async function confirmStudentImages(actor: Actor, raw: unknown, ctx: SubmissionContext): Promise<ConfirmImagesState> {
  const fields = confirmFields.safeParse(raw);
  if (!fields.success) return notConfirmed("unavailable");
  const changes: ConfirmedChange[] = [];
  for (const change of fields.data.changes) {
    const studentWord = normalizeStudentWord(change.studentWord);
    if (studentWord === null) return notConfirmed("badChange");
    changes.push({ ...change, studentWord });
  }

  try {
    const result = await confirmImages(actor, { ...fields.data, changes });
    if (!result) return notConfirmed("unavailable");
    if (!result.ok) {
      const reasons = {
        changed: "changed",
        already_submitted: "alreadySubmitted",
        notice_not_read: "noticeNotRead",
        no_pages: "noPages",
        page_not_read: "pageNotRead",
        all_read: "allRead",
        stale_change: "staleChange",
        bad_change: "badChange",
        teacher_started: "teacherStarted",
        limit_reached: "limitReached",
      } as const;
      return notConfirmed(reasons[result.reason]);
    }
    ctx.onReceived(result.ref);
    if ("replacedAt" in result) return { status: "replaced", replacedAt: result.replacedAt, replacementsLeft: result.replacementsLeft };
    return { status: "done", submittedAt: result.submittedAt, late: result.late };
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await accessDenied(actor);
    return notConfirmed("notAllowed");
  }
}
