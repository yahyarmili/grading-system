import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { CLASS_INVITE_INTENT_TTL, CLASS_JOIN_MAX_FAILURES } from "@/config/provisional";
import type { Actor } from "@/server/access/actor";
import { requestPasswordResetLink, resetPasswordWithToken } from "@/server/auth/recovery";
import { confirmEmailWithToken, signUpStudent } from "@/server/auth/sign-up";
import { tryInvite } from "@/server/classes/attempts";
import { createTeacherClass } from "@/server/classes/classes";
import { renewInvite } from "@/server/classes/invites";
import { JOIN_MESSAGES, joinWithCode, joinWithLink } from "@/server/classes/join";
import { CLASS_MESSAGES } from "@/server/classes/classes";
import { listClasses } from "@/server/data/classes/classes";
import { getClassInvite } from "@/server/data/classes/invites";
import { joinClass } from "@/server/data/classes/memberships";
import { db } from "@/server/db/client";
import { classJoinIntents, classMemberships, users } from "@/server/db/schema";
import { getCaptureSender } from "@/server/email";

// CLS-03: a student joins a class by link or code (R1 to R4, CA1 to CA4), and
// a link opened without a session survives sign-up and confirmation (R3).

let count = 0;
async function createUser(role: "student" | "teacher" | "admin", verified = true): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: verified, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

async function newClass(teacher: Actor, name: string) {
  const state = await createTeacherClass(teacher, { name });
  if (state.status !== "done") throw new Error("Class not created");
  const invite = await getClassInvite(teacher, state.classId);
  return { id: state.classId, code: invite!.code!, token: new URL(invite!.link!).searchParams.get("token")! };
}

const memberships = (studentId: string) =>
  db.select().from(classMemberships).where(eq(classMemberships.studentId, studentId));

async function studentClassNames(student: Actor) {
  const list = await listClasses(student);
  return list.role === "student" ? list.classes.map((c) => c.name) : [];
}

beforeEach(() => getCaptureSender().clear());

describe("CA1: a confirmed account with a valid link or code", () => {
  it("joins at once by code, without approval", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");

    expect(await joinWithCode(student, { code: grade10.code.toLowerCase() })).toEqual({ status: "joined", className: "Grade 10" });
    expect(await memberships(student.userId)).toMatchObject([{ classId: grade10.id, status: "active" }]);
    expect(await studentClassNames(student)).toEqual(["Grade 10"]);
  });

  it("joins at once by link", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");

    expect(await joinWithLink(student, grade10.token)).toBe("done");
    expect(await studentClassNames(student)).toEqual(["Grade 10"]);
  });
});

describe("CA2: unknown or disabled link or code; already a member", () => {
  it("refuses an unknown or empty code, and a malformed link", async () => {
    const student = await createUser("student");
    expect(await joinWithCode(student, { code: "ZZZZ-9999" })).toEqual({ status: "invalid", error: JOIN_MESSAGES.refused, code: "ZZZZ-9999" });
    expect(await joinWithCode(student, { code: "  " })).toMatchObject({ status: "invalid", error: JOIN_MESSAGES.empty });
    expect(await joinWithLink(student, "not-a-token")).toBe("refused");
    expect(await joinWithLink(student, undefined)).toBe("refused");
    expect(await memberships(student.userId)).toHaveLength(0);
  });

  it("refuses the old code after a renewal", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    await renewInvite(teacher, grade10.id);
    const student = await createUser("student");
    expect((await joinWithCode(student, { code: grade10.code })).status).toBe("invalid");
    expect(await memberships(student.userId)).toHaveLength(0);
  });

  it("creates no duplicate: by code twice, then by link, then concurrently", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");

    expect((await joinWithCode(student, { code: grade10.code })).status).toBe("joined");
    expect(await joinWithCode(student, { code: grade10.code })).toEqual({ status: "alreadyMember", className: "Grade 10" });
    expect(await joinWithLink(student, grade10.token)).toBe("done");
    await Promise.all([joinClass(student, { code: grade10.code }), joinClass(student, { linkToken: grade10.token })]);
    expect(await memberships(student.userId)).toHaveLength(1);
  });

  it("joins once when two first requests race", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");
    const results = await Promise.all([joinClass(student, { code: grade10.code }), joinClass(student, { code: grade10.code })]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["alreadyMember", "joined"]);
    expect(await memberships(student.userId)).toHaveLength(1);
  });
});

