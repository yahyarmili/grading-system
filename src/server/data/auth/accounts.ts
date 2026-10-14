import "server-only";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { EMAIL_VERIFICATION_TTL, PASSWORD_RESET_TTL } from "@/config/provisional";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import type { SignUpInput } from "@/server/auth/schemas";
import { db } from "@/server/db/client";
import { accounts, sessions, users } from "@/server/db/schema";
import { joinFromIntents, recordJoinIntent } from "../classes/join-intents";
import { recordSecurityEvent } from "./security-events";
import { consumeToken, issueToken } from "./tokens";

/**
 * What the caller must send. The three outcomes lead to the same screen
 * (AUTH-01 CA2): only the email differs, and only its recipient reads it.
 */
export type StudentRegistration =
  | { outcome: "created" | "unconfirmed"; to: string; firstName: string; verificationToken: string }
  | { outcome: "confirmed"; to: string; firstName: string }
  | { outcome: "unchanged" };

/**
 * AUTH-01: public sign-up produces a student, and nothing else (invariant 1).
 * Visitors only. The role is written here, never read from the input.
 */
/**
 * A class link opened before signing up (`inviteToken`) is bound to the new or
 * still unconfirmed account, and used at confirmation (CLS-03 R3).
 */
export async function registerStudent(
  actor: Actor,
  input: SignUpInput,
  options: { inviteToken?: string } = {},
): Promise<StudentRegistration> {
  if (actor.kind !== "visitor") throw new AccessDeniedError();

  // Hashed in every case, so an existing email does not answer faster.
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id, firstName: users.firstName, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, input.email));

    if (existing?.emailVerified) {
      return { outcome: "confirmed", to: input.email, firstName: existing.firstName };
    }
    if (existing) {
      // The stored account is unchanged; a new link replaces the old one.
      if (options.inviteToken) await recordJoinIntent(tx, existing.id, options.inviteToken);
      const verificationToken = await issueToken(
        tx, "email_verification", { userId: existing.id }, EMAIL_VERIFICATION_TTL,
      );
      return { outcome: "unconfirmed", to: input.email, firstName: existing.firstName, verificationToken };
    }

    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        emailVerified: false,
        name: `${input.firstName} ${input.lastName}`,
        firstName: input.firstName,
        lastName: input.lastName,
        role: "student",
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!user) {
      // Same email created concurrently by another request: that request sends the link.
      return { outcome: "unchanged" };
    }
    await tx.insert(accounts).values({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: passwordHash,
    });
    if (options.inviteToken) await recordJoinIntent(tx, user.id, options.inviteToken);
    const verificationToken = await issueToken(
      tx, "email_verification", { userId: user.id }, EMAIL_VERIFICATION_TTL,
    );
    return { outcome: "created", to: input.email, firstName: input.firstName, verificationToken };
  });
}

/**
 * Confirms the address behind a one-time link. Any actor may follow a link:
 * the token is the proof. Expired, used, revoked or forged: false, nothing changes.
 */
export async function confirmEmail(token: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const used = await consumeToken(tx, "email_verification", token);
    if (!used?.userId) return false;
    await tx
      .update(users)
      .set({ emailVerified: true })
      .where(and(eq(users.id, used.userId), eq(users.emailVerified, false)));
    // A class link opened before signing up: joined now that the account is confirmed.
    await joinFromIntents(tx, used.userId);
    await recordSecurityEvent("email_verified", { actorUserId: used.userId, subjectId: used.userId }, tx);
    return true;
  });
}

/** A link to send by email; null when there is nothing to send. */
export type LinkToSend = { to: string; firstName: string; token: string } | null;

/**
 * AUTH-05 R1: a reset link for any account with this email, whatever its role
 * or state. Earlier reset links stop working. Unknown email: null.
 */
export async function requestPasswordReset(email: string): Promise<LinkToSend> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, firstName: users.firstName })
      .from(users)
      .where(eq(users.email, email));
    if (!user) return null;
    const token = await issueToken(tx, "password_reset", { userId: user.id }, PASSWORD_RESET_TTL);
    return { to: email, firstName: user.firstName, token };
  });
}

/**
 * AUTH-05 R2: a new confirmation link for an unconfirmed account; the old one
 * stops working. Unknown or already confirmed email: null.
 */
export async function requestEmailVerification(email: string): Promise<LinkToSend> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, firstName: users.firstName })
      .from(users)
      .where(and(eq(users.email, email), eq(users.emailVerified, false)));
    if (!user) return null;
    const token = await issueToken(tx, "email_verification", { userId: user.id }, EMAIL_VERIFICATION_TTL);
    return { to: email, firstName: user.firstName, token };
  });
}

/**
 * Sets a new password through a one-time reset link (AUTH-05 R1, CA2):
 * confirms the address (the email was read), and closes every open session.
 * Expired, used, revoked or forged link: false, nothing changes.
 */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    const used = await consumeToken(tx, "password_reset", token);
    if (!used?.userId) return false;
    const userId = used.userId;

    const updated = await tx
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (updated.length === 0) {
      // An account created without a password (first administrator) gets one here.
      await tx.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: passwordHash });
    }
    await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
    // The address is confirmed here too: a class link opened before signing up is joined.
    await joinFromIntents(tx, userId);
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await recordSecurityEvent("password_reset", { actorUserId: userId, subjectId: userId }, tx);
    return true;
  });
}
