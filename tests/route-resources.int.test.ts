import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { EvaluationChanges } from "@/lib/review";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { createAssignment } from "@/server/data/assignments/assignments";
import { auth } from "@/server/data/auth/better-auth";
import { createClass } from "@/server/data/classes/classes";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { publishEvaluation, validateEvaluation, withdrawPublication } from "@/server/data/review/publication";
import { submitText } from "@/server/data/submissions/submissions";
import { db } from "@/server/db/client";
import { accounts, classMemberships, noticeAcknowledgements, submissions, users } from "@/server/db/schema";
import { evaluateSubmission } from "@/server/evaluation/evaluate";
import { proxy } from "@/proxy";
import { readTeacherNotice } from "./helpers/review";

// E8.6: the proxy answers not found before a resource page renders, for an
// absent, another person's or malformed resource: the only real 404 in
// production, where the page's own notFound() comes after the prerendered
// shell's 200 (src/server/routes/resources.ts). Replayed per page and per
// person, with real sessions; the online statuses: e2e/route-statuses.spec.ts.

const PASSWORD = "correct horse battery";

let count = 0;
async function createUser(role: "student" | "teacher") {
  const n = ++count;
  const email = `routes-${role}${n}-${randomUUID().slice(0, 6)}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  await db.insert(accounts).values({ userId: user.id, providerId: "credential", accountId: user.id, password: await hashPassword(PASSWORD) });
  const { headers } = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const actor: Actor & { kind: "user" } = { kind: "user", userId: user.id, role };
  return { ...actor, actor, cookie };
}

/** What the proxy does with this path for this person: let the page render, or answer not found. */
async function proxied(path: string, cookie: string, method = "GET"): Promise<"page" | "not found"> {
  const response = await proxy(new NextRequest(new URL(path, "http://localhost:3000"), { method, headers: { cookie } }));
  const rewrite = response.headers.get("x-middleware-rewrite");
  if (rewrite) {
    expect(new URL(rewrite).pathname).toBe("/not-found");
    return "not found";
  }
  expect(response.status).toBe(200);
  return "page";
}

const FORM: EvaluationChanges = {
  levels: { task: 2, organization: 2, vocabulary: 2, grammar: 2, mechanics: 2 },
  remarks: { task: "", organization: "", vocabulary: "", grammar: "", mechanics: "" },
  generalComment: "Validated by the route test.", nextSteps: [], grade: { fixed: false }, rereadDone: [],
};

let teacher: Awaited<ReturnType<typeof createUser>>;
let other: Awaited<ReturnType<typeof createUser>>;
let unread: Awaited<ReturnType<typeof createUser>>;
let student: Awaited<ReturnType<typeof createUser>>;
let classmate: Awaited<ReturnType<typeof createUser>>;
let outsider: Awaited<ReturnType<typeof createUser>>;
let classId: string, assignmentId: string, seen: { submissionId: string; versionNumber: number; proposalId: string | null; revision: number };

// Each test starts from an emptied database (tests/setup/integration.ts): the world is built again.
beforeEach(async () => {
  [teacher, other, unread, student, classmate, outsider] = [
    await createUser("teacher"), await createUser("teacher"), await createUser("teacher"),
    await createUser("student"), await createUser("student"), await createUser("student"),
  ];
  await readTeacherNotice(teacher.userId, other.userId);
  const made = await createClass(teacher.actor, { name: "C1" });
  if (!made.ok) throw new Error("Class not created");
  classId = made.classId;
  await db.insert(classMemberships).values([student, classmate].map((s) => ({ classId, studentId: s.userId })));
  const created = await createAssignment(teacher.actor, {
    title: "My town", subject: "Describe your town.", level: "B1", language: "en",
    deadline: new Date(Date.now() + 7 * 864e5), instructions: null, classIds: [classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  assignmentId = created.assignmentId;
  // The student's copy, evaluated by the simulator, validated and published.
  await acknowledgeNotice(student.actor, STUDENT_NOTICE.version);
  const submitted = await submitText(student.actor, { assignmentId, contentVersion: 1, requestId: randomUUID(), text: "My town is small and quiet." });
  if (!submitted?.ok) throw new Error("Not submitted");
  const submissionId = submitted.ref.submissionId;
  if ((await evaluateSubmission(submissionId)).status !== "to_review") throw new Error("Not evaluated");
  const [{ proposalId }] = await db.select({ proposalId: submissions.currentProposalId }).from(submissions).where(eq(submissions.id, submissionId));
  seen = { submissionId, versionNumber: 1, proposalId, revision: 1 };
  if (!(await validateEvaluation(teacher.actor, { ...seen, revision: 0 }, FORM))?.ok) throw new Error("Not validated");
  if (!(await publishEvaluation(teacher.actor, seen))?.ok) throw new Error("Not published");
}, 120_000);

const unknown = randomUUID();

describe("the student's resource pages", { timeout: 60_000 }, () => {
  it("the assignment: their own and a classmate's received one render; an outsider's, an unknown or malformed id: not found", async () => {
    const page = `/student/assignments/${assignmentId}`;
    expect(await proxied(page, student.cookie)).toBe("page");
    expect(await proxied(page, classmate.cookie)).toBe("page");
    expect(await proxied(page, outsider.cookie)).toBe("not found");
    expect(await proxied(`/student/assignments/${unknown}`, student.cookie)).toBe("not found");
    expect(await proxied("/student/assignments/42", student.cookie)).toBe("not found");
    expect(await proxied("/student/assignments", outsider.cookie)).toBe("page");
  });

  it("the result: published, the student's own only; a classmate, an outsider, an unknown id: not found", async () => {
    const page = `/student/assignments/${assignmentId}/result`;
    expect(await proxied(page, student.cookie)).toBe("page");
    expect(await proxied(page, classmate.cookie)).toBe("not found");
    expect(await proxied(page, outsider.cookie)).toBe("not found");
    expect(await proxied(`/student/assignments/${unknown}/result`, student.cookie)).toBe("not found");
  });
});

describe("the teacher's resource pages", { timeout: 60_000 }, () => {
  it("the owner's class, assignment, its edit page and a copy render; another teacher's, unknown or malformed ids: not found", async () => {
    const pages = [
      `/teacher/classes/${classId}`,
      `/teacher/assignments/${assignmentId}`,
      `/teacher/assignments/${assignmentId}/edit`,
      `/teacher/assignments/${assignmentId}/students/${student.userId}`,
    ];
    for (const page of pages) {
      expect(await proxied(page, teacher.cookie), page).toBe("page");
      expect(await proxied(page, other.cookie), page).toBe("not found");
    }
    expect(await proxied(`/teacher/classes/${unknown}`, teacher.cookie)).toBe("not found");
    expect(await proxied(`/teacher/assignments/${unknown}`, teacher.cookie)).toBe("not found");
    expect(await proxied(`/teacher/assignments/${unknown}/edit`, teacher.cookie)).toBe("not found");
    // A student not in the teacher's classes: no copy; a malformed id: not found.
    expect(await proxied(`/teacher/assignments/${assignmentId}/students/${outsider.userId}`, teacher.cookie)).toBe("not found");
    expect(await proxied(`/teacher/assignments/${assignmentId}/students/nobody`, teacher.cookie)).toBe("not found");
    // A fixed page is never taken for an id.
    expect(await proxied("/teacher/assignments/new", teacher.cookie)).toBe("page");
  });

  it("before the teacher notice is read, the owner's copy and list render (the pages show the notice); another teacher's stay not found", async () => {
    const pages = [`/teacher/assignments/${assignmentId}`, `/teacher/assignments/${assignmentId}/students/${student.userId}`];
    await db.delete(noticeAcknowledgements).where(eq(noticeAcknowledgements.userId, teacher.userId));
    try {
      for (const page of pages) {
        expect(await proxied(page, teacher.cookie), page).toBe("page");
        expect(await proxied(page, unread.cookie), page).toBe("not found");
      }
    } finally {
      await readTeacherNotice(teacher.userId);
    }
  });
});

describe("PUB-01 CA3: withdrawn, the result is not found at the next access", { timeout: 60_000 }, () => {
  it("the result renders while published, then not found once withdrawn; the assignment still renders", async () => {
    const page = `/student/assignments/${assignmentId}/result`;
    expect(await proxied(page, student.cookie)).toBe("page");
    expect((await withdrawPublication(teacher.actor, seen))?.ok).toBe(true);
    expect(await proxied(page, student.cookie)).toBe("not found");
    expect(await proxied(`/student/assignments/${assignmentId}`, student.cookie)).toBe("page");
    // The freshness check posts to the result's path: never rewritten, its action answers (its own access check).
    expect(await proxied(page, student.cookie, "POST")).toBe("page");
  });
});
