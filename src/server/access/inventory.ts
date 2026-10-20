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
  class_memberships: ["class", "classMembership", "classRoster"],
  class_join_intents: { internal: "digests of class links opened before confirmation (CLS-03 R3), used once confirmed" },
  assignments: ["assignment"],
  assignment_classes: ["assignmentRecipients"],
  // The student writes their own (submits, replaces) and reads only its status
  // in the closed list; never a version (A3). The owner teacher reads (E7).
  submissions: ["submission", "ownSubmissionStatus"],
  submission_versions: ["submission"],
  notice_acknowledgements: ["noticeAcknowledgement"],
  // Added by the evaluation service alone (system.ts), never changed (0011);
  // the owner teacher reads the proposal in force.
  evaluation_runs: ["aiProposal"],
  ai_proposals: ["aiProposal"],
};

/**
 * Server entry points: exports of "use server" modules and route handlers,
 * keyed "<file>#<export>". Either the matrix cell they use, or the public
 * flow they serve outside the matrix (§5.1: visitor sign-up, sign-in, recovery).
 * `system`: called by the platform with a secret, never by a user (E6: the cron).
 */
export type EntryPoint = { resource: Resource; action: Action } | { public: string } | { system: string };

export const ENTRY_POINTS: Record<string, EntryPoint> = {
  "src/app/(auth)/actions.ts#signUpAction": { public: "AUTH-01: student sign-up" },
  "src/app/(auth)/actions.ts#confirmEmailAction": { public: "AUTH-01: one-time link" },
  "src/app/(auth)/actions.ts#signInAction": { public: "AUTH-02: sign-in" },
  "src/app/(auth)/actions.ts#signOutAction": { public: "AUTH-02: closes the actor's own session" },
  "src/app/(auth)/actions.ts#forgotPasswordAction": { public: "AUTH-05: same answer for any email" },
  "src/app/(auth)/actions.ts#resendConfirmationAction": { public: "AUTH-05: same answer for any email" },
  "src/app/(auth)/actions.ts#resetPasswordAction": { public: "AUTH-05: one-time link" },
  "src/app/(auth)/actions.ts#acceptInvitationAction": { public: "AUTH-03: one-time link" },
  "src/app/(auth)/actions.ts#rememberInviteAction": { public: "CLS-03 R3: keeps a class link in a cookie; joins nothing" },
  "src/app/(auth)/actions.ts#joinByLinkAction": { resource: "classMembership", action: "write" },
  "src/app/student/classes/actions.ts#joinClassByCodeAction": { resource: "classMembership", action: "write" },
  "src/app/admin/teachers/actions.ts#inviteTeacherAction": { resource: "teacherInvitation", action: "write" },
  "src/app/admin/teachers/actions.ts#reissueInvitationAction": { resource: "teacherInvitation", action: "write" },
  "src/app/admin/teachers/actions.ts#cancelInvitationAction": { resource: "teacherInvitation", action: "write" },
  "src/app/teacher/classes/actions.ts#createClassAction": { resource: "class", action: "write" },
  "src/app/teacher/classes/actions.ts#renewInviteAction": { resource: "classInvite", action: "write" },
  "src/app/teacher/classes/actions.ts#disableInviteAction": { resource: "classInvite", action: "write" },
  "src/app/teacher/classes/actions.ts#removeStudentAction": { resource: "classRoster", action: "write" },
  "src/app/teacher/classes/actions.ts#readmitStudentAction": { resource: "classRoster", action: "write" },
  "src/app/teacher/assignments/actions.ts#createAssignmentAction": { resource: "assignment", action: "write" },
  "src/app/teacher/assignments/actions.ts#editAssignmentAction": { resource: "assignment", action: "write" },
  "src/app/teacher/assignments/actions.ts#deleteAssignmentAction": { resource: "assignment", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#submitTextAction": { resource: "submission", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#replaceTextAction": { resource: "submission", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#acknowledgeNoticeAction": { resource: "noticeAcknowledgement", action: "write" },
  "src/app/api/cron/evaluation-sweep/route.ts#GET": {
    system: "E6, PRC-01 CA4: Vercel's cron, with CRON_SECRET; releases stuck evaluations and starts again the stale received ones, answers counts only",
  },
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
  "src/server/data/auth/security-events.ts#countAiRequestsToday":
    "scripts only (ai:evaluate, ai:trial): counts today's ai_request_sent rows, reads none, for the daily guard of the commands (AI_DAILY_REQUEST_LIMIT)",
  "src/server/data/auth/throttle.ts#countAttempt": "internal: attempt counters",
  "src/server/data/auth/throttle.ts#isLocked": "internal: attempt counters",
  "src/server/data/auth/throttle.ts#recordFailure": "internal: attempt counters",
  "src/server/data/auth/throttle.ts#clearAttempts": "internal: attempt counters",
  "src/server/data/auth/tokens.ts#issueToken": "internal: one-time links, inside a guarded transaction",
  "src/server/data/auth/tokens.ts#consumeToken": "internal: one-time links, inside a guarded transaction",
  "src/server/data/classes/invites.ts#findClassByInvite": "the code or link is the proof; only behind the attempt limit (CLS-02 CA4)",
  "src/server/data/classes/join-intents.ts#recordJoinIntent": "internal: inside the public sign-up transaction (CLS-03 R3)",
  "src/server/data/classes/join-intents.ts#joinFromIntents": "internal: inside the one-time link transaction that confirms the address (CLS-03 R3)",
  "src/server/data/assignments/received.ts#memberOfRecipients": "helper of ownedBy(): the SQL predicate of an active member of a recipient class",
  "src/server/data/assignments/received.ts#receivedBy": "helper of ownedBy(): the SQL predicate of a received assignment",
  "src/server/data/assignments/received.ts#visibleTo": "helper of ownedBy(): the SQL predicate of an assignment the student may read",
  "src/server/data/notices/notices.ts#acknowledgedNotice": "helper of a guarded write: the SQL predicate of a notice read",
  "src/server/data/submissions/late.ts#isLate": "helper of a guarded write: the SQL comparison of lateness (SUB-04 R2)",
  "src/server/data/submissions/submissions.ts#replacementOpen": "helper of a guarded write: the SQL predicate of transition 11 (SUB-05)",
  "src/server/data/submissions/transitions.ts#insertReceived": "internal: transition 1, inside a submission transaction that has authorized the actor",
  "src/server/data/submissions/transitions.ts#applyTransition": "internal: the one status writer (§5.5), inside a transaction that has authorized the actor, or in the system processing of the evaluation (transitions 2, 5, 6 and 7)",
  "src/server/data/evaluation/system.ts#readEvaluationInput": "system processing (§5.5, transitions 2 and 5): the AI's whitelist of a submission, read for the evaluation service only, never a screen",
  "src/server/data/evaluation/system.ts#claimForEvaluation": "system processing (§5.5, transition 2; 6 and 7 for the teacher's retry and relaunch, authorized beforehand by retryEvaluation and relaunchEvaluation, E6.3), called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#stillEvaluating": "system processing (§5.5): whether a claim still holds before a new attempt, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#recordEvaluation": "system processing (§5.5, transition 5): adds the run and the proposal, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#listReceived": "system processing (§5.5): identifiers of the received submissions of an assignment, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#releaseEvaluation": "system processing (§5.5, transition 5): frees a claim to evaluation_failed, guarded by its token (a run frees its own claim only): a result refused twice, the breaker, or the workflow's releaseStep; called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#releaseStuckEvaluations": "system processing (§5.5, transition 5, PRC-02 R1): submissions evaluating for too long end evaluation_failed, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#listStaleReceived": "system processing (E6, the sweep): identifiers and active version of the text submissions still received after the grace, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#readAiGuardCounts": "system processing (E6, EXP-02): token sums of this month's Anthropic runs and the count of access failures, counts only, called only by src/server/evaluation/",
  "src/server/data/evaluation/measures.ts#readEvaluationMeasures":
    "scripts only (ai:report, E6.4, EXP-01): runs and copies by assignment, outcomes, attempts, durations, token sums and states; no name, email, text or proposal",
  "src/server/data/evaluation/system.ts#claimAiAlert": "system processing (E6, EXP-02): records the cost cap or breaker alert once per period and gives the administrators' addresses to email, called only by src/server/evaluation/",
};

/**
 * Every file of scripts/, and why it exists: commands run by hand inside the
 * container, outside any screen and any session. They reach data through
 * src/server/data/ only, with the exports listed above.
 */
export const SCRIPTS: Record<string, string> = {
  "scripts/create-admin.ts": "npm run admin:create: the first administrator (Q2), local script only, never a screen",
  "scripts/evaluate.ts":
    "npm run ai:evaluate: evaluates one or all received submissions of an assignment (transitions 2 and 5), by hand beside the automatic evaluation of E6 (same claim, cost cap and breaker); the simulator unless --provider anthropic",
  "scripts/evaluation-report.ts":
    "npm run ai:report: the evaluation report by assignment (EXP-01, E6.4): delays, attempts, failure rate, AI usage and estimated cost; reads only, no identity or content",
  "scripts/ai-trial.ts":
    "npm run ai:trial: connection trial and trial sets (E5.7, E5.14) on fictitious texts; stores nothing but the security log; the simulator unless --provider anthropic",
};
