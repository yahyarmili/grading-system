import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { PASSWORD_RESET_TTL } from "@/config/provisional";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import {
  acceptInvitation,
  cancelInvitation,
  inviteTeacher,
  NOT_ALLOWED,
  reissueInvitation,
} from "@/server/auth/invitations";
import { resetPasswordWithToken } from "@/server/auth/recovery";
import { auth } from "@/server/data/auth/better-auth";
import {
  createFirstAdmin,
  createTeacherInvitation,
  listTeacherInvitations,
  peekTeacherInvitation,
} from "@/server/data/auth/invitations";
import { db } from "@/server/db/client";
import { accounts, authTokens, securityEvents, teacherInvitations, users } from "@/server/db/schema";
import { getCaptureSender } from "@/server/email";

// AUTH-03: teacher accounts by invitation (R1 to R4, CA1 to CA4), and the
// first administrator created by the local script.

const PASSWORD = "correct horse battery";
const teacherForm = { firstName: "Tara", lastName: "Quinn", email: "tara@example.test" };

async function createUser(email: string, role: "student" | "teacher" | "admin") {
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified: true, name: `${role} user`, firstName: role, lastName: "User", role })
    .returning({ id: users.id });
  await db.insert(accounts).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(PASSWORD),
  });
  return user.id;
}

async function adminActor(): Promise<Actor> {
  return { kind: "user", userId: await createUser("admin@example.test", "admin"), role: "admin" };
}

const outbox = () => getCaptureSender().captured();

