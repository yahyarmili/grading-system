import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { StudentResult } from "@/lib/student-result";
import { AccessDeniedError } from "@/server/access/errors";
import type { Actor } from "@/server/access/actor";
import { getStudentAssignment, listStudentAssignments } from "@/server/data/assignments/assignments";
import { getPublishedResult } from "@/server/data/results/student";

// PUB-01 CA3, PUB-02 R2 (E8 plan §5, E8.7): a student page the router or the
// browser shows again (back, forward) is checked with the server first
// (src/components/freshness-guard.tsx). The token is a digest of what the
// page shows, from the page's own reader: it tells nothing the page does not
// already show, and each check answers a boolean only, the same for a
// withdrawn, changed, missing or another person's resource.

/** An opaque digest of what a student page shows. */
export function viewToken(view: unknown): string {
  return createHash("sha256").update(JSON.stringify(view)).digest("base64url");
}

/** An opaque digest of the result as published. */
export const resultToken = (result: StudentResult) => viewToken(result);

const token = z.string().min(1).max(100);
const forAssignment = z.object({ assignmentId: z.uuid(), token });

/** True when the reader still gives what the token was made of; false for anything else, a role without the right included. */
async function same(read: () => Promise<unknown>, expected: string): Promise<boolean> {
  try {
    const view = await read();
    return view !== null && view !== undefined && viewToken(view) === expected;
  } catch (error) {
    if (error instanceof AccessDeniedError) return false;
    throw error;
  }
}

/** Whether the page's result is still the one published. */
export async function checkResultFreshness(actor: Actor, raw: unknown): Promise<boolean> {
  const parsed = forAssignment.safeParse(raw);
  if (!parsed.success) return false;
  return same(() => getPublishedResult(actor, parsed.data.assignmentId), parsed.data.token);
}

/** Whether My assignments still shows what it showed (each state, each "See your result"). */
export async function checkListFreshness(actor: Actor, raw: unknown): Promise<boolean> {
  const parsed = z.object({ token }).safeParse(raw);
  if (!parsed.success) return false;
  return same(() => listStudentAssignments(actor), parsed.data.token);
}

/** Whether the assignment's page still shows the same assignment and state. */
export async function checkAssignmentFreshness(actor: Actor, raw: unknown): Promise<boolean> {
  const parsed = forAssignment.safeParse(raw);
  if (!parsed.success) return false;
  return same(() => getStudentAssignment(actor, parsed.data.assignmentId), parsed.data.token);
}
