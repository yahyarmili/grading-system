"use server";

import { getActor } from "@/server/auth/session";
import { checkListFreshness } from "@/server/results/freshness";

// PUB-01 CA3, PUB-02 R2 (E8.7): My assignments shown again is checked first. A boolean only.

export async function checkListFreshnessAction(token: string): Promise<boolean> {
  return checkListFreshness(await getActor(), { token });
}
