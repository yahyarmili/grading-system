import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { LINK_REQUEST_MAX } from "@/config/provisional";
import {
  requestConfirmationLink,
  requestPasswordResetLink,
  resetPasswordWithToken,
} from "@/server/auth/recovery";
import { confirmEmailWithToken } from "@/server/auth/sign-up";
import { auth } from "@/server/data/auth/better-auth";
import { db } from "@/server/db/client";
import { accounts, authTokens, securityEvents, sessions, users } from "@/server/db/schema";
import { getCaptureSender } from "@/server/email";

// AUTH-05: forgot password and new confirmation link (R1 to R3, CA1 to CA3).

const OLD_PASSWORD = "correct horse battery";
const NEW_PASSWORD = "a brand new password";

async function createUser(email: string, opts: { verified: boolean; withPassword?: boolean }) {
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified: opts.verified, name: "Sam Lee", firstName: "Sam", lastName: "Lee", role: "student" })
    .returning({ id: users.id });
  if (opts.withPassword !== false) {
    await db.insert(accounts).values({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(OLD_PASSWORD),
    });
  }
  return user.id;
}

/** Runs the scheduled email at once, like after() would once the response is sent. */
async function run<T>(call: (ctx: { schedule: (task: () => Promise<void>) => void }) => Promise<T>) {
  const tasks: Promise<void>[] = [];
  const result = await call({ schedule: (task) => void tasks.push(task()) });
  await Promise.all(tasks);
  return result;
}

const forgot = (email: string) => run((ctx) => requestPasswordResetLink({ email }, ctx));
const resend = (email: string) => run((ctx) => requestConfirmationLink({ email }, ctx));
const outbox = () => getCaptureSender().captured();

