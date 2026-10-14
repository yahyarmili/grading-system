import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

// Classes and memberships (E2, CLS-01 to CLS-04).

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * One teacher per class (CLS-01 R1). The invitation link and code are never
 * stored (NFR-SEC-03): they are derived from the nonce with a server key
 * (src/server/classes/invite-codes.ts); only their digests are kept, for lookup.
 */
export const classes = pgTable(
  "classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    teacherId: uuid()
      .notNull()
      .references(() => users.id),
    /** Trimmed, inner spaces collapsed (checked below and by the form schema). */
    name: text().notNull(),
    inviteNonce: text().notNull(),
    inviteLinkDigest: text().notNull().unique("classes_invite_link_digest_unique"),
    inviteCodeDigest: text().notNull().unique("classes_invite_code_digest_unique"),
    inviteIssuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Null while the link and code work (CLS-02 R3). */
    inviteDisabledAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("classes_name_trimmed", sql`${t.name} = btrim(${t.name}) and ${t.name} <> ''`),
    // CLS-01 R2: unique per teacher, whatever the case; two teachers may share a name.
    uniqueIndex("classes_teacher_name_idx").on(t.teacherId, sql`lower(${t.name})`),
  ],
);

/** CLS-04: a removed student stays listed, and cannot join again alone (invariant 10). */
export const membershipStatus = pgEnum("membership_status", ["active", "removed"]);

/** A student in a class; a student may be in several classes (CLS-03 R2). */
export const classMemberships = pgTable(
  "class_memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    classId: uuid()
      .notNull()
      .references(() => classes.id),
    studentId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: membershipStatus().notNull().default("active"),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // Joining twice creates no duplicate (CLS-03 CA2).
    uniqueIndex("class_memberships_class_student_idx").on(t.classId, t.studentId),
    index("class_memberships_student_id_idx").on(t.studentId),
    check("class_memberships_removed_at", sql`(${t.status} = 'removed') = (${t.removedAt} is not null)`),
  ],
);
