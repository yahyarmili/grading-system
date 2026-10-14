import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CLASS_INVITE_TTL } from "@/config/decisions";
import { CLASS_JOIN_MAX_FAILURES } from "@/config/provisional";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { tryInvite } from "@/server/classes/attempts";
import { createTeacherClass, CLASS_MESSAGES } from "@/server/classes/classes";
import { disableInvite, renewInvite } from "@/server/classes/invites";
import { disableClassInvite, getClassInvite, renewClassInvite } from "@/server/data/classes/invites";
import { db } from "@/server/db/client";
import { classes, classMemberships, securityEvents, users } from "@/server/db/schema";

// CLS-02: link and code of a class (R1 to R3, CA1 to CA4). Joining itself is
// CLS-03 (E2.3); here a code or link is checked through the attempt limit,
// which joining calls first.

let count = 0;
async function createUser(role: "student" | "teacher" | "admin"): Promise<Actor & { kind: "user" }> {
  const n = ++count;
  const [user] = await db
    .insert(users)
    .values({ email: `${role}${n}@example.test`, emailVerified: true, name: `${role} ${n}`, firstName: role, lastName: `${n}`, role })
    .returning({ id: users.id });
  return { kind: "user", userId: user.id, role };
}

async function newClass(teacher: Actor, name = "Grade 10") {
  const state = await createTeacherClass(teacher, { name });
  if (state.status !== "done") throw new Error("Class not created");
  return state.classId;
}

async function inviteOf(teacher: Actor, classId: string) {
  const invite = await getClassInvite(teacher, classId);
  if (!invite?.link || !invite.code) throw new Error("No active invite");
  return { link: invite.link, code: invite.code, token: new URL(invite.link).searchParams.get("token")! };
}

describe("CA1: link and code shown, serving this class only", () => {
  it("shows a link to /join and a code; both open this class and no other", async () => {
    const teacher = await createUser("teacher");
    const a = await newClass(teacher, "Grade 10 — A");
    const b = await newClass(teacher, "Grade 10 — B");
    const inviteA = await inviteOf(teacher, a);
    const inviteB = await inviteOf(teacher, b);
    const student = await createUser("student");

    expect(new URL(inviteA.link).pathname).toBe("/join");
    expect(inviteA.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(inviteA.code).not.toBe(inviteB.code);
    expect(await tryInvite(student.userId, { code: inviteA.code })).toEqual({ outcome: "found", classId: a });
    expect(await tryInvite(student.userId, { code: inviteA.code.toLowerCase().replace("-", " ") })).toEqual({ outcome: "found", classId: a });
    expect(await tryInvite(student.userId, { linkToken: inviteA.token })).toEqual({ outcome: "found", classId: a });
    expect(await tryInvite(student.userId, { linkToken: inviteB.token })).toEqual({ outcome: "found", classId: b });
  });

  it("stores neither the link nor the code", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    const { code, token } = await inviteOf(teacher, id);
    const [row] = await db.select().from(classes).where(eq(classes.id, id));
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(code.replace("-", ""));
  });

  it("gives the same link and code on every visit", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    expect(await getClassInvite(teacher, id)).toEqual(await getClassInvite(teacher, id));
  });
});

describe("CA2: renewed code", () => {
  it("refuses the old link and code, opens the new ones, keeps the members", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    const old = await inviteOf(teacher, id);
    const member = await createUser("student");
    await db.insert(classMemberships).values({ classId: id, studentId: member.userId });

    expect(await renewInvite(teacher, id)).toMatchObject({ ok: true });
    const fresh = await inviteOf(teacher, id);
    expect(fresh.code).not.toBe(old.code);
    expect(fresh.token).not.toBe(old.token);

    const student = await createUser("student");
    expect(await tryInvite(student.userId, { code: old.code })).toEqual({ outcome: "refused" });
    expect(await tryInvite(student.userId, { linkToken: old.token })).toEqual({ outcome: "refused" });
    expect(await tryInvite(student.userId, { code: fresh.code })).toEqual({ outcome: "found", classId: id });

    const members = await db.select().from(classMemberships).where(eq(classMemberships.classId, id));
    expect(members).toMatchObject([{ studentId: member.userId, status: "active" }]);
    const [event] = await db.select().from(securityEvents).where(eq(securityEvents.type, "class_invite_renewed"));
    expect(event).toMatchObject({ actorUserId: teacher.userId, subjectId: id });
  });

  it("brings back a disabled class", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    await disableInvite(teacher, id);
    await renewInvite(teacher, id);
    const { code } = await inviteOf(teacher, id);
    expect((await tryInvite((await createUser("student")).userId, { code })).outcome).toBe("found");
  });
});

