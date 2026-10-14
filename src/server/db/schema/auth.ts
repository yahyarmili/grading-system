import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Accounts, sessions and one-time links (E1, AUTH-01 to AUTH-05).
// users, sessions, accounts and verifications follow the Better Auth model
// (usePlural); their field names are the ones Better Auth expects.

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Invariant 1: one role per account, written by the server only. */
export const userRole = pgEnum("user_role", ["student", "teacher", "admin"]);

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Normalised: trimmed and lower case (checked below). */
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    /** Required by Better Auth; derived from firstName and lastName. */
    name: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    role: userRole().notNull(),
    /** Required by Better Auth; unused. */
    image: text(),
    ...timestamps,
  },
  (t) => [check("users_email_normalised", sql`${t.email} = lower(btrim(${t.email}))`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    token: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/** Only the "credential" provider is used: password holds the scrypt hash. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text().notNull(),
    accountId: text().notNull(),
    password: text(),
    // OAuth columns required by the Better Auth model; unused (no social sign-in).
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    ...timestamps,
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId),
  ],
);

/** Required by Better Auth; our one-time links use auth_tokens instead. */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** AUTH-03: the account is created only when the teacher accepts. State is derived. */
export const teacherInvitations = pgTable(
  "teacher_invitations",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    revokedAt: timestamp({ withTimezone: true }),
    revokedById: uuid().references(() => users.id),
    acceptedAt: timestamp({ withTimezone: true }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check("teacher_invitations_email_normalised", sql`${t.email} = lower(btrim(${t.email}))`),
    // At most one invitation still open per email.
    uniqueIndex("teacher_invitations_open_email_idx")
      .on(t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  ],
);

export const authTokenPurpose = pgEnum("auth_token_purpose", [
  "email_verification",
  "password_reset",
  "teacher_invitation",
]);

/** NFR-SEC-03: one-time links, stored as a SHA-256 digest, never in clear. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    purpose: authTokenPurpose().notNull(),
    tokenHash: text().notNull().unique("auth_tokens_token_hash_unique"),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    invitationId: uuid().references(() => teacherInvitations.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // An invitation token points to an invitation; the others to an account.
    check(
      "auth_tokens_target",
      sql`(${t.purpose} = 'teacher_invitation') = (${t.invitationId} is not null and ${t.userId} is null)
        and (${t.userId} is not null or ${t.invitationId} is not null)`,
    ),
    index("auth_tokens_user_id_idx").on(t.userId),
    index("auth_tokens_invitation_id_idx").on(t.invitationId),
  ],
);

/** Delays after repeated attempts, in the database (memory does not survive serverless). */
export const authThrottles = pgTable("auth_throttles", {
  /** Digest of scope and value (email, IP): no personal data in clear. */
  key: text().primaryKey(),
  failures: integer().notNull().default(0),
  windowStartedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp({ withTimezone: true }),
});

export const securityEventType = pgEnum("security_event_type", [
  "sign_in_succeeded",
  "sign_in_failed",
  "sign_in_locked",
  "signed_out",
  "email_verified",
  "password_reset",
  "admin_created",
  "invitation_created",
  "invitation_reissued",
  "invitation_revoked",
  "invitation_accepted",
  "access_denied",
  // E2, CLS-02
  "class_invite_renewed",
  "class_invite_disabled",
]);

/** NFR-DON-05: security log, separate from the review log. No email, secret or content. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: securityEventType().notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Target of the action (account, invitation…), without foreign key: the log outlives it. */
    subjectId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_events_created_at_idx").on(t.createdAt)],
);
