import "server-only";
import { sql } from "drizzle-orm";
import { assignmentClasses, assignments, classMemberships, submissions } from "@/server/db/schema";

// The student side of an assignment's ownership, as SQL predicates on
// `assignments`. EXISTS, not joins: an assignment sent to two of the
// student's classes comes out once (SUB-01 R5).

/**
 * Received by derivation [D]: an active membership in one of the recipient
 * classes, whatever the date it was sent. What submitting requires (§5.5, 1).
 */
export const receivedBy = (userId: string) =>
  sql`exists (select 1 from ${assignmentClasses}
    join ${classMemberships} on ${classMemberships.classId} = ${assignmentClasses.classId}
    where ${assignmentClasses.assignmentId} = ${assignments.id}
      and ${classMemberships.studentId} = ${userId}
      and ${classMemberships.status} = 'active')`;

/**
 * What the student may read: received, or submitted to. A removed student
 * keeps, read only, the assignments they submitted to (SUB-01 R4).
 */
export const visibleTo = (userId: string) =>
  sql`(${receivedBy(userId)} or exists (select 1 from ${submissions}
    where ${submissions.assignmentId} = ${assignments.id} and ${submissions.studentId} = ${userId}))`;
