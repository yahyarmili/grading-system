import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { assignmentClasses, assignments, classMemberships, submissions } from "@/server/db/schema";

// The student side of an assignment's ownership, as SQL predicates. EXISTS,
// not joins: an assignment sent to two of the student's classes comes out
// once (SUB-01 R5).

/**
 * An active membership of the student in one of the classes the assignment
 * (`assignmentId`, a column or value) was sent to, whatever the date it was sent.
 */
export const memberOfRecipients = (userId: string, assignmentId: AnyPgColumn | SQL) =>
  sql`exists (select 1 from ${assignmentClasses}
    join ${classMemberships} on ${classMemberships.classId} = ${assignmentClasses.classId}
    where ${assignmentClasses.assignmentId} = ${assignmentId}
      and ${classMemberships.studentId} = ${userId}
      and ${classMemberships.status} = 'active')`;

/**
 * Received by derivation [D], on `assignments`: what submitting and replacing
 * require (§5.5, 1 and 11).
 */
export const receivedBy = (userId: string) => memberOfRecipients(userId, assignments.id);

/**
 * What the student may read: received, or submitted to. A removed student
 * keeps, read only, the assignments they submitted to (SUB-01 R4).
 */
export const visibleTo = (userId: string) =>
  sql`(${receivedBy(userId)} or exists (select 1 from ${submissions}
    where ${submissions.assignmentId} = ${assignments.id} and ${submissions.studentId} = ${userId}))`;
