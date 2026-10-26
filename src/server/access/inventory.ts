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
  // The student writes their own (submits, replaces), reads its status in the
  // closed list, and the text of its active version (SUB-01 R2, E8.3); never
  // an earlier version or the internal state. The owner teacher reads (E7).
  submissions: ["submission", "ownSubmissionStatus"],
  submission_versions: ["submission"],
  notice_acknowledgements: ["noticeAcknowledgement"],
  // Added by the evaluation service alone (system.ts), never changed (0011);
  // the owner teacher reads the proposal in force.
  evaluation_runs: ["aiProposal"],
  ai_proposals: ["aiProposal"],
  // E7: written by src/server/data/review/record.ts alone, the evaluation with
  // the log entries of its changes (0017); the owner teacher reads both.
  // E8: once published, the same row is the published evaluation (frozen outside To review, 0019).
  teacher_evaluations: ["unpublishedEvaluation", "publishedEvaluation"],
  review_journal_entries: ["reviewLog"],
  // E9 (spec 0011): the student's draft and its pages before sending; once
  // confirmed, the pages of a version follow "Submission and images", read by
  // the image route alone (rule 2). The reading runs hold no student data:
  // written by the reading service, read by no screen (the guards count them).
  submission_drafts: ["draft"],
  submission_pages: ["draft", "submission"],
  reading_runs: { internal: "reading runs (QUA-02), no content: written by the reading service, counted by the read caps and the AI guard, read by no screen" },
  submission_transcriptions: ["transcription"],
  transcription_changes: ["transcription"],
};

/**
 * Server entry points: exports of "use server" modules and route handlers,
 * keyed "<file>#<export>". Either the matrix cell they use, or the public
 * flow they serve outside the matrix (§5.1: visitor sign-up, sign-in, recovery).
 * `system`: called by the platform with a secret, never by a user (E6: the cron).
 * Besides its cell, an entry point may declare `also`, the other cells the
 * data functions it calls authorize, and `systemCalls`, the functions of
 * UNGUARDED_DATA_EXPORTS it reaches without the actor (each with its reason
 * there), so that what it does beyond its cell is read here too.
 */
export type Cell = { resource: Resource; action: Action };
export type EntryPoint =
  | (Cell & { also?: readonly Cell[]; systemCalls?: readonly string[] })
  | { public: string }
  | { system: string };

/**
 * E7 plan §1.7 ([D, 2026-10-20]: the Vercel cron does not run on the
 * preview): opening the list or a copy runs the evaluation sweep of the cron
 * (src/server/evaluation/sweep.ts), system processing without the actor; the
 * submissions it starts again go to Workflows (WORKFLOW_FLOW below).
 * tests/access-inventory.test.ts: an action calls sweepEvaluations exactly
 * when it declares these.
 */
export const SWEEP_SYSTEM_CALLS = [
  "src/server/data/evaluation/system.ts#releaseStuckEvaluations",
  "src/server/data/evaluation/system.ts#takeStaleReceived",
  "src/server/data/submissions/drafts.ts#deleteStaleDrafts",
] as const;

/**
 * The route Workflows' queue delivers to (E6.6). @vercel/queue's handler
 * checks no signature of the delivery (read in its source on 2026-10-20). On
 * Vercel, the route's queue trigger (generated config.json) makes it private,
 * invoked by the queue only (https://vercel.com/docs/queues/quickstart, read
 * on 2026-10-20; documented, not tested); locally (Local World) anyone on the
 * machine may post to it. So the step trusts nothing of the message: an
 * automatic claim needs the received version, a retry or relaunch the request
 * the owner teacher stored (system.ts); a forged message evaluates nothing
 * that was not due, and never carries the text (read from the database).
 */
