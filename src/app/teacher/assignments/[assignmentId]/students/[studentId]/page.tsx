import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Ban, CalendarClock, CircleDashed, FileText, Hourglass, Image as ImageIcon, Mail, PenLine, TriangleAlert, UserMinus, Users, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { Alert } from "@/components/alert";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { BackLink } from "@/components/shell/shell-parts";
import { LateTag, StatusTag } from "@/components/status-tag";
import { Tag } from "@/components/tag";
import { EVALUATION_BUSY_MAX_WAITS, EVALUATION_BUSY_WAIT_MS } from "@/config/provisional";
import { formatDateTime } from "@/lib/dates";
import { evaluationFailureLabel, notAssessableCauseLabels } from "@/lib/evaluation";
import { mayOfferRelaunch } from "@/lib/relaunch-offer";
import { parseReviewListQuery, reviewListSearch } from "@/lib/review-list";
import { manualRubricFor, RUBRIC_VERSIONS } from "@/lib/rubric";
import { getActor } from "@/server/auth/session";
import { listRelaunchable } from "@/server/data/evaluation/teacher";
import { getCopy, getStudentIdentity, type StudentIdentity, type TeacherCopy } from "@/server/data/review/copy";
import { relaunchConditions } from "@/server/evaluation/relaunch";
import { TeacherNotice } from "@/app/teacher/teacher-notice";
import { NoticeArea } from "../../notice";
import { RefreshWhileEvaluating } from "../../refresh-while";
import { RequestButton } from "../../request-button";
import { CopyOpened } from "./copy-opened";
import { CopyStateProvider } from "./copy-state";
import { CopyPanel } from "./copy-panel";
import { CopyHistory } from "./history";
import { EvaluationForm } from "./evaluation-form";

export const metadata: Metadata = { title: "Submission" };

type Props = PageProps<"/teacher/assignments/[assignmentId]/students/[studentId]">;

// REV-02: one student's copy for one of the teacher's assignments, opened by
// a click on their name. Another teacher's copy, a student who did not
// receive the assignment, or a missing one answers 404 alike (AUTH-04 R3).
// The check runs before any streaming, which would fix the status at 200:
// the page blocks on it. No result of the student's other work is read (R2).
export const instant = false;

/** How long a request waits for an evaluation slot before it is dropped (orchestrate.ts). */
const SLOT_WAIT_MINUTES = Math.round((EVALUATION_BUSY_WAIT_MS * EVALUATION_BUSY_MAX_WAITS) / 60_000);