function lastToken(kind: "password_reset" | "email_verification"): string {
  const message = outbox().findLast((m) => m.kind === kind);
  const match = message?.text.match(/token=([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error(`No ${kind} link sent`);
  return match[1];
}

async function signInCode(email: string, password: string) {
  try {
    await auth.api.signInEmail({ body: { email, password } });
    return "ok";
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code;
  }
}

beforeEach(() => getCaptureSender().clear());

describe("CA1: forgot password answers the same for every email", () => {
  it("sends a reset link to a known email, and nothing to an unknown one, with one answer", async () => {
    await createUser("sam@example.test", { verified: true });
    const known = await forgot(" SAM@example.test ");
    const unknown = await forgot("nobody@example.test");

    expect(known).toEqual({ status: "done" });
    expect(unknown).toEqual(known);
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ kind: "password_reset", to: "sam@example.test" });
    expect(outbox()[0].text).toContain("/reset-password?token=");
  });

  it("refuses an expired link and leaves the password unchanged", async () => {
    await createUser("sam@example.test", { verified: true });
    await forgot("sam@example.test");
    await db.update(authTokens).set({ expiresAt: sql`now() - interval '1 second'` });

    expect(await resetPasswordWithToken({ token: lastToken("password_reset"), password: NEW_PASSWORD })).toEqual({
      status: "invalid-link",
    });
    expect(await signInCode("sam@example.test", OLD_PASSWORD)).toBe("ok");
  });

  it("refuses a link already used, replaced by a newer one, or forged", async () => {
    await createUser("sam@example.test", { verified: true });
    await forgot("sam@example.test");
    const replaced = lastToken("password_reset");
    await forgot("sam@example.test");
    const current = lastToken("password_reset");

    expect(await resetPasswordWithToken({ token: replaced, password: NEW_PASSWORD })).toEqual({ status: "invalid-link" });
    expect(await resetPasswordWithToken({ token: "A".repeat(43), password: NEW_PASSWORD })).toEqual({ status: "invalid-link" });
    expect(await resetPasswordWithToken({ token: "short", password: NEW_PASSWORD })).toEqual({ status: "invalid-link" });

    expect(await resetPasswordWithToken({ token: current, password: NEW_PASSWORD })).toEqual({ status: "done" });
    expect(await resetPasswordWithToken({ token: current, password: "yet another one" })).toEqual({ status: "invalid-link" });
    expect(await signInCode("sam@example.test", NEW_PASSWORD)).toBe("ok");
  });

  it("refuses a too short password without using the link", async () => {
    await createUser("sam@example.test", { verified: true });
    await forgot("sam@example.test");
    const token = lastToken("password_reset");

    const state = await resetPasswordWithToken({ token, password: "short" });
    expect(state.status).toBe("invalid");
    expect(await resetPasswordWithToken({ token, password: NEW_PASSWORD })).toEqual({ status: "done" });
  });
});

describe("CA2: a successful reset closes every session and confirms the address", () => {
  it("closes open sessions, replaces the password and logs the event", async () => {
    const userId = await createUser("sam@example.test", { verified: true });
    await auth.api.signInEmail({ body: { email: "sam@example.test", password: OLD_PASSWORD } });
    await auth.api.signInEmail({ body: { email: "sam@example.test", password: OLD_PASSWORD } });
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(2);

    await forgot("sam@example.test");
    await resetPasswordWithToken({ token: lastToken("password_reset"), password: NEW_PASSWORD });

    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    expect(await signInCode("sam@example.test", OLD_PASSWORD)).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(await signInCode("sam@example.test", NEW_PASSWORD)).toBe("ok");
    const events = await db.select().from(securityEvents);
    expect(events.map((e) => e.type)).toContain("password_reset");
  });

  it("confirms an unconfirmed account (R1)", async () => {
    await createUser("sam@example.test", { verified: false });
    expect(await signInCode("sam@example.test", OLD_PASSWORD)).toBe("EMAIL_NOT_VERIFIED");

    await forgot("sam@example.test");
    await resetPasswordWithToken({ token: lastToken("password_reset"), password: NEW_PASSWORD });

    const [user] = await db.select().from(users).where(eq(users.email, "sam@example.test"));
    expect(user.emailVerified).toBe(true);
    expect(await signInCode("sam@example.test", NEW_PASSWORD)).toBe("ok");
  });

  it("gives a password to an account created without one", async () => {
    await createUser("sam@example.test", { verified: true, withPassword: false });
    await forgot("sam@example.test");
    await resetPasswordWithToken({ token: lastToken("password_reset"), password: NEW_PASSWORD });
    expect(await signInCode("sam@example.test", NEW_PASSWORD)).toBe("ok");
  });
});

describe("CA3: new confirmation link", () => {
  it("sends a new link that works, and the old one stops working (R2)", async () => {
    await createUser("sam@example.test", { verified: false });
    await resend("sam@example.test");
    const old = lastToken("email_verification");
    await resend("sam@example.test");
    const current = lastToken("email_verification");

    expect(current).not.toBe(old);
    expect(await confirmEmailWithToken(old)).toEqual({ status: "invalid" });
    expect(await confirmEmailWithToken(current)).toEqual({ status: "done" });
  });

  it("answers the same for an unknown or already confirmed email, and sends nothing", async () => {
    await createUser("waiting@example.test", { verified: false });
    await createUser("done@example.test", { verified: true });

    const waiting = await resend("waiting@example.test");
    const confirmed = await resend("done@example.test");
    const unknown = await resend("nobody@example.test");

    expect(confirmed).toEqual(waiting);
    expect(unknown).toEqual(waiting);
    expect(outbox().map((m) => m.to)).toEqual(["waiting@example.test"]);
  });

  it("refuses an invalid email with a field message", async () => {
    const state = await resend("not an email");
    expect(state).toMatchObject({ status: "invalid", email: "not an email" });
  });
});

describe(`repeated requests are limited (R3, ${LINK_REQUEST_MAX} per window, provisional)`, () => {
  it("stops sending reset links beyond the limit, with the same answer", async () => {
    await createUser("sam@example.test", { verified: true });
    for (let i = 0; i < LINK_REQUEST_MAX + 2; i++) {
      expect(await forgot("sam@example.test")).toEqual({ status: "done" });
    }
    expect(outbox()).toHaveLength(LINK_REQUEST_MAX);
  });

  it("stops sending confirmation links beyond the limit", async () => {
    await createUser("sam@example.test", { verified: false });
    for (let i = 0; i < LINK_REQUEST_MAX + 2; i++) {
      expect(await resend("sam@example.test")).toEqual({ status: "done" });
    }
    expect(outbox()).toHaveLength(LINK_REQUEST_MAX);
  });

  it("counts each email separately", async () => {
    await createUser("sam@example.test", { verified: true });
    await createUser("kim@example.test", { verified: true });
    for (let i = 0; i < LINK_REQUEST_MAX + 1; i++) await forgot("sam@example.test");
    getCaptureSender().clear();
    await forgot("kim@example.test");
    expect(outbox()).toHaveLength(1);
  });
});