const WORKFLOW_FLOW =
  "Workflows' deliveries of the evaluation workflow and its steps (PRC-01): identifiers only; a retry or relaunch claims only with the teacher's stored request";

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
  "src/app/teacher/actions.ts#acknowledgeTeacherNoticeAction": { resource: "noticeAcknowledgement", action: "write" },
  "src/app/teacher/assignments/actions.ts#createAssignmentAction": { resource: "assignment", action: "write" },
  "src/app/teacher/assignments/actions.ts#editAssignmentAction": { resource: "assignment", action: "write" },
  "src/app/teacher/assignments/actions.ts#deleteAssignmentAction": { resource: "assignment", action: "write" },
  // REV-01: "list opened" (REV-04) on the owner's assignment, its stamp read by the same check; then the sweep, after the response (after()).
  "src/app/teacher/assignments/[assignmentId]/actions.ts#recordListOpenedAction": {
    resource: "submission",
    action: "read",
    systemCalls: SWEEP_SYSTEM_CALLS,
  },
  "src/app/teacher/assignments/[assignmentId]/actions.ts#retryEvaluationAction": { resource: "unpublishedEvaluation", action: "write" },
  "src/app/teacher/assignments/[assignmentId]/actions.ts#relaunchEvaluationAction": { resource: "unpublishedEvaluation", action: "write" },
  // REV-02: "copy opened" (REV-04) on the owner's copy; then the sweep, after the response (after()), on the owner's copy only.
  "src/app/teacher/assignments/[assignmentId]/students/[studentId]/actions.ts#recordCopyOpenedAction": {
    resource: "submission",
    action: "read",
    systemCalls: SWEEP_SYSTEM_CALLS,
  },
  // E8.1: a change of a Published copy also writes the published evaluation (it leaves the student's view, Q8).
  "src/app/teacher/assignments/[assignmentId]/students/[studentId]/actions.ts#saveEvaluationAction": {
    resource: "unpublishedEvaluation",
    action: "write",
    also: [{ resource: "publishedEvaluation", action: "write" }],
  },
  "src/app/teacher/assignments/[assignmentId]/students/[studentId]/actions.ts#validateEvaluationAction": {
    resource: "unpublishedEvaluation",
    action: "write",
    also: [{ resource: "publishedEvaluation", action: "write" }],
  },
  "src/app/teacher/assignments/[assignmentId]/students/[studentId]/actions.ts#validateAndPublishAction": {
    resource: "unpublishedEvaluation",
    action: "write",
    also: [{ resource: "publishedEvaluation", action: "write" }],
  },
  "src/app/teacher/assignments/[assignmentId]/students/[studentId]/actions.ts#publishEvaluationAction": { resource: "unpublishedEvaluation", action: "write" },
  "src/app/teacher/assignments/[assignmentId]/students/[studentId]/actions.ts#withdrawPublicationAction": { resource: "publishedEvaluation", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#submitTextAction": { resource: "submission", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#replaceTextAction": { resource: "submission", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#acknowledgeNoticeAction": { resource: "noticeAcknowledgement", action: "write" },
  // E9 (spec 0011): the pages of the student's draft, read by the AI for their check, then confirmed.
  "src/app/student/assignments/[assignmentId]/actions.ts#readPageAction": { resource: "draft", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#reorderPagesAction": { resource: "draft", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#deletePageAction": { resource: "draft", action: "write" },
  "src/app/student/assignments/[assignmentId]/actions.ts#confirmImagesAction": {
    resource: "submission",
    action: "write",
    also: [
      { resource: "draft", action: "write" },
      { resource: "transcription", action: "write" },
    ],
  },
  "src/app/api/drafts/[assignmentId]/pages/route.ts#POST": { resource: "draft", action: "write" },
  // Rule 2: the one route that serves a page's JPEG; a student also reads their draft's pages through it.
  "src/app/api/pages/[pageId]/route.ts#GET": { resource: "submission", action: "read", also: [{ resource: "draft", action: "read" }] },
  // PUB-01 CA3 (E8.3): the result shown again is checked first; a boolean only.
  "src/app/student/assignments/[assignmentId]/result/actions.ts#checkFreshnessAction": { resource: "publishedEvaluation", action: "read" },
  // E8.7: My assignments and an assignment shown again are checked first too; a boolean only.
  "src/app/student/assignments/actions.ts#checkListFreshnessAction": {
    resource: "assignment",
    action: "read",
    also: [{ resource: "ownSubmissionStatus", action: "read" }],
  },
  "src/app/student/assignments/[assignmentId]/actions.ts#checkAssignmentFreshnessAction": {
    resource: "assignment",
    action: "read",
    also: [{ resource: "ownSubmissionStatus", action: "read" }],
  },
  "src/app/api/cron/evaluation-sweep/route.ts#GET": {
    system: "E6, PRC-01 CA4: Vercel's cron, with CRON_SECRET; releases stuck evaluations, starts again the stale received ones and deletes the drafts left for DRAFT_TTL_MS (E9), answers counts only",
  },
  // E6.6: generated by withWorkflow (git-ignored), checked by tests/access-inventory.test.ts.
  ...Object.fromEntries(
    ["POST", "GET", "HEAD", "OPTIONS"].map((method) => [
      `src/app/.well-known/workflow/v1/flow/route.js#${method}`,
      { system: WORKFLOW_FLOW },
    ]),
  ),
  ...Object.fromEntries(
    ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => [
      `src/app/.well-known/workflow/v1/webhook/[token]/route.js#${method}`,
      { system: "Workflows' webhooks, resumed by their token: the evaluation creates none (E6.6)" },
    ]),
  ),
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
    "scripts only (ai:evaluate, ai:trial, ai:read; ai:status prints it): counts today's ai_request_sent rows, reads none, for the daily guard of the commands (AI_DAILY_REQUEST_LIMIT)",
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
  "src/server/data/submissions/transitions.ts#applyTransition": "internal: the one status writer (§5.5), inside a transaction that has authorized the actor, or in the system processing of the evaluation (transitions 2 to 7)",
  "src/server/data/evaluation/system.ts#readEvaluationInput": "system processing (§5.5, transitions 2 and 5): the AI's whitelist of a submission, read for the evaluation service only, never a screen",
  "src/server/data/submissions/transitions.ts#recordEvaluationRequest": "internal: stores the teacher's request of a retry or relaunch (E6.6), inside the transaction of retryEvaluation or relaunchEvaluation, which authorized the actor",
  "src/server/data/submissions/transitions.ts#markTeacherStarted": "internal: the teacher's first act (E7), inside writeEvaluation, in a transaction that has authorized the actor and locked the submission row",
  "src/server/data/review/record.ts#appendJournal": "internal: adds review log entries (REV-04), inside a transaction that has authorized the actor (or the system's, for an abandoned retry)",
  "src/server/data/review/record.ts#writeEvaluation": "internal: the one writer of the teacher's evaluation, with its log entries (REV-03, REV-04), inside a transaction that has authorized the actor and locked the submission row",
  "src/server/data/review/copy.ts#lockCopy": "internal: locks the owner's submission row, filtered by the grant of a function that has authorized the actor (saveEvaluation, validateEvaluation, publishEvaluation, withdrawPublication)",
  "src/server/data/review/copy.ts#lockedRefusal": "pure: the guards of a locked copy (notice, version, proposal), for the functions that locked it",
  "src/server/data/review/copy.ts#editLocked": "internal: one save of the form on a copy locked by a function that has authorized the actor (saveEvaluation, validateEvaluation); authorizes the published evaluation's write itself when it changes one (Q8)",
  "src/server/data/evaluation/proposals.ts#proposalFromRow": "pure mapping of a proposal row read by a function that has authorized the actor (getCurrentProposal, getCopy)",
  "src/server/data/submissions/transitions.ts#markRestarted": "internal: dates the restart of received submissions, inside the sweep's transaction (E6.6, system processing)",
  "src/server/data/submissions/transitions.ts#markTranscribing": "internal: dates a transcribing submission again after each page read by the pipeline, inside its transaction, guarded by the claim (E9, system processing)",
  "src/server/data/evaluation/system.ts#claimForTranscription": "system processing (§5.5, transition 2; 4 for the teacher's retry of a transcription_failed copy, authorized beforehand by retryEvaluation and claimed with the request it stored): an image version the student did not check, called only by src/server/evaluation/ (E9)",
  "src/server/data/evaluation/system.ts#readTranscriptionPage": "system processing (E9): the JPEG of a page of the claimed version, for the reader only, while the claim holds; never a screen nor a list (rule 2); called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#recordTranscriptionPage": "system processing (E9): adds the pipeline's reading run and writes the page's reading while the claim holds; called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#finishTranscription": "system processing (§5.5, transition 3, E9): assembles the unchecked text once, or ends the transcription; called only by src/server/evaluation/",
  "src/server/data/submissions/transitions.ts#clearEvaluationRequest": "internal: drops a teacher's request that found no evaluation place (E7.6), inside abandonEvaluationRequest's transaction (system processing)",
  "src/server/data/evaluation/system.ts#claimForEvaluation": "system processing (§5.5, transition 2; 6 and 7 for the teacher's retry and relaunch, authorized beforehand by retryEvaluation and relaunchEvaluation, E6.3, and claimed with the request they stored, E6.6), called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#stillEvaluating": "system processing (§5.5): whether a claim still holds before a new attempt, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#recordEvaluation": "system processing (§5.5, transition 5): adds the run and the proposal, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#listReceived": "system processing (§5.5): identifiers of the received submissions of an assignment, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#releaseEvaluation": "system processing (§5.5, transition 5): frees a claim to evaluation_failed, guarded by its token (a run frees its own claim only): a result refused twice, the breaker, or the workflow's releaseStep; called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#releaseStuckEvaluations": "system processing (§5.5, transition 5, PRC-02 R1): submissions evaluating for too long end evaluation_failed, called only by src/server/evaluation/",
  "src/server/data/submissions/drafts.ts#deleteStaleDrafts": "system processing (E9, AC-18, the sweep): deletes the drafts with no write for DRAFT_TTL_MS, their pages with them, identifiers only; called only by src/server/evaluation/sweep.ts",
  "src/server/data/evaluation/system.ts#takeStaleReceived": "system processing (E6, the sweep): identifiers and active version of the submissions still received after the grace, every mode (E9), dated as taken (E6.6), called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#readAiGuardCounts": "system processing (E6, EXP-02): token sums of this month's Anthropic runs, the calls without usage (E6.6) and the count of access failures, counts only, called only by src/server/evaluation/ (budget.ts, and month-cost.ts#readMonthCostUsd, which costCapReached and ai:status share, spec 0012)",
  "src/server/data/evaluation/system.ts#countUnreachableFailures": "system processing (E7.6, EXP-02): distinct submissions failed on an unreachable provider within the window, a count only, called only by src/server/evaluation/",
  "src/server/data/evaluation/system.ts#abandonEvaluationRequest": "system processing (E7.6): drops a teacher's retry or relaunch whose run found no place, its request only, and logs retry_abandoned without actor; called only by src/server/evaluation/ (the workflow's abandonStep)",
  "src/server/data/evaluation/measures.ts#readEvaluationMeasures":
    "scripts only (ai:report, E6.4, EXP-01): runs and copies by assignment, outcomes, attempts, durations, token sums and states; no name, email, text or proposal",
  "src/server/data/evaluation/measures.ts#readAiStatus":
    "scripts only (ai:status, spec 0012, AC-11): the evaluation and reading runs and the ai_request_sent lines of a window, identifiers, outcomes and counts; no name, email, text, image, proposal or actor_user_id",
  "src/server/data/evaluation/system.ts#claimAiAlert": "system processing (E6, EXP-02): hands the administrators' addresses to the alert's sending and records the cost cap, breaker, configuration or unreachable alert once sent, once per period, called only by src/server/evaluation/",
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
  "scripts/ai-read.ts":
    "npm run ai:read: the handwriting trial (E9.0, spec 0011) on fictitious photos through the product's Reader; stores nothing but the security log; the simulator unless --provider anthropic",
  "scripts/ai-status.ts":
    "npm run ai:status: what the AI did on the database in use (spec 0012, AC-11): the runs and request lines of a window, this month's cost against the cap, today's requests; reads only, calls no AI, no identity or content",
  "scripts/prod-run.ts":
    "npm run prod: runs one script of PROD_SCRIPTS against the production database (spec 0012, AC-7), its address passed through the environment only; adds no access of its own",
  "scripts/prod-guard.ts": "the rules of npm run prod (allow list, production variables, guard against the dev and test databases); no database access",
};