describe("CA3: disabled, expired or unknown code", () => {
  it("refuses a disabled link and code, with the answer given for an unknown one; members stay", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    const { code, token } = await inviteOf(teacher, id);
    const member = await createUser("student");
    await db.insert(classMemberships).values({ classId: id, studentId: member.userId });

    expect(await disableInvite(teacher, id)).toMatchObject({ ok: true });
    expect(await getClassInvite(teacher, id)).toMatchObject({ state: "disabled", link: null, code: null });

    // A fresh student per entry: the attempt limit (CA4) stays out of the way.
    const attempt = async (input: Parameters<typeof tryInvite>[1]) => tryInvite((await createUser("student")).userId, input);
    const disabled = [await attempt({ code }), await attempt({ linkToken: token })];
    const unknown = [
      await attempt({ code: "ZZZZ-9999" }),
      await attempt({ linkToken: "x".repeat(43) }),
      await attempt({ code: "not a code" }),
      await attempt({ linkToken: "short" }),
    ];
    expect(new Set([...disabled, ...unknown].map((r) => JSON.stringify(r)))).toEqual(new Set(['{"outcome":"refused"}']));
    expect(await db.select().from(classMemberships)).toHaveLength(1);
  });

  // R4, Q7 [D]: 1 hour from the link's creation. Aged by a minute more or
  // less than that, so a drift between the two clocks does not matter.
  it("refuses a link and code older than their lifetime, like an unknown one; members stay; renewing brings them back", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    const { code, token } = await inviteOf(teacher, id);
    const member = await createUser("student");
    await db.insert(classMemberships).values({ classId: id, studentId: member.userId });
    const age = (seconds: number) =>
      db.update(classes).set({ inviteIssuedAt: sql`now() - make_interval(secs => ${seconds})` }).where(eq(classes.id, id));
    const attempt = async (input: Parameters<typeof tryInvite>[1]) => tryInvite((await createUser("student")).userId, input);

    await age(CLASS_INVITE_TTL - 60);
    expect(await attempt({ code })).toEqual({ outcome: "found", classId: id });
    expect(await getClassInvite(teacher, id)).toMatchObject({ state: "active" });

    await age(CLASS_INVITE_TTL + 60);
    expect([await attempt({ code }), await attempt({ linkToken: token })]).toEqual([{ outcome: "refused" }, { outcome: "refused" }]);
    expect(await getClassInvite(teacher, id)).toMatchObject({ state: "expired", link: null, code: null });
    expect(await db.select().from(classMemberships)).toHaveLength(1);

    await renewInvite(teacher, id);
    const renewed = await inviteOf(teacher, id);
    expect(await attempt({ code: renewed.code })).toEqual({ outcome: "found", classId: id });
  });

  it("disabling twice keeps the first date", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    await disableClassInvite(teacher, id);
    const [first] = await db.select({ at: classes.inviteDisabledAt }).from(classes);
    await disableClassInvite(teacher, id);
    const [second] = await db.select({ at: classes.inviteDisabledAt }).from(classes);
    expect(second.at).toEqual(first.at);
  });
});

// About 3 round trips to Neon per entry, ten entries or more per test.
describe("CA4: limited entries", { timeout: 60_000 }, () => {
  it(`after ${CLASS_JOIN_MAX_FAILURES} failures, every entry is refused, even a valid code`, async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    const { code, token } = await inviteOf(teacher, id);
    const student = await createUser("student");

    for (let i = 0; i < CLASS_JOIN_MAX_FAILURES; i++) {
      expect(await tryInvite(student.userId, { code: `ZZZZ-${String(i).padStart(4, "0")}` })).toEqual({ outcome: "refused" });
    }
    expect(await tryInvite(student.userId, { code })).toEqual({ outcome: "locked" });
    expect(await tryInvite(student.userId, { linkToken: token })).toEqual({ outcome: "locked" });

    // Another student is not affected.
    expect((await tryInvite((await createUser("student")).userId, { code })).outcome).toBe("found");
  });

  it("a success does not reset the count", async () => {
    const teacher = await createUser("teacher");
    const id = await newClass(teacher);
    const { code } = await inviteOf(teacher, id);
    const student = await createUser("student");

    for (let i = 0; i < CLASS_JOIN_MAX_FAILURES - 1; i++) {
      await tryInvite(student.userId, { code: "ZZZZ-9999" });
      expect((await tryInvite(student.userId, { code })).outcome).toBe("found");
    }
    expect(await tryInvite(student.userId, { code: "ZZZZ-9999" })).toEqual({ outcome: "refused" });
    expect(await tryInvite(student.userId, { code })).toEqual({ outcome: "locked" });
  });
});

describe("only the owner teacher sees and changes the link and code", () => {
  it("another teacher: absent, like a missing class; nothing changes", async () => {
    const owner = await createUser("teacher");
    const other = await createUser("teacher");
    const id = await newClass(owner);
    const before = await getClassInvite(owner, id);

    expect(await getClassInvite(other, id)).toBeNull();
    expect(await renewClassInvite(other, id)).toBe(false);
    expect(await disableClassInvite(other, id)).toBe(false);
    expect(await renewInvite(other, id)).toEqual({ ok: false, message: "This class was not found." });
    expect(await renewInvite(owner, "not-a-uuid")).toEqual({ ok: false, message: "This class was not found." });
    expect(await getClassInvite(owner, id)).toEqual(before);
  });

  it.each(["student", "admin"] as const)("%s: refused, even as a member of the class", async (role) => {
    const owner = await createUser("teacher");
    const id = await newClass(owner);
    const actor = await createUser(role);
    if (role === "student") await db.insert(classMemberships).values({ classId: id, studentId: actor.userId });

    await expect(getClassInvite(actor, id)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await disableInvite(actor, id)).toEqual({ ok: false, message: CLASS_MESSAGES.notAllowed });
    expect((await getClassInvite(owner, id))?.state).toBe("active");
  });
});
