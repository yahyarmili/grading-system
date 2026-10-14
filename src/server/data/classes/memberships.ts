import "server-only";
import { and, eq } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { countFailure, tryInvite } from "@/server/classes/attempts";
import { db } from "@/server/db/client";
import { classes, classMemberships, users } from "@/server/db/schema";

// CLS-03: a student joins a class by its link or code (row "classMembership"
// of the matrix): at once, without approval (D2), and only for themself.

export type JoinResult =
  | { outcome: "joined" | "alreadyMember"; classId: string; className: string }
  /** Unknown, disabled, renewed or expired link or code, or a removed student: one answer (CA4). */
  | { outcome: "refused" }
  | { outcome: "locked" }
  | { outcome: "unconfirmed" };

export async function joinClass(
  actor: Actor,
  input: { code: unknown } | { linkToken: unknown },
): Promise<JoinResult> {
  const { userId } = authorize(actor, "classMembership", "write");

  // An unconfirmed account has no session; checked again here (R3).
  const [student] = await db.select({ verified: users.emailVerified }).from(users).where(eq(users.id, userId));
  if (!student?.verified) return { outcome: "unconfirmed" };

  const attempt = await tryInvite(userId, input);
  if (attempt.outcome !== "found") return attempt;

  // Idempotent and safe under concurrency: one row per (class, student) (CA2).
  const [created] = await db
    .insert(classMemberships)
    .values({ classId: attempt.classId, studentId: userId })
    .onConflictDoNothing()
    .returning({ id: classMemberships.id });
  const [row] = await db
    .select({ status: classMemberships.status, className: classes.name })
    .from(classMemberships)
    .innerJoin(classes, eq(classes.id, classMemberships.classId))
    .where(and(eq(classMemberships.classId, attempt.classId), eq(classMemberships.studentId, userId)));

  // R4, invariant 10: a removed student does not come back alone; the refusal
  // is the one for an unknown code, and counts as a failed entry.
  if (row.status === "removed") {
    await countFailure(userId);
    return { outcome: "refused" };
  }
  return { outcome: created ? "joined" : "alreadyMember", classId: attempt.classId, className: row.className };
}
