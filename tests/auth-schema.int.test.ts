import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auth } from "@/server/data/auth/better-auth";
import { db } from "@/server/db/client";
import { accounts, authTokens, sessions, teacherInvitations, users } from "@/server/db/schema";

// E1.1: the auth tables, their constraints, and the Better Auth configuration
// working on them. The flows themselves are tested with their prompt (E1.2 to E1.5).

const PASSWORD = "correct horse battery";

async function createUser(email: string, opts: { verified: boolean; role?: "student" | "teacher" | "admin" }) {
  const [user] = await db
    .insert(users)
    .values({
      email,
      emailVerified: opts.verified,
      name: "Sam Lee",
      firstName: "Sam",
      lastName: "Lee",
      role: opts.role ?? "student",
    })
    .returning({ id: users.id });
  await db.insert(accounts).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(PASSWORD),
  });
  return user.id;
}

/** The Better Auth error code of a rejected call. */
async function errorCode(call: Promise<unknown>): Promise<string | undefined> {
  try {
    await call;
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code;
  }
  return undefined;
}

describe("auth schema", () => {
  it("accepts only the three roles (invariant 1)", async () => {
    await expect(
      db.execute(sql`INSERT INTO users (email, name, first_name, last_name, role)
        VALUES ('a@example.test', 'A B', 'A', 'B', 'superuser')`),
    ).rejects.toThrow();
  });

  it("requires a role: no default", async () => {
    await expect(
      db.execute(sql`INSERT INTO users (email, name, first_name, last_name)
        VALUES ('a@example.test', 'A B', 'A', 'B')`),
    ).rejects.toThrow();
  });

  it("stores emails normalised, once", async () => {
    await createUser("sam@example.test", { verified: false });
    await expect(createUser(" Sam@Example.test", { verified: false })).rejects.toThrow();
    await expect(createUser("sam@example.test", { verified: false })).rejects.toThrow();
  });

  it("keeps at most one open invitation per email", async () => {
    const adminId = await createUser("admin@example.test", { verified: true, role: "admin" });
    const invitation = { email: "t@example.test", firstName: "T", lastName: "Q", createdById: adminId };
    const [first] = await db.insert(teacherInvitations).values(invitation).returning();
    await expect(db.insert(teacherInvitations).values(invitation)).rejects.toThrow();
    await db
      .update(teacherInvitations)
      .set({ revokedAt: new Date(), revokedById: adminId })
      .where(eq(teacherInvitations.id, first.id));
    await expect(db.insert(teacherInvitations).values(invitation)).resolves.toBeDefined();
  });

  it("ties an invitation token to an invitation and other tokens to an account", async () => {
    const userId = await createUser("sam@example.test", { verified: false });
    const expiresAt = new Date(Date.now() + 60_000);
    await expect(
      db.insert(authTokens).values({ purpose: "email_verification", tokenHash: "h1", userId, expiresAt }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(authTokens).values({ purpose: "teacher_invitation", tokenHash: "h2", userId, expiresAt }),
    ).rejects.toThrow();
    await expect(
      db.insert(authTokens).values({ purpose: "password_reset", tokenHash: "h3", expiresAt }),
    ).rejects.toThrow();
  });
});

describe("Better Auth configuration", () => {
  it("signs in a confirmed account and stores the session in the database", async () => {
    const userId = await createUser("sam@example.test", { verified: true });
    const result = await auth.api.signInEmail({ body: { email: "sam@example.test", password: PASSWORD } });
    expect(result.user.id).toBe(userId);
    const stored = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(stored).toHaveLength(1);
  });

  it("gives no session to an unconfirmed account (AUTH-02 R3)", async () => {
    const userId = await createUser("sam@example.test", { verified: false });
    const code = await errorCode(
      auth.api.signInEmail({ body: { email: "sam@example.test", password: PASSWORD } }),
    );
    expect(code).toBe("EMAIL_NOT_VERIFIED");
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
  });

  it("answers the same for an unknown email and a wrong password (AUTH-02 R2)", async () => {
    await createUser("sam@example.test", { verified: true });
    const wrongPassword = await errorCode(
      auth.api.signInEmail({ body: { email: "sam@example.test", password: "wrong password" } }),
    );
    const unknownEmail = await errorCode(
      auth.api.signInEmail({ body: { email: "nobody@example.test", password: PASSWORD } }),
    );
    expect(wrongPassword).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(unknownEmail).toBe(wrongPassword);
  });
});
