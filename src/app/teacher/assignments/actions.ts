"use server";

import { refresh } from "next/cache";
import { createTeacherAssignment, type CreateAssignmentState } from "@/server/assignments/assignments";
import { getActor } from "@/server/auth/session";

// Each action reads the actor itself: the data layer acts only on the
// teacher's own assignments and classes, whatever the form sends (ASG-01).

export async function createAssignmentAction(
  _previous: CreateAssignmentState,
  form: FormData,
): Promise<CreateAssignmentState> {
  const field = (name: string) => form.get(name) ?? undefined;
  const state = await createTeacherAssignment(await getActor(), {
    title: field("title"),
    subject: field("subject"),
    level: field("level"),
    language: field("language"),
    deadline: field("deadline"),
    instructions: field("instructions"),
    classIds: form.getAll("classIds"),
  });
  if (state.status === "done") refresh();
  return state;
}
