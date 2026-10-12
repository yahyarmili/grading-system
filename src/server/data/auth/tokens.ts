import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { generateToken, hashToken } from "@/server/auth/tokens";
import type { db } from "@/server/db/client";
import { authTokens } from "@/server/db/schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Purpose = (typeof authTokens.$inferInsert)["purpose"];
type Target = { userId: string } | { invitationId: string };

function targetCondition(target: Target) {
  return "userId" in target
    ? eq(authTokens.userId, target.userId)
    : eq(authTokens.invitationId, target.invitationId);
}

/**
 * Issues a one-time link token and revokes the earlier ones with the same
 * purpose and target: only the latest link works (AUTH-05 R2, AUTH-03 CA3).
 * Returns the token in clear, to be sent once; only its digest is stored.
 */
export async function issueToken(
  tx: Tx,
  purpose: Purpose,
  target: Target,
  ttlSeconds: number,
): Promise<string> {
  await tx
    .update(authTokens)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(authTokens.purpose, purpose),
        targetCondition(target),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
      ),
    );
  const { token, tokenHash } = generateToken();
  await tx.insert(authTokens).values({
    purpose,
    tokenHash,
    ...target,
    expiresAt: sql`now() + make_interval(secs => ${ttlSeconds})`,
  });
  return token;
}

/**
 * Uses a token once. Unknown, expired, used and revoked tokens all give null.
 * A single UPDATE: two concurrent uses cannot both succeed.
 */
export async function consumeToken(
  tx: Tx,
  purpose: Purpose,
  token: string,
): Promise<{ userId: string | null; invitationId: string | null } | null> {
  const [row] = await tx
    .update(authTokens)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
        gt(authTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: authTokens.userId, invitationId: authTokens.invitationId });
  return row ?? null;
}
