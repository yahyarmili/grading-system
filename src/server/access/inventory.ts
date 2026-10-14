import type { Action, Resource } from "./matrix";

/**
 * Everything that reaches data, with its place in the access matrix.
 * tests/access-inventory.test.ts fails when a table, a server action, a route
 * handler or a data function exists without an entry here (AUTH-04): a new
 * resource cannot ship without its row in matrix.ts.
 */

/** Database tables → the matrix resources they hold, or why none (internal to authentication). */
export const TABLES: Record<string, readonly Resource[] | { internal: string }> = {
  users: ["studentAccount", "teacherAccount"],
  teacher_invitations: ["teacherInvitation"],
  sessions: { internal: "Better Auth sessions, read only from the session cookie (AUTH-02)" },
  accounts: { internal: "password hashes, never returned" },
  verifications: { internal: "Better Auth model, unused by our flows" },
  auth_tokens: { internal: "digests of one-time links (AUTH-01, 03, 05)" },
  auth_throttles: { internal: "attempt counters (AUTH-02 R2, AUTH-05 R3)" },
  security_events: { internal: "security log (DON-05), read by no screen in the MVP" },
  classes: ["class", "classInvite"],
  // Read for the student side of "class" until classMembership and classRoster (E2.3, E2.4).
  class_memberships: ["class"],
};

/**
 * Server entry points: exports of "use server" modules and route handlers,
 * keyed "<file>#<export>". Either the matrix cell they use, or the public
 * flow they serve outside the matrix (§5.1: visitor sign-up, sign-in, recovery).
 */
export type EntryPoint = { resource: Resource; action: Action } | { public: string };

export const ENTRY_POINTS: Record<string, EntryPoint> = {
  "src/app/(auth)/actions.ts#signUpAction": { public: "AUTH-01: student sign-up" },
  "src/app/(auth)/actions.ts#confirmEmailAction": { public: "AUTH-01: one-time link" },
  "src/app/(auth)/actions.ts#signInAction": { public: "AUTH-02: sign-in" },
  "src/app/(auth)/actions.ts#signOutAction": { public: "AUTH-02: closes the actor's own session" },
  "src/app/(auth)/actions.ts#forgotPasswordAction": { public: "AUTH-05: same answer for any email" },
  "src/app/(auth)/actions.ts#resendConfirmationAction": { public: "AUTH-05: same answer for any email" },
  "src/app/(auth)/actions.ts#resetPasswordAction": { public: "AUTH-05: one-time link" },
  "src/app/(auth)/actions.ts#acceptInvitationAction": { public: "AUTH-03: one-time link" },
  "src/app/admin/teachers/actions.ts#inviteTeacherAction": { resource: "teacherInvitation", action: "write" },
  "src/app/admin/teachers/actions.ts#reissueInvitationAction": { resource: "teacherInvitation", action: "write" },
  "src/app/admin/teachers/actions.ts#cancelInvitationAction": { resource: "teacherInvitation", action: "write" },
  "src/app/teacher/classes/actions.ts#createClassAction": { resource: "class", action: "write" },
  "src/app/teacher/classes/actions.ts#renewInviteAction": { resource: "classInvite", action: "write" },
  "src/app/teacher/classes/actions.ts#disableInviteAction": { resource: "classInvite", action: "write" },
};

/**
 * Exported functions of src/server/data/ that take no Actor, or take one
 * without calling authorize(), and why. Every other one calls authorize().
 */
export const UNGUARDED_DATA_EXPORTS: Record<string, string> = {
  "src/server/data/access.ts#ownedBy": "helper of authorize(): builds the ownership filter",
  "src/server/data/lifecycle.ts#closeDatabase": "scripts only",
  "src/server/data/auth/better-auth.ts#auth": "session engine: sign-in, sign-out, session reading",
  "src/server/data/auth/accounts.ts#registerStudent": "AUTH-01: public sign-up, visitors only",
  "src/server/data/auth/accounts.ts#confirmEmail": "one-time link: the token is the proof",
  "src/server/data/auth/accounts.ts#resetPassword": "one-time link: the token is the proof",
  "src/server/data/auth/accounts.ts#requestPasswordReset": "emails only the address owner; same answer for any email",
  "src/server/data/auth/accounts.ts#requestEmailVerification": "emails only the address owner; same answer for any email",
  "src/server/data/auth/invitations.ts#peekTeacherInvitation": "one-time link: the token is the proof",
  "src/server/data/auth/invitations.ts#acceptTeacherInvitation": "one-time link: the token is the proof",
  "src/server/data/auth/invitations.ts#createFirstAdmin": "local script only (Q2), never a screen",
  "src/server/data/auth/security-events.ts#recordSecurityEvent": "internal: writes the security log",
  "src/server/data/auth/throttle.ts#countAttempt": "internal: attempt counters",
  "src/server/data/auth/throttle.ts#isLocked": "internal: attempt counters",
  "src/server/data/auth/throttle.ts#recordFailure": "internal: attempt counters",
  "src/server/data/auth/throttle.ts#clearAttempts": "internal: attempt counters",
  "src/server/data/auth/tokens.ts#issueToken": "internal: one-time links, inside a guarded transaction",
  "src/server/data/auth/tokens.ts#consumeToken": "internal: one-time links, inside a guarded transaction",
  "src/server/data/classes/invites.ts#findClassByInvite": "the code or link is the proof; only behind the attempt limit (CLS-02 CA4)",
};
