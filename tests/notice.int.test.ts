import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { STUDENT_NOTICE, TEACHER_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { getNoticeAcknowledgement } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import { assignments, classMemberships, noticeAcknowledgements, submissions, users } from "@/server/db/schema";
import { acknowledgeNoticeReading, NOTICE_MESSAGES } from "@/server/notices/notices";
import { SUBMISSION_MESSAGES, submitStudentText } from "@/server/submissions/submissions";
import { noTrigger } from "./helpers/triggers";

// NFR-DON-04: the student reads the notice before the first submission; the
// reading is recorded (account, date, version) and the server refuses a first
// submission without it.

let count = 0;
async function createUser(role: "student" | "teacher" | "admin"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

/** A student in a class, with an assignment sent to it; the notice not read yet. */
async function setup() {
  const teacher = await createUser("teacher");
  const student = await createUser("student");
  const made = await createClass(teacher, { name: "Grade 10" });
  if (!made.ok) throw new Error("Class not created");
  await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
  const created = await createAssignment(teacher, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000), instructions: null, classIds: [made.classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  return { teacher, student, assignmentId: created.assignmentId };
}

const submit = (actor: Actor, assignmentId: string) =>
  submitStudentText(actor, { assignmentId, contentVersion: "1", requestId: randomUUID(), text: "My town is small." }, noTrigger);

const readings = () => db.select().from(noticeAcknowledgements);

describe("the first submission waits for the notice", () => {
  it("is refused on the server until the notice is read, nothing stored", async () => {
    const { student, assignmentId } = await setup();
    expect(await submit(student, assignmentId)).toEqual({
      status: "error", reason: "noticeNotRead", message: SUBMISSION_MESSAGES.noticeNotRead,
    });
    expect(await db.select().from(submissions)).toEqual([]);
    const [{ lockedAt }] = await db.select({ lockedAt: assignments.lockedAt }).from(assignments);
    expect(lockedAt).toBeNull();

    expect(await acknowledgeNoticeReading(student, { version: String(STUDENT_NOTICE.version) })).toEqual({ status: "done" });
    expect((await submit(student, assignmentId)).status).toBe("done");
  });

  it("asks again for a new version: an older reading does not count", async () => {
    const { student, assignmentId } = await setup();
    await db.insert(noticeAcknowledgements).values({
      userId: student.userId, notice: "student_submission", version: STUDENT_NOTICE.version - 1,
    });
    expect(await getNoticeAcknowledgement(student)).toBeNull();
    expect(await submit(student, assignmentId)).toMatchObject({ reason: "noticeNotRead" });
  });

  it("is per account: another student's reading does not count", async () => {
    const { student, assignmentId } = await setup();
    await acknowledgeNoticeReading(await createUser("student"), { version: String(STUDENT_NOTICE.version) });
    expect(await submit(student, assignmentId)).toMatchObject({ reason: "noticeNotRead" });
  });
});

describe("the reading is recorded: account, date, version", () => {
  it("records the account, the version and the database date", async () => {
    const { student } = await setup();
    await acknowledgeNoticeReading(student, { version: String(STUDENT_NOTICE.version) });
    const [row] = await db
      .select({
        userId: noticeAcknowledgements.userId,
        notice: noticeAcknowledgements.notice,
        version: noticeAcknowledgements.version,
        recent: sql<boolean>`${noticeAcknowledgements.acknowledgedAt} between now() - interval '1 minute' and now()`,
      })
      .from(noticeAcknowledgements);
    expect(row).toEqual({ userId: student.userId, notice: "student_submission", version: STUDENT_NOTICE.version, recent: true });
    expect(await getNoticeAcknowledgement(student)).not.toBeNull();
  });

  it("keeps the first reading when read again, even twice at once", async () => {
    const { student } = await setup();
    const version = String(STUDENT_NOTICE.version);
    await Promise.all([acknowledgeNoticeReading(student, { version }), acknowledgeNoticeReading(student, { version })]);
    const [first] = await readings();
    await acknowledgeNoticeReading(student, { version });
    expect(await readings()).toEqual([first]);
  });

  it("records nothing for a version no longer in force", async () => {
    const { student } = await setup();
    expect(await acknowledgeNoticeReading(student, { version: String(STUDENT_NOTICE.version + 1) })).toEqual({
      status: "error", reason: "outdated", message: NOTICE_MESSAGES.outdated,
    });
    expect(await acknowledgeNoticeReading(student, { version: "not a number" })).toMatchObject({ reason: "outdated" });
    expect(await readings()).toEqual([]);
  });

  it("E7.7: a teacher records their own notice, never the student's", async () => {
    const { teacher } = await setup();
    // TEACHER_NOTICE.version 1 is not STUDENT_NOTICE.version 5: the student's version is outdated for them.
    expect(await acknowledgeNoticeReading(teacher, { version: String(STUDENT_NOTICE.version) })).toMatchObject({ reason: "outdated" });
    expect(await readings()).toEqual([]);
    expect(await acknowledgeNoticeReading(teacher, { version: String(TEACHER_NOTICE.version) })).toEqual({ status: "done" });
    expect(await readings()).toMatchObject([{ userId: teacher.userId, notice: "teacher_review", version: TEACHER_NOTICE.version }]);
    expect(await getNoticeAcknowledgement(teacher)).toEqual({ acknowledgedAt: expect.any(String) });
  });

  it("refuses an administrator", async () => {
    const admin = await createUser("admin");
    expect(await acknowledgeNoticeReading(admin, { version: String(TEACHER_NOTICE.version) })).toMatchObject({ reason: "notAllowed" });
    expect(await readings()).toEqual([]);
  });
});

describe("the notice text (Q10, QNF-1)", () => {
  const all = JSON.stringify(STUDENT_NOTICE);

  it("never promises that the name is not sent, and says a written name goes with the text", () => {
    expect(all).not.toMatch(/name (is|will) (never|not) (be )?sent/i);
    expect(all).toContain("if you write your name in it, your name is sent too");
  });

  it("says who receives the text, where, for how long and for what, as Anthropic's word, never more (version 5)", () => {
    expect(STUDENT_NOTICE.version).toBe(5);
    expect(all).toContain("sent to Anthropic, a company based in the United States");
    expect(all).toContain("processed and stored in the United States");
    expect(all).toContain("does not use them to train its models");
    expect(all).toContain("deletes them within 30 days");
    expect(all).toContain("kept for up to 2 years");
    expect(all).toContain("The app cannot check this itself.");
    expect(all).not.toMatch(/OpenRouter|Phala|Mistral|zero.data|ZDR|keep nothing|is set so that|may (use|train)|improve its models|never (kept|stored)|guarantee/i);
  });

  it("says the photos go to Anthropic too, without their hidden details, and what is kept of them (version 5, E9, AC-17)", () => {
    expect(all).toContain("each photo is sent to Anthropic too, so that the AI reads what you wrote");
    expect(all).toContain("removes the hidden details a photo carries");
    expect(all).toContain("Everything visible in the photo is sent.");
    expect(all).toContain("A text or photo that its safety systems flag may be kept for up to 2 years.");
    expect(all).toContain("each word you changed in that reading");
  });

  it("says it is a demonstration with fictitious data, and leaves the undecided to be defined", () => {
    expect(STUDENT_NOTICE.demonstration).toContain("demonstration with fictitious data");
    const controller = STUDENT_NOTICE.sections.find((s) => s.heading === "Who is responsible for your data");
    expect(controller?.body).toEqual(["To be defined."]);
  });
});
