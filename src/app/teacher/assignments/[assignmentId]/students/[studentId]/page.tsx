import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban, CalendarClock, CircleDashed, FileText, Hourglass, Image as ImageIcon, Mail, TriangleAlert, UserMinus, Users, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { BackLink } from "@/components/shell/shell-parts";
import { LateTag, StatusTag } from "@/components/status-tag";
import { Tag } from "@/components/tag";
import { formatDateTime } from "@/lib/dates";
import { evaluationFailureLabel, notAssessableCauseLabels } from "@/lib/evaluation";
import { parseReviewListQuery, reviewListSearch } from "@/lib/review-list";
import { getActor } from "@/server/auth/session";
import { getCopy, getStudentIdentity, type StudentIdentity, type TeacherCopy } from "@/server/data/review/copy";
import { CopyOpened } from "./copy-opened";
import { CopyPanel } from "./copy-panel";
import { EvaluationForm } from "./evaluation-form";

export const metadata: Metadata = { title: "Submission" };

type Props = PageProps<"/teacher/assignments/[assignmentId]/students/[studentId]">;

// REV-02: one student's copy for one of the teacher's assignments, opened by
// a click on their name. Another teacher's copy, a student who did not
// receive the assignment, or a missing one answers 404 alike (AUTH-04 R3).
// The check runs before any streaming, which would fix the status at 200:
// the page blocks on it. No result of the student's other work is read (R2).
export const instant = false;

export default async function Page({ params, searchParams }: Props) {
  const { assignmentId, studentId } = await params;
  const uuid = z.uuid();
  if (!uuid.safeParse(assignmentId).success || !uuid.safeParse(studentId).success) notFound();
  const actor = await getActor();
  const [copy, identity] = await Promise.all([getCopy(actor, assignmentId, studentId), getStudentIdentity(actor, studentId)]);
  if (!copy || !identity) notFound();

  // The list's sort and filters, given back as they were (REV-01), read again so nothing else passes.
  const list = (await searchParams).list;
  const listState = parseReviewListQuery(
    Object.fromEntries(new URLSearchParams(typeof list === "string" ? list : "")),
    copy.classes.map((c) => c.id),
  );
  const reviewable = copy.proposal !== null && ["to_review", "validated", "published"].includes(copy.status);

  return (
    <>
      {copy.seen && <CopyOpened seen={copy.seen} />}
      <BackLink href={`/teacher/assignments/${assignmentId}${reviewListSearch(listState)}`}>
        {copy.assignment.title}: submissions
      </BackLink>
      <Identity copy={copy} identity={identity} />
      {copy.version === null ? (
        <StatusCard copy={copy} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col xl:sticky xl:top-[calc(var(--spacing-header)+1rem)] xl:max-h-[calc(100dvh-var(--spacing-header)-2rem)]">
            <CopyPanel
              text={copy.version.text}
              mode={copy.version.mode}
              subject={copy.assignment.subject}
              language={copy.assignment.language}
            />
          </div>
          {reviewable && copy.proposal && copy.seen ? (
            <EvaluationForm
              // A copy changed under the page (replaced, saved elsewhere) starts a new form.
              key={`${copy.seen.versionNumber}:${copy.seen.proposalId}:${copy.seen.revision}`}
              proposal={copy.proposal}
              evaluation={copy.evaluation}
              seen={copy.seen}
              language={copy.assignment.language}
            />
          ) : (
            <StatusCard copy={copy} />
          )}
        </div>
      )}
    </>
  );
}

/** REV-02 R4: a copy without a proposal to review shows why, without a form (actions: E7.6, E8). */
function StatusCard({ copy }: { copy: TeacherCopy }) {
  const { icon, title, description } = statusPage(copy);
  return (
    <div className="card">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  );
}

function statusPage(copy: TeacherCopy): { icon: LucideIcon; title: string; description: string } {
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
        title: "Not assessable",
        description: copy.cause ? notAssessableCauseLabels[copy.cause] : "This copy could not be assessed.",
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
