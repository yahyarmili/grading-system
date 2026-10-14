"use server";

import { refresh } from "next/cache";
import {
  createTeacherAssignment,
  deleteTeacherAssignment,
  editTeacherAssignment,
  type CreateAssignmentState,
  type DeleteAssignmentResult,
  type EditAssignmentState,
} from "@/server/assignments/assignments";
import { getActor } from "@/server/auth/session";

// Each action reads the actor itself: the data layer acts only on the
// teacher's own assignments and classes, whatever the form sends (ASG-01, ASG-03).

const reader = (form: FormData) => (name: string) => form.get(name) ?? undefined;

export async function createAssignmentAction(
  _previous: CreateAssignmentState,
  form: FormData,
): Promise<CreateAssignmentState> {
  const field = reader(form);
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

/** A locked assignment's form has no task fields: they stay undefined (ASG-03 R2). */
export async function editAssignmentAction(
  _previous: EditAssignmentState,
  form: FormData,
): Promise<EditAssignmentState> {
  const field = reader(form);
  const state = await editTeacherAssignment(await getActor(), field("assignmentId"), {
    title: field("title"),
    level: field("level"),
    subject: field("subject"),
    language: field("language"),
    deadline: field("deadline"),
    instructions: field("instructions"),
  });
  // Also after a refusal: the page then shows the lock or the deletion.
  if (state.status !== "invalid") refresh();
  return state;
}

export async function deleteAssignmentAction(assignmentId: string): Promise<DeleteAssignmentResult> {
  const result = await deleteTeacherAssignment(await getActor(), assignmentId);
  // A refusal leaves the page as it is: its message stays next to the button.
  if (result.ok) refresh();
  return result;
}
