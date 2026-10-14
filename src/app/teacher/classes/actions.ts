"use server";

import { refresh } from "next/cache";
import { createTeacherClass, type CreateClassState } from "@/server/classes/classes";
import { disableInvite, renewInvite, type InviteActionResult } from "@/server/classes/invites";
import { getActor } from "@/server/auth/session";

// Each action reads the actor itself: the data layer acts only on the
// teacher's own classes, whatever the screen shows (CLS-01, CLS-02).

export async function createClassAction(_previous: CreateClassState, form: FormData): Promise<CreateClassState> {
  const state = await createTeacherClass(await getActor(), { name: form.get("name") });
  if (state.status === "done") refresh();
  return state;
}

export async function renewInviteAction(classId: string): Promise<InviteActionResult> {
  const result = await renewInvite(await getActor(), classId);
  refresh();
  return result;
}

export async function disableInviteAction(classId: string): Promise<InviteActionResult> {
  const result = await disableInvite(await getActor(), classId);
  refresh();
  return result;
}
