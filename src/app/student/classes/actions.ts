"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/auth/session";
import { joinWithCode, type JoinState } from "@/server/classes/join";

// CLS-03: the data layer lets a student join for themself only.

export async function joinClassByCodeAction(_previous: JoinState, form: FormData): Promise<JoinState> {
  const state = await joinWithCode(await getActor(), { code: form.get("code") });
  if (state.status === "joined") refresh();
  return state;
}
