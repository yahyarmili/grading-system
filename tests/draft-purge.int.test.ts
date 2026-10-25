import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DRAFT_TTL_MS } from "@/config/decisions";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { getReaderSimulator } from "@/server/ai";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { deleteStaleDrafts } from "@/server/data/submissions/drafts";
import { db } from "@/server/db/client";
import { classMemberships, readingRuns, submissionDrafts, submissionPages, users } from "@/server/db/schema";
import { readStudentPage, uploadDraftPage } from "@/server/submissions/images";
import { readTeacherNotice } from "./helpers/review";

// AC-18 (E9, spec 0011, build step 9): the sweep deletes a draft with no
// write for DRAFT_TTL_MS, its pages with it; its reading runs stay, so the
// read caps of the day do not start again. A draft locked by a write in
// progress is skipped, never waited for. Other tests' drafts may be swept
// too: each case checks its own draft only.

let count = 0;
async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `purge-${role}${n}-${randomUUID().slice(0, 6)}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  if (role === "teacher") await readTeacherNotice(user.id);
  return { kind: "user", userId: user.id, role };
}

/** A blank photographed page, as the browser sends it. */
const PAGE = () => sharp({ create: { width: 600, height: 800, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();

/** A student's draft of `pages` pages for an assignment they received, the first page read by the simulator. */
async function draftOf(pages: number) {
  const teacher = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  await acknowledgeNotice(student, STUDENT_NOTICE.version);

  const pageIds: string[] = [];
  let draftId = "";
  for (let position = 1; position <= pages; position++) {
    const uploaded = await uploadDraftPage(student, created.assignmentId, { uploadRequestId: randomUUID(), position: String(position) }, await PAGE());
    if (uploaded.status !== 200 || !("pageId" in uploaded.body)) throw new Error("Page not uploaded");
    draftId = uploaded.body.draftId;
    pageIds.push(uploaded.body.pageId);
  }
  const reader = getReaderSimulator();
  reader.clear();
  expect((await readStudentPage(student, pageIds[0], { reader })).status).toBe("read");
  return { student, draftId, pageIds };
}

/** Dates the draft's last write `ageMs` ago, on the database clock. */
const age = (draftId: string, ageMs: number) =>
  db.update(submissionDrafts).set({ updatedAt: sql`now() - make_interval(secs => ${ageMs / 1000})` }).where(eq(submissionDrafts.id, draftId));

const draftExists = async (draftId: string) => (await db.select({ id: submissionDrafts.id }).from(submissionDrafts).where(eq(submissionDrafts.id, draftId))).length > 0;

describe("the draft purge of the sweep (AC-18)", { timeout: 120_000 }, () => {
  it("deletes a draft left for DRAFT_TTL_MS with its pages; its reading run stays, without the page", async () => {
    const { student, draftId, pageIds } = await draftOf(2);
    await age(draftId, DRAFT_TTL_MS + 1_000);

    expect(await deleteStaleDrafts(DRAFT_TTL_MS)).toContain(draftId);
    expect(await draftExists(draftId)).toBe(false);
    expect(await db.select({ id: submissionPages.id }).from(submissionPages).where(eq(submissionPages.draftId, draftId))).toEqual([]);
    for (const id of pageIds) expect(await db.select({ id: submissionPages.id }).from(submissionPages).where(eq(submissionPages.id, id))).toEqual([]);

    // AC-8: the run the read caps count stays, with its draft and its student.
    const runs = await db.select({ pageId: readingRuns.pageId, studentId: readingRuns.studentId }).from(readingRuns).where(eq(readingRuns.draftId, draftId));
    expect(runs).toEqual([{ pageId: null, studentId: student.userId }]);
  });

  it("keeps a draft younger than DRAFT_TTL_MS, and one whose last write is a read result", async () => {
    const young = await draftOf(1);
    await age(young.draftId, DRAFT_TTL_MS - 864e5);

    // Left long ago, then a page read: the read's result dates the draft again.
    const read = await draftOf(2);
    await age(read.draftId, DRAFT_TTL_MS + 1_000);
    const reader = getReaderSimulator();
    reader.clear();
    expect((await readStudentPage(read.student, read.pageIds[1], { reader })).status).toBe("read");

    const deleted = await deleteStaleDrafts(DRAFT_TTL_MS);
    expect(deleted).not.toContain(young.draftId);
    expect(deleted).not.toContain(read.draftId);
    expect(await draftExists(young.draftId)).toBe(true);
    expect(await draftExists(read.draftId)).toBe(true);
  });

  it("skips a stale draft locked by a write in progress, without waiting; the next sweep takes it", async () => {
    const { draftId } = await draftOf(1);
    await age(draftId, DRAFT_TTL_MS + 1_000);

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    // A confirmation's transaction: the draft locked FOR UPDATE until it ends.
    const writer = db.transaction(async (tx) => {
      await tx.select({ id: submissionDrafts.id }).from(submissionDrafts).where(eq(submissionDrafts.id, draftId)).for("update");
      locked();
      await held;
    });
    await lockTaken;

    const started = performance.now();
    const deleted = await deleteStaleDrafts(DRAFT_TTL_MS);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(deleted).not.toContain(draftId);
    release();
    await writer;

    expect(await deleteStaleDrafts(DRAFT_TTL_MS)).toContain(draftId);
  });
});
