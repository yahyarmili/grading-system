import "server-only";
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, inArray, isNull, sql, TransactionRollbackError } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TEACHER_INVITATION_TTL } from "@/config/provisional";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db/client";
import { accounts, authTokens, securityEvents, teacherInvitations, users } from "@/server/db/schema";
import { recordSecurityEvent } from "./security-events";
import { consumeToken, issueToken } from "./tokens";

// AUTH-03: teacher accounts, created by the administrator through an invitation.
// Every function but the link-based ones takes the Actor and refuses anyone
// but the administrator (deny by default), whatever the screen shows.

function requireAdmin(actor: Actor): string {
  if (actor.kind !== "user" || actor.role !== "admin") throw new AccessDeniedError();
  return actor.userId;
}

export type InvitationState = "pending" | "expired" | "accepted" | "cancelled";

export type InvitationRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  state: InvitationState;
  /** Last email sent (creation or reissue), with its author. ISO dates: the row goes to the client. */
  sentAt: string;
  sentBy: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  acceptedAt: string | null;
};

/** Invitations, newest first, with their state and who did what when (R4). */
export async function listTeacherInvitations(actor: Actor): Promise<InvitationRow[]> {
  requireAdmin(actor);
  const creator = alias(users, "creator");
  const canceller = alias(users, "canceller");

  const rows = await db
    .select({
      id: teacherInvitations.id,
      firstName: teacherInvitations.firstName,
      lastName: teacherInvitations.lastName,
      email: teacherInvitations.email,
      createdAt: teacherInvitations.createdAt,
      createdBy: creator.name,
      revokedAt: teacherInvitations.revokedAt,
      revokedBy: canceller.name,
      acceptedAt: teacherInvitations.acceptedAt,
    })
    .from(teacherInvitations)
    .innerJoin(creator, eq(creator.id, teacherInvitations.createdById))
    .leftJoin(canceller, eq(canceller.id, teacherInvitations.revokedById))
    .orderBy(desc(teacherInvitations.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Latest link of each invitation: its expiry decides "pending" or "expired".
  const links = await db
    .selectDistinctOn([authTokens.invitationId], {
      invitationId: authTokens.invitationId,
      expiresAt: authTokens.expiresAt,
      live: sql<boolean>`${authTokens.usedAt} is null and ${authTokens.revokedAt} is null and ${authTokens.expiresAt} > now()`,
    })
    .from(authTokens)
    .where(inArray(authTokens.invitationId, ids))
    .orderBy(authTokens.invitationId, desc(authTokens.createdAt));

  // Latest sending (creation or reissue) and its author, from the security log.
  const sender = alias(users, "sender");
  const sends = await db
    .selectDistinctOn([securityEvents.subjectId], {
      invitationId: securityEvents.subjectId,
      at: securityEvents.createdAt,
      by: sender.name,
    })
    .from(securityEvents)
    .leftJoin(sender, eq(sender.id, securityEvents.actorUserId))
    .where(
      and(
        inArray(securityEvents.subjectId, ids),
        inArray(securityEvents.type, ["invitation_created", "invitation_reissued"]),
      ),
    )
    .orderBy(securityEvents.subjectId, desc(securityEvents.createdAt));

  const linkOf = new Map(links.map((l) => [l.invitationId, l]));
  const sendOf = new Map(sends.map((s) => [s.invitationId, s]));

  return rows.map((r) => {
    const link = linkOf.get(r.id);
    const send = sendOf.get(r.id);
    const state: InvitationState = r.acceptedAt
      ? "accepted"
      : r.revokedAt
        ? "cancelled"
        : link?.live
          ? "pending"
          : "expired";
    return {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      state,
      sentAt: (send?.at ?? r.createdAt).toISOString(),
      sentBy: send?.by ?? r.createdBy,
      expiresAt: link && state === "pending" ? link.expiresAt.toISOString() : null,
      cancelledAt: r.revokedAt?.toISOString() ?? null,
      cancelledBy: r.revokedBy ?? null,
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
    };
  });
}

/** What the caller emails; the token is in clear only here. */
export type InvitationToSend = { invitationId: string; to: string; firstName: string; token: string };

export type CreateInvitationResult =
  | { ok: true; invitation: InvitationToSend }
  | { ok: false; reason: "email_taken" | "already_invited" };

/**
 * R1, R3: invites a teacher. An email that already has an account, of any
 * role, is refused explicitly (one role per account); so is a second open
 * invitation for the same email (reissue the open one instead).
 */
export async function createTeacherInvitation(
  actor: Actor,
  input: { firstName: string; lastName: string; email: string },
): Promise<CreateInvitationResult> {
  const adminId = requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (taken) return { ok: false, reason: "email_taken" };

    const [invitation] = await tx
      .insert(teacherInvitations)
      .values({ ...input, createdById: adminId })
      .onConflictDoNothing()
      .returning({ id: teacherInvitations.id });
    if (!invitation) return { ok: false, reason: "already_invited" };

    const token = await issueToken(tx, "teacher_invitation", { invitationId: invitation.id }, TEACHER_INVITATION_TTL);
    await recordSecurityEvent("invitation_created", { actorUserId: adminId, subjectId: invitation.id }, tx);
    return {
      ok: true,
      invitation: { invitationId: invitation.id, to: input.email, firstName: input.firstName, token },
    };
  });
}