function lastInvitationToken(): string {
  const message = outbox().findLast((m) => m.kind === "teacher_invitation");
  const match = message?.text.match(/\/invitation\?token=([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error("No invitation link sent");
  return match[1];
}

const accept = (token: string, password = PASSWORD) =>
  acceptInvitation({ token, password }, { headers: new Headers() });

async function signInRole(email: string, password = PASSWORD) {
  const result = await auth.api.signInEmail({ body: { email, password } });
  return (result.user as { role: string }).role;
}

async function invitationId(email: string) {
  const [row] = await db.select({ id: teacherInvitations.id }).from(teacherInvitations).where(eq(teacherInvitations.email, email));
  return row.id;
}

beforeEach(() => getCaptureSender().clear());

describe("CA1: an invited teacher sets a password and signs in to the teacher space", () => {
  it("creates a confirmed teacher account from the invitation", async () => {
    const admin = await adminActor();
    expect(await inviteTeacher(admin, { ...teacherForm, email: " Tara@Example.test " })).toEqual({
      status: "done",
      email: "tara@example.test",
      emailSent: true,
    });
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ kind: "teacher_invitation", to: "tara@example.test" });

    const token = lastInvitationToken();
    expect(await peekTeacherInvitation(token)).toEqual({ email: "tara@example.test", firstName: "Tara" });
    expect(await accept(token)).toEqual({ status: "done" });

    const [teacher] = await db.select().from(users).where(eq(users.email, "tara@example.test"));
    expect(teacher).toMatchObject({ role: "teacher", emailVerified: true, firstName: "Tara", lastName: "Quinn" });
    expect(await signInRole("tara@example.test")).toBe("teacher");

    const [row] = await listTeacherInvitations(admin);
    expect(row.state).toBe("accepted");
    expect(row.acceptedAt).not.toBeNull();
  });

  it("refuses a too short password without using the link", async () => {
    await inviteTeacher(await adminActor(), teacherForm);
    const token = lastInvitationToken();
    expect((await accept(token, "short")).status).toBe("invalid");
    expect(await accept(token)).toEqual({ status: "done" });
  });
});

describe("CA2: only the administrator manages invitations", () => {
  const others: [string, () => Promise<Actor>][] = [
    ["a visitor", async () => ({ kind: "visitor" })],
    ["a student", async () => ({ kind: "user", userId: await createUser("s@example.test", "student"), role: "student" })],
    ["a teacher", async () => ({ kind: "user", userId: await createUser("t@example.test", "teacher"), role: "teacher" })],
  ];

  it.each(others)("refuses %s, whatever the request", async (_label, makeActor) => {
    const actor = await makeActor();
    const admin = await adminActor();
    await inviteTeacher(admin, { ...teacherForm, email: "open@example.test" });
    const openId = await invitationId("open@example.test");
    getCaptureSender().clear();

    expect(await inviteTeacher(actor, teacherForm)).toEqual({ status: "error", message: NOT_ALLOWED });
    expect(await reissueInvitation(actor, openId)).toEqual({ ok: false, message: NOT_ALLOWED });
    expect(await cancelInvitation(actor, openId)).toEqual({ ok: false, message: NOT_ALLOWED });
    await expect(listTeacherInvitations(actor)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(createTeacherInvitation(actor, teacherForm)).rejects.toBeInstanceOf(AccessDeniedError);

    expect(await db.select().from(teacherInvitations)).toHaveLength(1);
    expect(outbox()).toHaveLength(0);
    const [open] = await listTeacherInvitations(admin);
    expect(open.state).toBe("pending");
    const denied = (await db.select().from(securityEvents)).filter((e) => e.type === "access_denied");
    expect(denied).toHaveLength(3);
  });
});

describe("CA3: expired, used or cancelled links are refused; reissue replaces the link", () => {
  it("refuses an expired link, and shows the invitation as expired", async () => {
    const admin = await adminActor();
    await inviteTeacher(admin, teacherForm);
    await db.update(authTokens).set({ expiresAt: sql`now() - interval '1 second'` });

    const token = lastInvitationToken();
    expect(await peekTeacherInvitation(token)).toBeNull();
    expect(await accept(token)).toEqual({ status: "invalid-link" });
    expect((await listTeacherInvitations(admin))[0].state).toBe("expired");
    expect(await db.select().from(users).where(eq(users.role, "teacher"))).toHaveLength(0);
  });

  it("refuses a link already used", async () => {
    await inviteTeacher(await adminActor(), teacherForm);
    const token = lastInvitationToken();
    expect(await accept(token)).toEqual({ status: "done" });
    expect(await accept(token, "another password")).toEqual({ status: "invalid-link" });
  });

  it("refuses the link of a cancelled invitation", async () => {
    const admin = await adminActor();
    await inviteTeacher(admin, teacherForm);
    const token = lastInvitationToken();

    expect((await cancelInvitation(admin, await invitationId("tara@example.test"))).ok).toBe(true);

    expect(await accept(token)).toEqual({ status: "invalid-link" });
    const [row] = await listTeacherInvitations(admin);
    expect(row).toMatchObject({ state: "cancelled", cancelledBy: "admin user" });
  });

  it("reissue: the old link stops working, the new one works, even after expiry", async () => {
    const admin = await adminActor();
    await inviteTeacher(admin, teacherForm);
    const oldToken = lastInvitationToken();
    await db.update(authTokens).set({ expiresAt: sql`now() - interval '1 second'` });

    const result = await reissueInvitation(admin, await invitationId("tara@example.test"));
    expect(result.ok).toBe(true);
    const newToken = lastInvitationToken();

    expect(newToken).not.toBe(oldToken);
    expect(await accept(oldToken)).toEqual({ status: "invalid-link" });
    expect((await listTeacherInvitations(admin))[0].state).toBe("pending");
    expect(await accept(newToken)).toEqual({ status: "done" });
  });

  it("cannot reissue or cancel an invitation already accepted or cancelled", async () => {
    const admin = await adminActor();
    await inviteTeacher(admin, teacherForm);
    const id = await invitationId("tara@example.test");
    await accept(lastInvitationToken());

    expect((await reissueInvitation(admin, id)).ok).toBe(false);
    expect((await cancelInvitation(admin, id)).ok).toBe(false);
    expect((await reissueInvitation(admin, "not-a-uuid")).ok).toBe(false);
  });

  it("refuses a forged link", async () => {
    await inviteTeacher(await adminActor(), teacherForm);
    for (const forged of ["A".repeat(43), "short", ""]) {
      expect(await accept(forged)).toEqual({ status: "invalid-link" });
    }
  });
});

describe("CA4: emails already used are refused explicitly; every action is logged", () => {
  it.each(["student", "teacher", "admin"] as const)("refuses an email that has a %s account", async (role) => {
    const admin = await adminActor();
    // The administrator's own email stands for the admin case (one administrator).
    const taken = role === "admin" ? "admin@example.test" : "taken@example.test";
    if (role !== "admin") await createUser(taken, role);
    const state = await inviteTeacher(admin, { ...teacherForm, email: taken.toUpperCase() });
    expect(state).toMatchObject({ status: "refused", fieldErrors: { email: expect.stringContaining("already has an account") } });
    expect(await db.select().from(teacherInvitations)).toHaveLength(0);
  });

  it("refuses a second open invitation for the same email", async () => {
    const admin = await adminActor();
    await inviteTeacher(admin, teacherForm);
    const state = await inviteTeacher(admin, teacherForm);
    expect(state).toMatchObject({ status: "refused", fieldErrors: { email: expect.stringContaining("already open") } });
  });

  it("creates nothing when the email got an account after the invitation", async () => {
    await inviteTeacher(await adminActor(), teacherForm);
    const token = lastInvitationToken();
    await createUser("tara@example.test", "student");

    expect(await accept(token)).toEqual({ status: "invalid-link" });
    const [user] = await db.select().from(users).where(eq(users.email, "tara@example.test"));
    expect(user.role).toBe("student");
  });

  it("logs author and date of creation, reissue, cancellation and acceptance", async () => {
    const admin = await adminActor();
    await inviteTeacher(admin, teacherForm);
    const id = await invitationId("tara@example.test");
    await reissueInvitation(admin, id);
    await cancelInvitation(admin, id);
    await inviteTeacher(admin, teacherForm);
    await accept(lastInvitationToken());

    const events = await db.select().from(securityEvents);
    const adminId = admin.kind === "user" ? admin.userId : "";
    for (const type of ["invitation_created", "invitation_reissued", "invitation_revoked"] as const) {
      const event = events.find((e) => e.type === type);
      expect(event).toMatchObject({ actorUserId: adminId });
      expect(event?.createdAt).toBeInstanceOf(Date);
    }
    expect(events.some((e) => e.type === "invitation_accepted")).toBe(true);

    const rows = await listTeacherInvitations(admin);
    expect(rows.map((r) => r.state).sort()).toEqual(["accepted", "cancelled"]);
    expect(rows.every((r) => r.sentBy === "admin user")).toBe(true);
  });
});

describe("first administrator (local script, Q2 provisional)", () => {
  const input = { email: "first@example.test", firstName: "Ada", lastName: "Admin" };

  it("creates one administrator, who sets the password through the link", async () => {
    const result = await createFirstAdmin(input, PASSWORD_RESET_TTL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await resetPasswordWithToken({ token: result.token, password: PASSWORD })).toEqual({ status: "done" });
    expect(await signInRole("first@example.test")).toBe("admin");
  });

  it("refuses a second administrator and an email already taken", async () => {
    await createUser("student@example.test", "student");
    expect(await createFirstAdmin({ ...input, email: "student@example.test" }, PASSWORD_RESET_TTL)).toEqual({
      ok: false,
      reason: "email_taken",
    });
    await createFirstAdmin(input, PASSWORD_RESET_TTL);
    expect(await createFirstAdmin({ ...input, email: "second@example.test" }, PASSWORD_RESET_TTL)).toEqual({
      ok: false,
      reason: "admin_exists",
    });
  });
});
