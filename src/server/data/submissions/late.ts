import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * SUB-04 R2: late is strictly after the deadline, compared in SQL between two
 * instants: the time zone only says how the deadline was entered and is shown
 * (DEADLINE_TIME_ZONE), never how it is compared. Computed once, from the
 * first submission; a replacement neither sets nor clears it.
 */
export const isLate = (submittedAt: SQL | AnyPgColumn, deadline: SQL | AnyPgColumn) =>
  sql<boolean>`${submittedAt} > ${deadline}`;
