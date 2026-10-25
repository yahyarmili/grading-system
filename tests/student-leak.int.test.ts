import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AI_MAX_ATTEMPTS } from "@/config/provisional";
import type { EvaluationRef } from "@/lib/evaluation";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getReaderSimulator, getSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { getStudentAssignment, listStudentAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { getPublishedResult } from "@/server/data/results/student";
import { getOwnDraft } from "@/server/data/submissions/drafts";
import { getOwnSubmission } from "@/server/data/submissions/student";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { classMemberships, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { endTranscription, startTranscription, transcribePage } from "@/server/evaluation/transcribe";
import { acknowledgeNoticeReading } from "@/server/notices/notices";
import { saveTeacherEvaluation } from "@/server/review/evaluation";
import { publishTeacherEvaluation, validateTeacherEvaluation, withdrawTeacherPublication } from "@/server/review/publication";
import { checkAssignmentFreshness, checkListFreshness, checkResultFreshness, resultToken, viewToken } from "@/server/results/freshness";
import { confirmStudentImages, readStudentPage, uploadDraftPage } from "@/server/submissions/images";
import { replaceStudentText, submitStudentText } from "@/server/submissions/submissions";
import { findLeak, INTERNAL_CODES, INTERNAL_LABELS, leakMarkers, type Received } from "./helpers/leak";
import { getCopy, readTeacherNotice } from "./helpers/review";
import { noTrigger } from "./helpers/triggers";

// E8.4, PUB-02 R2, NFR-EXP-04 (E8 plan §6): the leak sweep, a blocking
// check of `npm test`. Unique markers in every text of the simulated proposal
// (justifications, comment, next step) and its four alerts, and in every
// text of the teacher's evaluation. In each situation, everything the student
// can reach is called (the data functions of their pages, the services of
// their Server Actions, the freshness check, errors included) and its output
// searched: the test fails at the first marker found, and names it.
// Situations: To review (changed by the teacher); Validated, not published;
// published then withdrawn; published then changed (back To review, Q8); the
// AI's refusal; a manual evaluation, Validated; Published, where the
// teacher's markers appear in the result only, through its closed list.
// Images (E9, AC-14): a checked copy, To review; an unchecked one whose
// reading failed in the pipeline (transcription_failed); the draft and the
// page reading join the entry points.
// The Server Actions add nothing but getActor() and refresh() around these
// services; their HTTP answers and the back button: e2e/student-leak.spec.ts.

/** Under SHORT_TEXT_MIN_WORDS: the proposal carries the "very short" alert, besides the model's three flags. */
const TEXT = "My town is small but it is beatiful. There is a market every friday.";
const markers = leakMarkers();
const { proposalMarkers, teacherMarkers } = markers;

/** The teacher's evaluation, every text replaced by a marker: none comes from the proposal (unchanged, a justification would be the teacher's remark). */
const TEACHER_FORM = {
  levels: { task: 3, organization: 3, vocabulary: 3, grammar: 2, mechanics: 2 },
  remarks: markers.teacher.remarks,
  generalComment: markers.teacher.generalComment,
  nextSteps: markers.teacher.nextSteps.join("\n"),
  grade: { fixed: true, value: 15 },
  rereadDone: [],
};

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `leak-${role}${n}-${randomUUID().slice(0, 6)}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A teacher, an assignment of theirs, a student who read the notice and a classmate, both in its class. */
async function recipients() {
  const teacher = await createUser("teacher");
  const [student, classmate] = [await createUser("student"), await createUser("student")];
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values([student, classmate].map((s) => ({ classId: made.classId, studentId: s.userId })));
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  await acknowledgeNotice(student, STUDENT_NOTICE.version);
  return { teacher, student, classmate, assignmentId: created.assignmentId };
}

/** The simulator's proposal: every text a marker, and the model's three flags. */
function markedProposal() {
  const simulator = getSimulator();
  simulator.clear();
  simulator.setTexts({ ...markers.proposal, flags: { other_language: true, off_topic: true, addressed_to_marker: true } });
  return simulator;
}

/** A student and a classmate; the student submitted TEXT, then the simulator evaluated it with the markers (or refused). */
async function evaluatedCopy({ refused = false } = {}) {
  const { teacher, student, classmate, assignmentId } = await recipients();
  const submitted = await submitText(student, { assignmentId, contentVersion: 1, requestId: randomUUID(), text: TEXT });
  if (!submitted?.ok) throw new Error("Not submitted");

  const simulator = markedProposal();
  if (refused) simulator.failNext({ kind: "refusal", category: "cyber" });
  const outcome = await evaluateSubmission(
    submitted.ref.submissionId,
    { evaluator: simulator, registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
    { expectedVersion: 1, claimToken: randomUUID() },
  );
  simulator.clear();
  expect(outcome.status).toBe(refused ? "evaluation_failed" : "to_review");
  return { teacher, student, classmate, assignmentId };
}
type Copy = Awaited<ReturnType<typeof evaluatedCopy>>;

/** A blank photographed page, as the browser sends it. */
const PAGE = () => sharp({ create: { width: 600, height: 800, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();

/**
 * E9: the student sent one photographed page. Checked: read, one word
 * changed, confirmed, then evaluated with the markers (To review). Unchecked:
 * its reading failed, sent as is, then the pipeline's reading failed too
 * (transcription_failed, a state the student never sees).
 */
async function imageCopy({ checked }: { checked: boolean }): Promise<Copy> {
  const copy = await recipients();
  const { student, assignmentId } = copy;
  const uploaded = await uploadDraftPage(student, assignmentId, { uploadRequestId: randomUUID(), position: "1" }, await PAGE());
  if (uploaded.status !== 200 || !("pageId" in uploaded.body)) throw new Error("Page not uploaded");
  const { draftId, pageId } = uploaded.body;
  const reader = getReaderSimulator();
  reader.clear();
  if (!checked) reader.failNext({ kind: "error", status: 500 }, 2);
  const read = await readStudentPage(student, pageId, { reader });
  expect(read.status).toBe(checked ? "read" : "error");

  let ref: EvaluationRef | undefined;
  const confirmed = await confirmStudentImages(
    student,
    {
      assignmentId, draftId, contentVersion: 1, requestId: randomUUID(), mode: checked ? "checked" : "unchecked",
      changes: checked && read.status === "read" ? [{ pageId, wordIndex: 0, engineWord: read.words[0], studentWord: "Changed" }] : [],
    },
    { onReceived: (received) => (ref = received) },
  );
  if (confirmed.status !== "done" || !ref) throw new Error("Pages not confirmed");

  if (checked) {
    const simulator = markedProposal();
    const outcome = await evaluateSubmission(
      ref.submissionId,
      { evaluator: simulator, registry: RUBRIC_VERSIONS, sleep: async () => {}, callTimeoutMs: 5_000 },
      { expectedVersion: 1, claimToken: randomUUID() },
    );
    simulator.clear();
    expect(outcome.status).toBe("to_review");
  } else {
    const token = randomUUID();
    const start = await startTranscription(ref, token, undefined);
    if (start.status !== "claimed") throw new Error("Not claimed for transcription");
    reader.failNext({ kind: "error", status: 500 }, AI_MAX_ATTEMPTS);
    for (const page of start.pageIds) {
      expect(await transcribePage(ref, token, page, { reader, limits: { attempts: AI_MAX_ATTEMPTS, maxMs: 5_000, sleep: async () => {} } })).toBe("failed");
    }
    expect(await endTranscription(ref, token)).toBe("transcription_failed");
  }
  reader.clear();
  return copy;
}

const seenOf = async (copy: Copy) => (await getCopy(copy.teacher, copy.assignmentId, copy.student.userId))!.seen!;

/** Calls `read` and keeps its answer, or its error, as text. */
async function keep(received: Received[], source: string, read: () => Promise<unknown>) {
  let body: string;
  try {
    body = JSON.stringify(await read()) ?? "undefined";
  } catch (error) {
    body = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  received.push({ source, body });
}

/**
 * Everything the student and a classmate can reach about this assignment,
 * as received. The replacement is sent only where it would be refused (it
 * would change the copy otherwise): an empty text is sent instead.
 */
async function studentReceives(copy: Copy): Promise<Received[]> {
  const { student, classmate, assignmentId } = copy;
  const received: Received[] = [];
  const shown = await getPublishedResult(student, assignmentId);
  const token = shown ? resultToken(shown) : "a-token";
  for (const [who, actor] of [["student", student], ["classmate", classmate]] as const) {
    await keep(received, `${who}: listStudentAssignments`, () => listStudentAssignments(actor));
    await keep(received, `${who}: getStudentAssignment`, () => getStudentAssignment(actor, assignmentId));
    await keep(received, `${who}: getPublishedResult`, () => getPublishedResult(actor, assignmentId));
    await keep(received, `${who}: getOwnSubmission`, () => getOwnSubmission(actor, assignmentId));
    // E9: the draft of photographed pages (none once sent), and a reading asked for.
    await keep(received, `${who}: getOwnDraft`, () => getOwnDraft(actor, assignmentId));
    await keep(received, `${who}: readPageAction`, () => readStudentPage(actor, randomUUID(), { reader: getReaderSimulator() }));
    await keep(received, `${who}: checkFreshnessAction`, () => checkResultFreshness(actor, { assignmentId, token }));
    // E8.7: the checks of My assignments and of the assignment, with the token of the page as shown.
    await keep(received, `${who}: checkListFreshnessAction`, async () =>
      checkListFreshness(actor, { token: viewToken(await listStudentAssignments(actor)) }));
    await keep(received, `${who}: checkAssignmentFreshnessAction`, async () =>
      checkAssignmentFreshness(actor, { assignmentId, token: viewToken(await getStudentAssignment(actor, assignmentId)) }));
    await keep(received, `${who}: submitTextAction`, () =>
      submitStudentText(actor, { assignmentId, contentVersion: 1, requestId: randomUUID(), text: "A second text." }, noTrigger));
    const closed = (await getStudentAssignment(actor, assignmentId))?.canReplace !== true;
    await keep(received, `${who}: replaceTextAction`, () =>
      replaceStudentText(actor, { assignmentId, requestId: randomUUID(), text: closed ? "A new text." : "" }, noTrigger));
    await keep(received, `${who}: acknowledgeNoticeAction`, () => acknowledgeNoticeReading(actor, { version: STUDENT_NOTICE.version }));
    await keep(received, `${who}: checkFreshnessAction, malformed`, () => checkResultFreshness(actor, { assignmentId: "not-a-uuid", token }));
  }
  return received;
}

/** Fails at the first marker of the proposal, internal word, or (unless `published`) teacher's marker found. */
function expectNoLeak(received: Received[], { published = false } = {}) {
  expect(findLeak(received, [...proposalMarkers, ...INTERNAL_CODES, ...INTERNAL_LABELS])).toBeNull();
  const elsewhere = published ? received.filter((r) => r.source !== "student: getPublishedResult") : received;
  expect(findLeak(elsewhere, teacherMarkers)).toBeNull();
}

const RESULT_KEYS = ["aiAssisted", "assignmentId", "criteria", "finalGrade", "generalComment", "gradeAdjusted", "language", "nextSteps", "rubricVersion", "title"];

describe("the leak sweep (E8.4, PUB-02 R2): nothing of the review reaches the student before publication", { timeout: 300_000 }, () => {
  it("the markers are where the sweep looks: in the teacher's copy, found by it (the sweep is not blind)", async () => {
    const copy = await evaluatedCopy();
    expect((await saveTeacherEvaluation(copy.teacher, { ...TEACHER_FORM, seen: await seenOf(copy) })).status).toBe("saved");
    const teacherSees: Received[] = [];
    await keep(teacherSees, "teacher: getCopy", () => getCopy(copy.teacher, copy.assignmentId, copy.student.userId));
    for (const word of [...proposalMarkers, ...teacherMarkers, '"very_short"', '"other_language"', '"off_topic"', '"addressed_to_marker"']) {
      expect(findLeak(teacherSees, [word]), word).toBe(`${word} in teacher: getCopy`);
    }
  });

  it("To review, Validated, published then withdrawn, published then changed: nothing; Published: the teacher's markers, in the result only", async () => {
    const copy = await evaluatedCopy();

    // 1. To review, the teacher's evaluation saved.
    expect((await saveTeacherEvaluation(copy.teacher, { ...TEACHER_FORM, seen: await seenOf(copy) })).status).toBe("saved");
    expectNoLeak(await studentReceives(copy));

    // 2. Validated, not published.
    expect(await validateTeacherEvaluation(copy.teacher, { ...TEACHER_FORM, seen: await seenOf(copy) })).toMatchObject({ status: "decided", published: false });
    expectNoLeak(await studentReceives(copy));

    // 3. Published: every teacher's marker in the result, nowhere else; only the closed list's keys.
    expect((await publishTeacherEvaluation(copy.teacher, await seenOf(copy))).status).toBe("done");
    const published = await studentReceives(copy);
    expectNoLeak(published, { published: true });
    const result = published.find((r) => r.source === "student: getPublishedResult")!.body;
    for (const word of teacherMarkers) expect(result, word).toContain(word);
    expect(Object.keys(JSON.parse(result)).sort()).toEqual(RESULT_KEYS);
    expect(JSON.parse(result).criteria.map((c: object) => Object.keys(c).sort())).toEqual(Array(5).fill(["id", "level", "remark"]));

    // 4. Withdrawn: nothing again, the freshness check of the page shown included.
    expect((await withdrawTeacherPublication(copy.teacher, await seenOf(copy))).status).toBe("done");
    expectNoLeak(await studentReceives(copy));

    // 5. Published again, then changed: back To review (Q8), nothing.
    expect((await publishTeacherEvaluation(copy.teacher, await seenOf(copy))).status).toBe("done");
    const changed = { ...TEACHER_FORM, generalComment: `${markers.teacher.generalComment} again`, seen: await seenOf(copy) };
    expect(await saveTeacherEvaluation(copy.teacher, changed)).toMatchObject({ status: "saved" });
    expect((await seenOf(copy)).status).toBe("to_review");
    expectNoLeak(await studentReceives(copy));
  });

  it("the AI's refusal, then a manual evaluation Validated: nothing", async () => {
    const copy = await evaluatedCopy({ refused: true });
    expectNoLeak(await studentReceives(copy));

    const seen = { ...(await seenOf(copy)), proposalId: null, revision: 0 };
    expect(await validateTeacherEvaluation(copy.teacher, { ...TEACHER_FORM, seen })).toMatchObject({ status: "decided", published: false });
    expect((await seenOf(copy)).status).toBe("validated");
    expectNoLeak(await studentReceives(copy));
  });

  it("images (E9, AC-14): a checked copy To review, its teacher's evaluation saved; an unchecked one whose transcription failed: nothing", async () => {
    const checked = await imageCopy({ checked: true });
    expect((await saveTeacherEvaluation(checked.teacher, { ...TEACHER_FORM, seen: await seenOf(checked) })).status).toBe("saved");
    const received = await studentReceives(checked);
    expectNoLeak(received);
    // The sweep reads the image entry points: the student's own pages and the reading they checked.
    expect(received.find((r) => r.source === "student: getOwnSubmission")!.body).toContain("Changed");

    const unchecked = await imageCopy({ checked: false });
    expect((await seenOf(unchecked)).status).toBe("transcription_failed");
    expectNoLeak(await studentReceives(unchecked));
  });
});
