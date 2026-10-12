import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SIGN_IN_MAX_FAILURES } from "@/config/provisional";
import { signInUser, signOutUser } from "@/server/auth/sign-in";
import { auth } from "@/server/data/auth/better-auth";
import { db } from "@/server/db/client";
import { accounts, authThrottles, securityEvents, sessions, users } from "@/server/db/schema";
import { proxy } from "@/proxy";

// AUTH-02: sign-in, sign-out and session (R1 to R4, CA1 to CA4), and the role
// space guard of src/proxy.ts.

const PASSWORD = "correct horse battery";
type Role = "student" | "teacher" | "admin";

async function createUser(email: string, role: Role, verified = true) {
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified: verified, name: "Sam Lee", firstName: "Sam", lastName: "Lee", role })
    .returning({ id: users.id });
  await db.insert(accounts).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(PASSWORD),
  });
  return user.id;
}

const signIn = (email: string, password: string) =>
  signInUser({ email, password }, { headers: new Headers() });

/** A browser's Cookie header after signing in. */
async function sessionCookie(email: string): Promise<string> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

const sessionFor = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) });

async function visit(path: string, cookie?: string) {
  const request = new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
  const response = await proxy(request);
  return {
    status: response.status,
    location: response.headers.get("location"),
    rewrite: response.headers.get("x-middleware-rewrite"),
    cacheControl: response.headers.get("cache-control"),
  };
}

describe("CA1: a confirmed account reaches the space of its role", () => {
  it.each<Role>(["student", "teacher", "admin"])("signs in a %s", async (role) => {
    const userId = await createUser(`${role}@example.test`, role);
    expect(await signIn(`${role}@example.test`, PASSWORD)).toEqual({ status: "done", role });
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
  });

  it("accepts the email with another case or spaces", async () => {
    await createUser("sam@example.test", "student");
    expect(await signIn("  SAM@Example.test ", PASSWORD)).toEqual({ status: "done", role: "student" });
  });

  it("records the sign-in in the security log, without the email", async () => {
    const userId = await createUser("sam@example.test", "student");
    await signIn("sam@example.test", PASSWORD);
    const [event] = await db.select().from(securityEvents);
    expect(event).toMatchObject({ type: "sign_in_succeeded", actorUserId: userId });
  });
});

describe("CA2: wrong credentials give no session and one message", () => {
  it("answers an unknown email exactly like a wrong password", async () => {
    await createUser("sam@example.test", "student");
    const wrongPassword = await signIn("sam@example.test", "wrong password");
    const unknownEmail = await signIn("nobody@example.test", PASSWORD);

    expect(wrongPassword).toEqual({ status: "rejected", email: "sam@example.test" });
    expect(unknownEmail).toEqual({ status: "rejected", email: "nobody@example.test" });
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("refuses empty fields before any lookup", async () => {
    const state = await signIn("", "");
    expect(state.status).toBe("invalid");
    expect(await db.select().from(authThrottles)).toHaveLength(0);
  });
});

describe(`CA3: after ${SIGN_IN_MAX_FAILURES} failures, sign-in is paused (provisional N and D)`, () => {
  async function failNTimes(email: string) {
    for (let i = 0; i < SIGN_IN_MAX_FAILURES; i++) {
      expect((await signIn(email, "wrong password")).status).toBe("rejected");
    }
  }

  it("refuses the right password during the pause, with the same message", async () => {
    await createUser("sam@example.test", "student");
    await failNTimes("sam@example.test");

    expect(await signIn("sam@example.test", PASSWORD)).toEqual({ status: "rejected", email: "sam@example.test" });
    expect(await db.select().from(sessions)).toHaveLength(0);
    const types = (await db.select().from(securityEvents)).map((e) => e.type);
    expect(types.filter((t) => t === "sign_in_locked")).toHaveLength(1);
  });

  it("pauses an unknown email the same way: the pause reveals no account", async () => {
    await failNTimes("nobody@example.test");
    const [throttle] = await db.select().from(authThrottles);
    expect(throttle.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("lets the right password in once the pause is over, and restarts the count", async () => {
    await createUser("sam@example.test", "student");
    await failNTimes("sam@example.test");
    await db.update(authThrottles).set({ lockedUntil: sql`now() - interval '1 second'` });

    expect(await signIn("sam@example.test", PASSWORD)).toEqual({ status: "done", role: "student" });
    expect(await db.select().from(authThrottles)).toHaveLength(0);
  });

  it("keeps other accounts open", async () => {
    await createUser("sam@example.test", "student");
    await createUser("kim@example.test", "student");
    await failNTimes("sam@example.test");
    expect(await signIn("kim@example.test", PASSWORD)).toEqual({ status: "done", role: "student" });
  });
});

describe("CA4: sign-out, expiry and unconfirmed accounts", () => {
  it("gives no session to an unconfirmed account and says how to confirm (R3)", async () => {
    await createUser("sam@example.test", "student", false);
    expect(await signIn("sam@example.test", PASSWORD)).toEqual({ status: "unconfirmed", email: "sam@example.test" });
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("ends the session in the database on sign-out", async () => {
    const userId = await createUser("sam@example.test", "student");
    const cookie = await sessionCookie("sam@example.test");
    expect((await sessionFor(cookie))?.user.id).toBe(userId);

    await signOutUser({ headers: new Headers({ cookie }), userId });

    expect(await sessionFor(cookie)).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
    const types = (await db.select().from(securityEvents)).map((e) => e.type);
    expect(types).toContain("signed_out");
  });

  it("ignores an expired session", async () => {
    await createUser("sam@example.test", "student");
    const cookie = await sessionCookie("sam@example.test");
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 second'` });
    expect(await sessionFor(cookie)).toBeNull();
  });
});

describe("role spaces (src/proxy.ts)", () => {
  it("sends a visitor to sign-in", async () => {
    const result = await visit("/student/assignments");
    expect(result.status).toBe(307);
    expect(new URL(result.location!).pathname).toBe("/sign-in");
  });

  it("lets a student into the student space, never stored by the browser", async () => {
    await createUser("sam@example.test", "student");
    const result = await visit("/student/assignments", await sessionCookie("sam@example.test"));
    expect(result.status).toBe(200);
    expect(result.rewrite).toBeNull();
    expect(result.cacheControl).toContain("no-store");
  });

  it.each([
    ["student", "/teacher/classes"],
    ["student", "/admin/teachers"],
    ["teacher", "/student/assignments"],
    ["teacher", "/admin/teachers"],
    ["admin", "/teacher/classes"],
    ["admin", "/student/assignments"],
  ] as const)("answers not found to a %s on %s", async (role, path) => {
    await createUser(`${role}@example.test`, role);
    const result = await visit(path, await sessionCookie(`${role}@example.test`));
    expect(new URL(result.rewrite!).pathname).toBe("/not-found");
  });

  it("back button after sign-out: the same cookie now leads to sign-in (R4)", async () => {
    const userId = await createUser("sam@example.test", "student");
    const cookie = await sessionCookie("sam@example.test");
    expect((await visit("/student/assignments", cookie)).status).toBe(200);

    await signOutUser({ headers: new Headers({ cookie }), userId });

    const after = await visit("/student/assignments", cookie);
    expect(after.status).toBe(307);
    expect(new URL(after.location!).pathname).toBe("/sign-in");
  });

  it("an expired session leads to sign-in", async () => {
    await createUser("sam@example.test", "student");
    const cookie = await sessionCookie("sam@example.test");
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 second'` });
    expect((await visit("/student/assignments", cookie)).status).toBe(307);
  });
});