/** An invitation still open (neither accepted nor cancelled), for the administrator. */
async function findOpenInvitation(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string) {
  const [invitation] = await tx
    .select({ id: teacherInvitations.id, email: teacherInvitations.email, firstName: teacherInvitations.firstName })
    .from(teacherInvitations)
    .where(
      and(
        eq(teacherInvitations.id, id),
        isNull(teacherInvitations.acceptedAt),
        isNull(teacherInvitations.revokedAt),
      ),
    )
    .for("update");
  return invitation;
}

/** CA3: a new link for an open invitation; the previous link stops working. Null if not open. */
export async function reissueTeacherInvitation(actor: Actor, invitationId: string): Promise<InvitationToSend | null> {
  const adminId = requireAdmin(actor);
  return db.transaction(async (tx) => {
    const invitation = await findOpenInvitation(tx, invitationId);
    if (!invitation) return null;
    const token = await issueToken(tx, "teacher_invitation", { invitationId }, TEACHER_INVITATION_TTL);
    await recordSecurityEvent("invitation_reissued", { actorUserId: adminId, subjectId: invitationId }, tx);
    return { invitationId, to: invitation.email, firstName: invitation.firstName, token };
  });
}

/** Cancels an open invitation: its link stops working at once. False if not open. */
export async function cancelTeacherInvitation(actor: Actor, invitationId: string): Promise<boolean> {
  const adminId = requireAdmin(actor);
  return db.transaction(async (tx) => {
    const invitation = await findOpenInvitation(tx, invitationId);
    if (!invitation) return false;
    await tx
      .update(teacherInvitations)
      .set({ revokedAt: sql`now()`, revokedById: adminId })
      .where(eq(teacherInvitations.id, invitationId));
    await tx
      .update(authTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(authTokens.invitationId, invitationId), isNull(authTokens.usedAt), isNull(authTokens.revokedAt)));
    await recordSecurityEvent("invitation_revoked", { actorUserId: adminId, subjectId: invitationId }, tx);
    return true;
  });
}

/**
 * The invitation behind a link, without using it: lets the page greet the
 * teacher and refuse a dead link at once. The token is the proof (no Actor).
 */
export async function peekTeacherInvitation(token: string): Promise<{ email: string; firstName: string } | null> {
  const [row] = await db
    .select({ email: teacherInvitations.email, firstName: teacherInvitations.firstName })
    .from(authTokens)
    .innerJoin(teacherInvitations, eq(teacherInvitations.id, authTokens.invitationId))
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.purpose, "teacher_invitation"),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
        sql`${authTokens.expiresAt} > now()`,
        isNull(teacherInvitations.acceptedAt),
        isNull(teacherInvitations.revokedAt),
      ),
    );
  return row ?? null;
}

/**
 * R2, CA1: the teacher chooses a password; the account is created as a
 * confirmed teacher (the email was read). Expired, used, cancelled, replaced
 * or forged link, or an email taken meanwhile: null, nothing is created.
 */
export async function acceptTeacherInvitation(token: string, password: string): Promise<{ email: string } | null> {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const used = await consumeToken(tx, "teacher_invitation", token);
    if (!used?.invitationId) return null;
    const [invitation] = await tx
      .select()
      .from(teacherInvitations)
      .where(
        and(
          eq(teacherInvitations.id, used.invitationId),
          isNull(teacherInvitations.acceptedAt),
          isNull(teacherInvitations.revokedAt),
        ),
      )
      .for("update");
    if (!invitation) return null;

    // The email got an account since the invitation (one role per account):
    // undo everything, the link included, and create nothing.
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, invitation.email));
    if (taken) tx.rollback();

    const [user] = await tx
      .insert(users)
      .values({
        email: invitation.email,
        emailVerified: true,
        name: `${invitation.firstName} ${invitation.lastName}`,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: "teacher",
      })
      .returning({ id: users.id });
    await tx.insert(accounts).values({ userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash });
    await tx
      .update(teacherInvitations)
      .set({ acceptedAt: sql`now()`, userId: user.id })
      .where(eq(teacherInvitations.id, invitation.id));
    await recordSecurityEvent("invitation_accepted", { actorUserId: user.id, subjectId: invitation.id }, tx);
    return { email: invitation.email };
  }).catch((error: unknown) => {
    if (error instanceof TransactionRollbackError) return null;
    throw error;
  });
}

/**
 * First administrator (Q2, provisional): created by a local script, outside
 * any public screen. Refused if an administrator exists (A2: one) or if the
 * email is taken. The account has no password: the returned reset link sets it.
 */
export async function createFirstAdmin(
  input: { email: string; firstName: string; lastName: string },
  linkTtlSeconds: number,
): Promise<{ ok: true; token: string } | { ok: false; reason: "admin_exists" | "email_taken" }> {
  return db.transaction(async (tx) => {
    const [admin] = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    if (admin) return { ok: false, reason: "admin_exists" };
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        emailVerified: true,
        name: `${input.firstName} ${input.lastName}`,
        firstName: input.firstName,
        lastName: input.lastName,
        role: "admin",
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!user) return { ok: false, reason: "email_taken" };
    const token = await issueToken(tx, "password_reset", { userId: user.id }, linkTtlSeconds);
    await recordSecurityEvent("admin_created", { subjectId: user.id }, tx);
    return { ok: true, token };
  });
}
