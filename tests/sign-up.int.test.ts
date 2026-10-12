import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { SIGN_UP_MAX_PER_IP } from "@/config/provisional";
import type { Actor } from "@/server/access/actor";
import { hashToken } from "@/server/auth/tokens";
import { confirmEmailWithToken, signUpStudent, SIGN_UP_MESSAGES } from "@/server/auth/sign-up";
import { auth } from "@/server/data/auth/better-auth";
import { db } from "@/server/db/client";
import { authTokens, securityEvents, sessions, users } from "@/server/db/schema";
import { getCaptureSender } from "@/server/email";

// AUTH-01: student sign-up and email confirmation (R1 to R3, CA1 to CA4).

const visitor: Actor = { kind: "visitor" };
const form = { firstName: "Sam", lastName: "Lee", email: "sam@example.test", password: "correct horse" };

let ipCounter = 0;
/** Runs the scheduled email at once; a fresh IP per call keeps the limit out of the way. */
function signUp(raw: unknown, overrides: { actor?: Actor; ip?: string } = {}) {
  const tasks: Promise<void>[] = [];
  const result = signUpStudent(raw, {
    actor: overrides.actor ?? visitor,
    ip: overrides.ip ?? `10.0.0.${++ipCounter}`,
    schedule: (task) => void tasks.push(task()),
  });
  return result.then(async (state) => {
    await Promise.all(tasks);
    return state;
  });
}

const outbox = () => getCaptureSender().captured();

