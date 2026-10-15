import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import { formatDateTime } from "@/lib/dates";
import { STUDENT_NOTICE } from "@/lib/texts";
import { wallTimeToInstant } from "@/lib/time-zone";
import type { Actor } from "@/server/access/actor";
import { createAssignment, getStudentAssignment, listStudentAssignments } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { isLate } from "@/server/data/submissions/late";
import { db } from "@/server/db/client";
import { assignments, classMemberships, submissions, submissionVersions, users } from "@/server/db/schema";
import { submitStudentText } from "@/server/submissions/submissions";

// SUB-04: a submission is late when its first submission is strictly after
// the deadline (R2), compared in SQL by the database. CA1 here; CA2 (a
// replacement after the deadline) with SUB-05 in E4.5; CA3 (the teacher's
// list, and nothing late in the AI request) in E7 and E5.

/** The deadline as the teacher enters it, in the single time zone. */
const deadline = (wall: string) => {
  const instant = wallTimeToInstant(wall, DEADLINE_TIME_ZONE);
  if (!instant) throw new Error(`No such wall time: ${wall}`);
  return instant;
};

const shift = (instant: Date, ms: number) => new Date(instant.getTime() + ms);

/** The database's verdict for a submission at `at`, the very expression of submitText. */
async function late(at: Date, due: Date): Promise<boolean> {
  const [{ late }] = await db.execute<{ late: boolean }>(
    sql`select ${isLate(sql`${at.toISOString()}::timestamptz`, sql`${due.toISOString()}::timestamptz`)} as late`,
  ).then((result) => result.rows);
  return late;
}

describe("CA1: strictly after the deadline, at the second", () => {
  const due = deadline("2026-11-10T18:00");

  it.each([
    ["one second before", -1000, false],
    ["exactly at the deadline", 0, false],
    ["one millisecond after", 1, true],
    ["one second after", 1000, true],
  ])("%s", async (_, offset, expected) => {
    expect(await late(shift(due, offset), due)).toBe(expected);
  });
});

describe("a deadline across a change of Casablanca time (Ramadan, tz 2026c)", () => {
  it("entering Ramadan (GMT+1 → GMT+0, 02:00 to 03:00 twice): the first 02:30 is the deadline", async () => {
    const due = deadline("2026-02-15T02:30");
    expect(due.toISOString()).toBe("2026-02-15T01:30:00.000Z");
    // Shown with its offset, so the student knows which 02:30 it is.
    expect(formatDateTime(due)).toBe("Feb 15, 2026, 02:30 (Casablanca time, GMT+1)");
    expect(await late(shift(due, -1000), due)).toBe(false);
    expect(await late(due, due)).toBe(false);
    expect(await late(shift(due, 1000), due)).toBe(true);
    // The second time the clock shows 02:30 is an hour later: late.
    expect(await late(new Date("2026-02-15T02:30:00Z"), due)).toBe(true);
  });

  it("leaving Ramadan (GMT+0 → GMT+1, 02:00 to 03:00 skipped): 03:00 is one instant", async () => {
    const due = deadline("2026-03-22T03:00");
    expect(due.toISOString()).toBe("2026-03-22T02:00:00.000Z");
    expect(formatDateTime(due)).toBe("Mar 22, 2026, 03:00 (Casablanca time, GMT+1)");
    expect(await late(shift(due, -1000), due)).toBe(false);
    expect(await late(due, due)).toBe(false);
    expect(await late(shift(due, 1000), due)).toBe(true);
  });

  it("a deadline during Ramadan, in GMT+0", async () => {
    const due = deadline("2026-03-01T18:00");
    expect(formatDateTime(due)).toBe("Mar 1, 2026, 18:00 (Casablanca time, GMT+0)");
    expect(await late(due, due)).toBe(false);
    expect(await late(shift(due, 1000), due)).toBe(true);
  });
});

describe("a real first submission, by the database clock", () => {
  let count = 0;
  async function createUser(role: "student" | "teacher"): Promise<Actor & { kind: "user" }> {
    const n = ++count;
    const [user] = await db
      .insert(users)
      .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
      .returning({ id: users.id });
    return { kind: "user", userId: user.id, role };
  }

  async function submitWithDeadline(due: ReturnType<typeof sql>) {
    const teacher = await createUser("teacher");
    const student = await createUser("student");
    const made = await createClass(teacher, { name: "Grade 10" });
    if (!made.ok) throw new Error("Class not created");
    await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
    await acknowledgeNotice(student, STUDENT_NOTICE.version);
    const created = await createAssignment(teacher, {
      title: "My town", subject: "Describe your town.", level: "B1", language: "en",
      deadline: new Date(Date.now() + 864e5), instructions: null, classIds: [made.classId],
    });
    if (!created.ok) throw new Error("Assignment not created");
    // The deadline set by the database's own clock, as time will make it.
    await db.update(assignments).set({ deadline: due }).where(eq(assignments.id, created.assignmentId));
    const state = await submitStudentText(student, {
      assignmentId: created.assignmentId, contentVersion: "1", requestId: randomUUID(), text: "My town is small.",
    });
    return { student, assignmentId: created.assignmentId, state };
  }

  it("is marked late after the deadline, and the student sees it", async () => {
    const { student, assignmentId, state } = await submitWithDeadline(sql`now() - interval '1 second'`);
    expect(state).toMatchObject({ status: "done", late: true });
    const [row] = await db
      .select({ late: submissions.late, after: sql<boolean>`${submissions.submittedAt} > ${assignments.deadline}` })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId));
    expect(row).toEqual({ late: true, after: true });
    expect((await listStudentAssignments(student))[0]).toMatchObject({ status: "being_marked", late: true });
    expect(await getStudentAssignment(student, assignmentId)).toMatchObject({ late: true });
  });

  it("is not marked late before the deadline", async () => {
    const { student, state } = await submitWithDeadline(sql`now() + interval '1 minute'`);
    expect(state).toMatchObject({ status: "done", late: false });
    expect((await listStudentAssignments(student))[0]).toMatchObject({ late: false });
  });

  it("says nothing late before any submission, even past the deadline", async () => {
    const { student } = await submitWithDeadline(sql`now() - interval '1 day'`);
    await db.delete(submissionVersions);
    await db.delete(submissions);
    // Not submitted: "Deadline passed" is the student's mention there, never "Late".
    expect((await listStudentAssignments(student))[0]).toMatchObject({ status: "to_submit", late: false, deadlinePassed: true });
  });
});
