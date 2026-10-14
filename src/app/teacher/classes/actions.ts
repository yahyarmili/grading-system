"use server";

import { refresh } from "next/cache";
import { createTeacherClass, type CreateClassState } from "@/server/classes/classes";
import { getActor } from "@/server/auth/session";

// The data layer checks the actor: only a teacher creates a class, for themself (CLS-01).

export async function createClassAction(_previous: CreateClassState, form: FormData): Promise<CreateClassState> {
  const state = await createTeacherClass(await getActor(), { name: form.get("name") });
  if (state.status === "done") refresh();
  return state;
}