/** The token of the latest confirmation email. */
function lastLinkToken(): string {
  const message = outbox().findLast((m) => m.kind === "email_verification");
  const match = message?.text.match(/token=([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error("No confirmation link sent");
  return match[1];
}

async function userByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

async function signInCode(email: string, password: string): Promise<string | undefined> {
  try {
    await auth.api.signInEmail({ body: { email, password } });
    return undefined;
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code;
  }
}

beforeEach(() => getCaptureSender().clear());

describe("CA1: a new email creates an unconfirmed student and sends a link", () => {
  it("creates the account and sends one confirmation email", async () => {
    expect(await signUp(form)).toEqual({ status: "done" });

    const user = await userByEmail("sam@example.test");
    expect(user).toMatchObject({ role: "student", emailVerified: false, firstName: "Sam", lastName: "Lee" });
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ kind: "email_verification", to: "sam@example.test" });
    expect(outbox()[0].text).toContain("/verify-email?token=");
  });

  it("stores the link as a digest only", async () => {
    await signUp(form);
    const token = lastLinkToken();
    const rows = await db.select().from(authTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(token));
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("confirms the address with the link, which then allows sign-in (R3)", async () => {
    await signUp(form);
    expect(await signInCode("sam@example.test", form.password)).toBe("EMAIL_NOT_VERIFIED");

    expect(await confirmEmailWithToken(lastLinkToken())).toEqual({ status: "done" });

    expect((await userByEmail("sam@example.test")).emailVerified).toBe(true);
    expect(await signInCode("sam@example.test", form.password)).toBeUndefined();
    const events = await db.select().from(securityEvents);
    expect(events.map((e) => e.type)).toEqual(["email_verified"]);
  });

  it("refuses invalid fields without creating anything", async () => {
    const state = await signUp({ ...form, email: "not an email", password: "short" });
    expect(state.status).toBe("invalid");
    if (state.status === "invalid") {
      expect(Object.keys(state.fieldErrors).sort()).toEqual(["email", "password"]);
      expect(state.values).not.toHaveProperty("password");
    }
    expect(await db.select().from(users)).toHaveLength(0);
    expect(outbox()).toHaveLength(0);
  });
});

describe("CA2: an email already registered, with another case or spaces", () => {
  it("creates no second account and answers exactly as for a new email", async () => {
    const first = await signUp(form);
    const second = await signUp({ ...form, email: "  SAM@Example.Test ", password: "other password" });

    expect(second).toEqual(first);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("sends a new link to an unconfirmed account and keeps its password", async () => {
    await signUp(form);
    const firstToken = lastLinkToken();
    await signUp({ ...form, email: " Sam@example.test", password: "other password" });

    expect(lastLinkToken()).not.toBe(firstToken);
    expect(await confirmEmailWithToken(lastLinkToken())).toEqual({ status: "done" });
    expect(await signInCode("sam@example.test", form.password)).toBeUndefined();
    expect(await signInCode("sam@example.test", "other password")).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("tells a confirmed account by email, not on screen", async () => {
    await signUp(form);
    await confirmEmailWithToken(lastLinkToken());
    getCaptureSender().clear();

    expect(await signUp({ ...form, email: "SAM@EXAMPLE.TEST" })).toEqual({ status: "done" });
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]).toMatchObject({ kind: "account_exists", to: "sam@example.test" });
    expect(outbox()[0].text).not.toContain("token=");
  });
});

describe("CA3: a role sent with the request is ignored", () => {
  it.each(["teacher", "admin"])("creates a student when the request asks for %s", async (role) => {
    await signUp({ ...form, role, emailVerified: true });
    const user = await userByEmail("sam@example.test");
    expect(user.role).toBe("student");
    expect(user.emailVerified).toBe(false);
  });

  it("refuses sign-up to a signed-in user", async () => {
    const actor: Actor = { kind: "user", userId: crypto.randomUUID(), role: "student" };
    expect(await signUp(form, { actor })).toEqual({ status: "error", message: SIGN_UP_MESSAGES.notAvailable });
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe("CA4: expired, used or forged links leave the account unconfirmed", () => {
  const invalid = { status: "invalid" };

  async function expectUnconfirmed() {
    expect((await userByEmail("sam@example.test")).emailVerified).toBe(false);
    expect(await signInCode("sam@example.test", form.password)).toBe("EMAIL_NOT_VERIFIED");
    expect(await db.select().from(sessions)).toHaveLength(0);
  }

  it("refuses an expired link", async () => {
    await signUp(form);
    await db.update(authTokens).set({ expiresAt: sql`now() - interval '1 second'` });
    expect(await confirmEmailWithToken(lastLinkToken())).toEqual(invalid);
    await expectUnconfirmed();
  });

  it("refuses a link already used", async () => {
    await signUp(form);
    const token = lastLinkToken();
    expect(await confirmEmailWithToken(token)).toEqual({ status: "done" });
    expect(await confirmEmailWithToken(token)).toEqual(invalid);
  });

  it("lets a link be used only once, even twice at the same time", async () => {
    await signUp(form);
    const token = lastLinkToken();
    const results = await Promise.all([confirmEmailWithToken(token), confirmEmailWithToken(token)]);
    expect(results.filter((r) => r.status === "done")).toHaveLength(1);
  });

  it("refuses a link replaced by a newer one", async () => {
    await signUp(form);
    const oldToken = lastLinkToken();
    await signUp(form);
    expect(await confirmEmailWithToken(oldToken)).toEqual(invalid);
    await expectUnconfirmed();
  });

  it("refuses a forged or altered link", async () => {
    await signUp(form);
    const token = lastLinkToken();
    const altered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    for (const forged of [altered, "A".repeat(43), "not-a-token", "", undefined]) {
      expect(await confirmEmailWithToken(forged)).toEqual(invalid);
    }
    await expectUnconfirmed();
  });
});

describe("attempt limit per network (NFR-SEC-02)", () => {
  it(`refuses sign-ups beyond ${SIGN_UP_MAX_PER_IP} from one IP`, async () => {
    for (let i = 0; i < SIGN_UP_MAX_PER_IP; i++) {
      expect(await signUp({ ...form, email: `s${i}@example.test` }, { ip: "192.0.2.1" })).toEqual({
        status: "done",
      });
    }
    const refused = await signUp({ ...form, email: "late@example.test" }, { ip: "192.0.2.1" });
    expect(refused).toEqual({ status: "error", message: SIGN_UP_MESSAGES.tooMany });
    expect(await userByEmail("late@example.test")).toBeUndefined();
  });
});