export default async function Page({ params, searchParams }: Props) {
  const { assignmentId, studentId } = await params;
  const uuid = z.uuid();
  if (!uuid.safeParse(assignmentId).success || !uuid.safeParse(studentId).success) notFound();
  const actor = await getActor();
  const [copy, identity] = await Promise.all([getCopy(actor, assignmentId, studentId), getStudentIdentity(actor, studentId)]);
  if (!copy || !identity) notFound();
  // NFR-DON-04 (E7.7): nothing of the copy before the teacher notice is read.
  if (copy === "notice_required") {
    return (
      <>
        <BackLink href={`/teacher/assignments/${assignmentId}`}>Submissions</BackLink>
        <TeacherNotice />
      </>
    );
  }

  // The list's sort and filters, given back as they were (REV-01), read again so nothing else passes.
  const search = await searchParams;
  const list = search.list;
  const listState = parseReviewListQuery(
    Object.fromEntries(new URLSearchParams(typeof list === "string" ? list : "")),
    copy.classes.map((c) => c.id),
  );
  const evaluable = ["to_review", "validated", "published"].includes(copy.status);
  // REV-06 (E8.2): entered by hand, on a copy the AI did not evaluate (?manual=1, nothing written before
  // the first save), or once its manual evaluation exists. Its rubric: the language's, or the English one (Q6).
  const manualStart = (copy.status === "evaluation_failed" || copy.status === "not_assessable") && search.manual === "1";
  const manual = manualStart || (evaluable && copy.evaluation?.origin === "manual");
  const reviewable = manual || (copy.proposal !== null && evaluable);
  const recorded = RUBRIC_VERSIONS.find((v) => v.id === copy.evaluation?.rubricVersion);
  const manualHref = `?${new URLSearchParams({ ...(typeof list === "string" ? { list } : {}), manual: "1" })}`;
  const substituteRubric =
    manual && (recorded ? recorded.language !== copy.assignment.language : manualRubricFor(copy.assignment.language).substitute);
  // PRC-02 R4: read only for a copy that may be offered, by the list's rule (two round trips otherwise spared, C8b).
  const relaunchable =
    copy.seen !== null &&
    mayOfferRelaunch({ status: copy.status, requested: copy.request === "pending", cause: copy.cause }, copy.assignment.language) &&
    (await listRelaunchable(actor, assignmentId, await relaunchConditions())).some((c) => c.submissionId === copy.seen?.submissionId);

  return (
    // The form and the opening share what is typed and not saved (copy-state.tsx).
    <CopyStateProvider>
      {copy.seen && <CopyOpened seen={copy.seen} />}
      <BackLink href={`/teacher/assignments/${assignmentId}${reviewListSearch(listState)}`}>
        {copy.assignment.title}: submissions
      </BackLink>
      <Identity copy={copy} identity={identity} />
      <NoticeArea>
        {copy.version === null ? (
          <StatusCard copy={copy} relaunchable={relaunchable} manualHref={manualHref} />
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex flex-col xl:sticky xl:top-[calc(var(--spacing-header)+1rem)] xl:max-h-[calc(100dvh-var(--spacing-header)-2rem)]">
              <CopyPanel
                text={copy.version.text}
                mode={copy.version.mode}
                transcription={copy.version.transcription}
                subject={copy.assignment.subject}
                language={copy.assignment.language}
              />
            </div>
            {reviewable && copy.seen ? (
              <EvaluationForm
                // A copy replaced under the page starts a new form. A new revision does not:
                // the form takes it, or asks when changes are typed (REV-03 CA4, evaluation-form.tsx).
                key={`${copy.seen.versionNumber}:${copy.seen.proposalId}`}
                proposal={manual ? null : copy.proposal}
                evaluation={copy.evaluation}
                seen={copy.seen}
                language={copy.assignment.language}
                substituteRubric={substituteRubric}
              />
            ) : (
              <StatusCard copy={copy} relaunchable={relaunchable} manualHref={manualHref} />
            )}
          </div>
        )}
      </NoticeArea>
      {copy.seen && (
        <div className="mt-6">
          <Suspense fallback={<LoadingState label="Loading the history…" className="card" />}>
            <CopyHistory submissionId={copy.seen.submissionId} />
          </Suspense>
        </div>
      )}
    </CopyStateProvider>
  );
}

/**
 * REV-02 R4: a copy without a proposal to review shows why, without a form.
 * PRC-02 (E7.6): a failed copy offers "Retry"; a not assessable one,
 * "Relaunch" when listRelaunchable offers it. A request waiting for its run,
 * or dropped for want of a place, is said. Both offer "Evaluate manually"
 * (REV-06, E8.2): the form, on the same page (?manual=1).
 */
