import "server-only";
import { and, inArray } from "drizzle-orm";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { assignmentClasses, assignments, classes } from "@/server/db/schema";
import type { AssignmentLanguage, AssignmentLevel } from "@/lib/assignment";
import { ownedBy } from "../access";

// ASG-01: an assignment and the classes it is sent to (rows "assignment" and
// "assignmentRecipients" of the matrix). The teacher owns both; the database
// also refuses another teacher's class (composite keys, invariant 3).

export type NewAssignment = {
  title: string;
  subject: string;
  level: AssignmentLevel;
  language: AssignmentLanguage;
  deadline: Date;
  instructions: string | null;
  classIds: string[];
};

export type CreateAssignmentResult = { ok: true; assignmentId: string } | { ok: false; reason: "class_not_found" };

/**
 * R3: one transaction, at least one class, all of them the teacher's own.
 * A class that is missing or another teacher's refuses the whole creation:
 * nothing is created, not even partly.
 */
export async function createAssignment(actor: Actor, input: NewAssignment): Promise<CreateAssignmentResult> {
  const { userId } = authorize(actor, "assignment", "write");
  const recipients = authorize(actor, "assignmentRecipients", "write");
  const classIds = [...new Set(input.classIds)];
  if (classIds.length === 0) return { ok: false, reason: "class_not_found" };

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: classes.id })
      .from(classes)
      .where(and(inArray(classes.id, classIds), ownedBy(recipients, { teacher: classes.teacherId })));
    if (owned.length !== classIds.length) return { ok: false, reason: "class_not_found" } as const;

    const [created] = await tx
      .insert(assignments)
      .values({
        teacherId: userId,
        title: input.title,
        subject: input.subject,
        level: input.level,
        language: input.language,
        deadline: input.deadline,
        instructions: input.instructions,
      })
      .returning({ id: assignments.id });
    await tx
      .insert(assignmentClasses)
      .values(classIds.map((classId) => ({ assignmentId: created.id, classId, teacherId: userId })));
    return { ok: true, assignmentId: created.id } as const;
  });
}