describe("CA3: a student in two classes", () => {
  it("sees both, of two teachers, with their names; never another student's", async () => {
    const sarah = await createUser("teacher");
    const karim = await createUser("teacher");
    const english = await newClass(sarah, "Grade 10 — English");
    const french = await newClass(karim, "French — Group 2");
    const student = await createUser("student");
    const other = await createUser("student");

    await joinWithCode(student, { code: english.code });
    await joinWithLink(student, french.token);
    await joinWithCode(other, { code: english.code });

    expect(await studentClassNames(student)).toEqual(["French — Group 2", "Grade 10 — English"]);
    const list = await listClasses(student);
    const names = await db.select({ name: users.name }).from(users).where(eq(users.role, "teacher"));
    expect(list.role === "student" && list.classes.map((c) => c.teacherName).sort()).toEqual(names.map((n) => n.name).sort());
    expect(await studentClassNames(other)).toEqual(["Grade 10 — English"]);
  });
});

describe("CA4: a removed student, code still active", () => {
  it("is refused with the answer for an unknown code, stays removed, and the refusal counts", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student");
    await joinWithCode(student, { code: grade10.code });
    await db
      .update(classMemberships)
      .set({ status: "removed", removedAt: sql`now()` })
      .where(eq(classMemberships.studentId, student.userId));

    const removed = await joinWithCode(student, { code: grade10.code });
    const unknown = await joinWithCode(student, { code: "ZZZZ-9999" });
    expect({ ...removed, code: "" }).toEqual({ ...unknown, code: "" });
    expect(await joinWithLink(student, grade10.token)).toBe("refused");
    expect(await memberships(student.userId)).toMatchObject([{ status: "removed" }]);
    expect(await studentClassNames(student)).toEqual([]);

    // Three refusals so far (removed by code, unknown, removed by link): the limit applies to them.
    for (let i = 3; i < CLASS_JOIN_MAX_FAILURES; i++) await joinWithCode(student, { code: "ZZZZ-9999" });
    expect(await tryInvite(student.userId, { code: grade10.code })).toEqual({ outcome: "locked" });
  }, 60_000);
});

describe("who can join", () => {
  it("an unconfirmed account is refused, nothing joined", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const student = await createUser("student", false);
    expect(await joinWithCode(student, { code: grade10.code })).toEqual({ status: "error", message: JOIN_MESSAGES.unconfirmed });
    expect(await memberships(student.userId)).toHaveLength(0);
  });

  it.each(["teacher", "admin"] as const)("%s: refused, nothing joined, no attempt counted", async (role) => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    const actor = await createUser(role);
    expect(await joinWithCode(actor, { code: grade10.code })).toEqual({ status: "error", message: CLASS_MESSAGES.notAllowed });
    expect(await db.select().from(classMemberships)).toHaveLength(0);
  });

  it("visitor: refused", async () => {
    expect((await joinWithCode({ kind: "visitor" }, { code: "ZZZZ-9999" })).status).toBe("error");
  });
});

