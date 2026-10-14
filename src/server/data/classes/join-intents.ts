import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { CLASS_INVITE_TTL } from "@/config/decisions";
import { CLASS_INVITE_INTENT_TTL } from "@/config/provisional";
import { isInviteUsable, LINK_TOKEN_PATTERN, linkDigest } from "@/server/classes/invite-codes";
import type { db } from "@/server/db/client";
import { classes, classJoinIntents, classMemberships } from "@/server/db/schema";

// CLS-03 R3: a class link opened without a session survives sign-up and email
// confirmation, even when the confirmation link opens in another browser.
// The account is joined only once confirmed. Both functions run inside the
// transaction of the sign-up or of the confirmation (accounts.ts).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Binds a class link to a new, unconfirmed account. Malformed: ignored. */
export async function recordJoinIntent(tx: Tx, userId: string, linkToken: string): Promise<void> {
  if (!LINK_TOKEN_PATTERN.test(linkToken)) return;
  await tx.insert(classJoinIntents).values({ userId, linkDigest: linkDigest(linkToken) }).onConflictDoNothing();
}

/**
 * At confirmation: joins every class whose link the account opened, if the
 * link still works; a removed student stays removed. The intents are used up.
 */
export async function joinFromIntents(tx: Tx, userId: string): Promise<void> {
  const intents = await tx
    .delete(classJoinIntents)
    .where(eq(classJoinIntents.userId, userId))
    .returning({
      linkDigest: classJoinIntents.linkDigest,
      // Aged with the database clock, the one that wrote created_at.
      fresh: sql<boolean>`${classJoinIntents.createdAt} > now() - make_interval(secs => ${CLASS_INVITE_INTENT_TTL})`,
    });
  const fresh = intents.filter((i) => i.fresh);
  if (fresh.length === 0) return;

  const targets = await tx
    .select({ id: classes.id, disabledAt: classes.inviteDisabledAt, issuedAt: classes.inviteIssuedAt })
    .from(classes)
    .where(inArray(classes.inviteLinkDigest, fresh.map((i) => i.linkDigest)));
  const usable = targets.filter((c) => isInviteUsable(c, CLASS_INVITE_TTL, new Date()));
  if (usable.length === 0) return;

  await tx
    .insert(classMemberships)
    .values(usable.map((c) => ({ classId: c.id, studentId: userId })))
    .onConflictDoNothing();
}
