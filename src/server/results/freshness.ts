import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { StudentResult } from "@/lib/student-result";
import { AccessDeniedError } from "@/server/access/errors";
import type { Actor } from "@/server/access/actor";
import { getPublishedResult } from "@/server/data/results/student";

// PUB-01 CA3, PUB-02 R2 (E8 plan §5): a result page the router or the
// browser shows again (back, forward) is checked with the server first. The
// token is a digest of the published result the page shows: it tells nothing
// the page does not already show, and the check answers a boolean only,
// the same for a withdrawn, changed, missing or another person's result.

/** An opaque digest of the result as published. */
export function resultToken(result: StudentResult): string {
  return createHash("sha256").update(JSON.stringify(result)).digest("base64url");
}

const input = z.object({ assignmentId: z.uuid(), token: z.string().min(1).max(100) });

/** Whether the page's result is still the one published; false for anything else. */
export async function checkResultFreshness(actor: Actor, raw: unknown): Promise<boolean> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return false;
  try {
    const result = await getPublishedResult(actor, parsed.data.assignmentId);
    return result !== null && resultToken(result) === parsed.data.token;
  } catch (error) {
    if (error instanceof AccessDeniedError) return false;
    throw error;
  }
}
