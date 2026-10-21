"use server";

import { getActor } from "@/server/auth/session";
import type { CopySeen } from "@/server/data/review/copy";
import { openCopy, type CopyOpenResult } from "@/server/review/copy";

// REV-02: called by the copy once shown (CopyOpened), never while rendering,
// so a prefetch logs nothing (E7 plan §1.6).

export async function recordCopyOpenedAction(seen: CopySeen): Promise<CopyOpenResult> {
  return openCopy(await getActor(), seen);
}
