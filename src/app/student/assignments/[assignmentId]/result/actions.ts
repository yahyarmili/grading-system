"use server";

import { getActor } from "@/server/auth/session";
import { checkResultFreshness } from "@/server/results/freshness";

// PUB-01 CA3 (E8.3): the result shown again is checked first. A boolean only.

export async function checkFreshnessAction(assignmentId: string, token: string): Promise<boolean> {
  return checkResultFreshness(await getActor(), { assignmentId, token });
}