function StatusCard({ copy, relaunchable, manualHref }: { copy: TeacherCopy; relaunchable: boolean; manualHref: string }) {
  const { icon, title, description } = statusPage(copy, relaunchable);
  const seen = copy.seen;
  const refused = copy.status === "evaluation_failed" && copy.lastError === "refused";
  const retry = copy.status === "evaluation_failed" && seen;
  const relaunch = copy.status === "not_assessable" && relaunchable && seen;
  const waiting = copy.request === "pending" || ["received", "evaluating"].includes(copy.status);
  const asked = copy.status === "evaluation_failed" ? "Retry" : "Relaunch";
  // REV-06: a failed copy (a refusal included) or a not assessable one (any cause) is evaluated by hand.
  const manual = (copy.status === "evaluation_failed" || copy.status === "not_assessable") && seen;

  return (
    <div className="card">
      {waiting && <RefreshWhileEvaluating />}
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={
          (retry || relaunch || manual || copy.request) && (
            <div className="flex max-w-md flex-col items-center gap-3 text-left">
              {copy.request === "pending" && (
                <Alert tone="info" title={`${asked} requested`}>
                  Waiting for an evaluation slot. This page updates by itself.
                </Alert>
              )}
              {copy.request === "abandoned" && (
                <Alert tone="warning" title={`${asked} not started`}>
                  No evaluation slot was freed within {SLOT_WAIT_MINUTES} minutes. Nothing was evaluated. Try again later.
                </Alert>
              )}
              {refused && (
                <Alert tone="warning" title="A refusal usually repeats">
                  <span id="refusal-warning">
                    The AI declined this text. Asked again, it will most likely decline again.
                  </span>
                </Alert>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                {retry && (
                  <RequestButton
                    kind="retry"
                    seen={seen}
                    label={refused ? "Retry anyway" : "Retry"}
                    primary={!refused}
                    describedBy={refused ? "refusal-warning" : undefined}
                  />
                )}
                {relaunch && <RequestButton kind="relaunch" seen={seen} label="Relaunch" primary />}
                {/* REV-06: the teacher's own evaluation, without a proposal; nothing is written before its first save. */}
                {manual && (
                  <Link href={manualHref} className={(retry && !refused) || relaunch ? "btn btn-secondary" : "btn btn-primary"}>
                    <PenLine aria-hidden="true" className="size-4" />
                    Evaluate manually
                  </Link>
                )}
              </div>
            </div>
          )
        }
      />
    </div>
  );
}

/** Why a cause is still there, or that it went: what the teacher may do. */
function causeHelp(copy: TeacherCopy, relaunchable: boolean): string {
  if (copy.cause === "no_content") return "The text has nothing the rubric can assess. It cannot be relaunched.";
  if (relaunchable) {
    return copy.cause === "rubric_unavailable"
      ? "The rubric for this language is now validated: the AI can evaluate this copy."
      : "The AI is available again: it can evaluate this copy.";
  }
  return copy.cause === "rubric_unavailable"
    ? "A relaunch is offered once the rubric for this language is validated."
    : "A relaunch is offered once the AI is available again.";
}

function statusPage(copy: TeacherCopy, relaunchable = false): { icon: LucideIcon; title: string; description: string } {
  switch (copy.status) {
    case "to_submit":
      return { icon: CircleDashed, title: "Not submitted", description: "This student has not submitted anything for this assignment yet." };
    case "received":
    case "transcribing":
    case "evaluating":
      return { icon: Hourglass, title: "Being evaluated", description: "The AI proposal appears here once the evaluation ends." };
    case "transcription_failed":
      return { icon: TriangleAlert, title: "Transcription failed", description: "The pages could not be transcribed." };
    case "evaluation_failed":
      return { icon: TriangleAlert, title: "Evaluation failed", description: evaluationFailureLabel(copy.lastError) };
    case "not_assessable":
      return {
        icon: Ban,
        title: copy.cause ? `Not assessable: ${notAssessableCauseLabels[copy.cause]}` : "Not assessable",
        description: copy.cause ? causeHelp(copy, relaunchable) : "This copy could not be assessed.",
      };
    default:
      return { icon: CircleDashed, title: "No AI proposal", description: "There is no AI proposal for this copy." };
  }
}

/** Who and what (REV-02 R1, D9): name, email, the recipient classes, status, late flag, mode and dates. */
function Identity({ copy, identity }: { copy: TeacherCopy; identity: StudentIdentity }) {
  const { version } = copy;
  const ModeIcon = version?.mode === "images" ? ImageIcon : FileText;
  return (
    <header className="mb-5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg">
          {identity.firstName} {identity.lastName}
        </h1>
        {copy.status === "to_submit" ? (
          <span className="text-fg-muted">Not submitted</span>
        ) : (
          <StatusTag status={copy.status} />
        )}
        {copy.late && <LateTag />}
        {/* REV-05 CA1, PUB-01: who decided, and when (from the review log). */}
        {copy.decision && (
          <span className="text-fg-muted">
            {copy.decision.event === "published" ? "Published" : "Validated"} by {copy.decision.by},{" "}
            <time dateTime={copy.decision.at}>{formatDateTime(copy.decision.at)}</time>
          </span>
        )}
      </div>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted">
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">Email</dt>
          <Mail aria-hidden="true" className="size-4" />
          <dd className="break-all">{identity.email}</dd>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">{copy.classes.length > 1 ? "Classes" : "Class"}</dt>
          <Users aria-hidden="true" className="size-4" />
          <dd>
            <ul aria-label="Classes" className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {copy.classes.map((c, i) => (
                <li key={c.id} className="inline-flex items-center gap-2">
                  <span>
                    {c.name}
                    {i < copy.classes.length - 1 && ","}
                  </span>
                  {c.removed && <Tag icon={UserMinus}>Removed from class</Tag>}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">Submitted</dt>
          {version ? <ModeIcon aria-hidden="true" className="size-4" /> : <CalendarClock aria-hidden="true" className="size-4" />}
          <dd>
            {version ? (
              <>
                {version.mode === "text" ? "Text" : "Images"}, submitted{" "}
                <time dateTime={copy.submittedAt ?? undefined}>{formatDateTime(copy.submittedAt!)}</time>
                {/* SUB-04 CA2: a replacement shows both dates. */}
                {version.number > 1 && (
                  <>
                    , replaced <time dateTime={version.createdAt}>{formatDateTime(version.createdAt)}</time>
                  </>
                )}
              </>
            ) : (
              "Not submitted"
            )}
          </dd>
        </div>
      </dl>
    </header>
  );
}
