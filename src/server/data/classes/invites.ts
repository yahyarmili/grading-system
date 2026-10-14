import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { CLASS_INVITE_TTL } from "@/config/decisions";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { appUrl } from "@/server/auth/urls";
import {
  codeDigest,
  formatCode,
  inviteCode,
  inviteKey,
  isInviteUsable,
  linkDigest,
  linkToken,
  newInvite,
} from "@/server/classes/invite-codes";
import { db } from "@/server/db/client";
import { classes } from "@/server/db/schema";
import { ownedBy } from "../access";
import { recordSecurityEvent } from "../auth/security-events";

// CLS-02: the link and code of a class (row "classInvite" of the matrix),
// for its teacher only. They are derived from the stored nonce, never stored.

const owners = { teacher: classes.teacherId };

export type InviteState = "active" | "disabled" | "expired";

export type ClassInvite = {
  /** Null unless active: a dead link or code is not shown again. */
  link: string | null;
  code: string | null;
  state: InviteState;
  issuedAt: string;
};

/** CA1: the class's link and code, or null when the class is absent or another person's. */
export async function getClassInvite(actor: Actor, classId: string): Promise<ClassInvite | null> {
  const grant = authorize(actor, "classInvite", "read");
  const [row] = await db
    .select({ nonce: classes.inviteNonce, disabledAt: classes.inviteDisabledAt, issuedAt: classes.inviteIssuedAt })
    .from(classes)
    .where(and(eq(classes.id, classId), ownedBy(grant, owners)));
  if (!row) return null;

  const state: InviteState = row.disabledAt
    ? "disabled"
    : isInviteUsable(row, CLASS_INVITE_TTL, new Date())
      ? "active"
      : "expired";
  const key = inviteKey();
  return {
    link: state === "active" ? appUrl("/join", { token: linkToken(key, row.nonce) }) : null,
    code: state === "active" ? formatCode(inviteCode(key, row.nonce)) : null,
    state,
    issuedAt: row.issuedAt.toISOString(),
  };
}

/**
 * CA2: a new link and code; the old ones stop working at once, members stay.
 * Also the way back after a disabling. False when the class is absent or another person's.
 */
export async function renewClassInvite(actor: Actor, classId: string): Promise<boolean> {
  const grant = authorize(actor, "classInvite", "write");
  // A second try only for the (40-bit) unlikely case of a code digest already taken.
  for (let attempt = 0; attempt < 2; attempt++) {
    const invite = newInvite();
    try {
      return await db.transaction(async (tx) => {
        const [renewed] = await tx
          .update(classes)
          .set({
            inviteNonce: invite.nonce,
            inviteLinkDigest: invite.linkDigest,
            inviteCodeDigest: invite.codeDigest,
            inviteIssuedAt: sql`now()`,
            inviteDisabledAt: null,
          })
          .where(and(eq(classes.id, classId), ownedBy(grant, owners)))
          .returning({ id: classes.id });
        if (!renewed) return false;
        await recordSecurityEvent("class_invite_renewed", { actorUserId: grant.userId, subjectId: classId }, tx);
        return true;
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 1) throw error;
    }
  }
  return false;
}

/** CA3: the link and code stop working at once; members stay. False when absent or another person's. */
export async function disableClassInvite(actor: Actor, classId: string): Promise<boolean> {
  const grant = authorize(actor, "classInvite", "write");
  return db.transaction(async (tx) => {
    const [disabled] = await tx
      .update(classes)
      .set({ inviteDisabledAt: sql`coalesce(${classes.inviteDisabledAt}, now())` })
      .where(and(eq(classes.id, classId), ownedBy(grant, owners)))
      .returning({ id: classes.id });
    if (!disabled) return false;
    await recordSecurityEvent("class_invite_disabled", { actorUserId: grant.userId, subjectId: classId }, tx);
    return true;
  });
}

/**
 * The class a link or a code opens, if it still works (CLS-02 R3). The code
 * or link is the proof; called only behind the attempt limit (attempts.ts).
 */
export async function findClassByInvite(input: { code: string } | { linkToken: string }): Promise<string | null> {
  const lookup =
    "code" in input
      ? eq(classes.inviteCodeDigest, codeDigest(inviteKey(), input.code))
      : eq(classes.inviteLinkDigest, linkDigest(input.linkToken));
  const [row] = await db
    .select({ id: classes.id, disabledAt: classes.inviteDisabledAt, issuedAt: classes.inviteIssuedAt })
    .from(classes)
    .where(lookup);
  return row && isInviteUsable(row, CLASS_INVITE_TTL, new Date()) ? row.id : null;
}

/** Postgres unique_violation, raw or wrapped by Drizzle. */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}