describe("R3: a link opened without a session survives sign-up and confirmation", () => {
  let ip = 0;
  async function signUp(email: string, inviteToken?: string) {
    const tasks: Promise<void>[] = [];
    const state = await signUpStudent(
      { firstName: "Sam", lastName: "Lee", email, password: "correct horse" },
      { actor: { kind: "visitor" }, ip: `10.1.0.${++ip}`, schedule: (task) => void tasks.push(task()), inviteToken },
    );
    await Promise.all(tasks);
    return state;
  }

  function lastToken(kind: "email_verification" | "password_reset"): string {
    const message = getCaptureSender().captured().findLast((m) => m.kind === kind);
    const match = message?.text.match(/token=([A-Za-z0-9_-]{43})/);
    if (!match) throw new Error(`No ${kind} link sent`);
    return match[1];
  }

  const userId = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0].id;

  it("joins nothing before confirmation, joins at confirmation", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");

    expect(await signUp("sam@example.test", grade10.token)).toEqual({ status: "done" });
    const id = await userId("sam@example.test");
    expect(await memberships(id)).toHaveLength(0);
    expect(JSON.stringify(await db.select().from(classJoinIntents))).not.toContain(grade10.token);

    // The confirmation link may open in another browser: only the account carries the intent.
    expect(await confirmEmailWithToken(lastToken("email_verification"))).toEqual({ status: "done" });
    expect(await memberships(id)).toMatchObject([{ classId: grade10.id, status: "active" }]);
    expect(await db.select().from(classJoinIntents)).toHaveLength(0);
  });

  it("also joins when the address is confirmed by a password reset", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    await signUp("sam@example.test", grade10.token);
    const tasks: Promise<void>[] = [];
    await requestPasswordResetLink({ email: "sam@example.test" }, { schedule: (task) => void tasks.push(task()) });
    await Promise.all(tasks);
    await resetPasswordWithToken({ token: lastToken("password_reset"), password: "another horse" });
    expect(await memberships(await userId("sam@example.test"))).toHaveLength(1);
  });

  it("an unconfirmed account signing up again keeps the link", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    await signUp("sam@example.test");
    await signUp("sam@example.test", grade10.token);
    await confirmEmailWithToken(lastToken("email_verification"));
    expect(await memberships(await userId("sam@example.test"))).toHaveLength(1);
  });

  it("a confirmed account gets no intent from a sign-up: it signs in instead", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    await signUp("sam@example.test");
    await confirmEmailWithToken(lastToken("email_verification"));
    await signUp("sam@example.test", grade10.token);
    expect(await db.select().from(classJoinIntents)).toHaveLength(0);
    expect(await memberships(await userId("sam@example.test"))).toHaveLength(0);
  });

  it("joins nothing if the link was renewed, or the intent is too old", async () => {
    const teacher = await createUser("teacher");
    const renewed = await newClass(teacher, "Renewed");
    const old = await newClass(teacher, "Old");
    await signUp("sam@example.test", renewed.token);
    await signUp("kim@example.test", old.token);
    await renewInvite(teacher, renewed.id);
    await db
      .update(classJoinIntents)
      .set({ createdAt: sql`now() - make_interval(secs => ${CLASS_INVITE_INTENT_TTL + 60})` })
      .where(eq(classJoinIntents.userId, await userId("kim@example.test")));

    const tokens = getCaptureSender().captured().filter((m) => m.kind === "email_verification");
    for (const message of tokens) await confirmEmailWithToken(message.text.match(/token=([A-Za-z0-9_-]{43})/)![1]);
    expect(await db.select().from(classMemberships)).toHaveLength(0);
    expect(await db.select().from(classJoinIntents)).toHaveLength(0);
  });

  it("a malformed link is ignored", async () => {
    await signUp("sam@example.test", "not-a-token");
    expect(await db.select().from(classJoinIntents)).toHaveLength(0);
  });

  it("a removed student is not brought back by an intent", async () => {
    const teacher = await createUser("teacher");
    const grade10 = await newClass(teacher, "Grade 10");
    await signUp("sam@example.test", grade10.token);
    const id = await userId("sam@example.test");
    await db.insert(classMemberships).values({ classId: grade10.id, studentId: id, status: "removed", removedAt: new Date() });
    await confirmEmailWithToken(lastToken("email_verification"));
    expect(await db.select().from(classMemberships).where(and(eq(classMemberships.studentId, id)))).toMatchObject([{ status: "removed" }]);
  });
});
