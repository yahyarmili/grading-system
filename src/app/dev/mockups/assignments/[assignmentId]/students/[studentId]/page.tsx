import type { Metadata } from "next";
import { GRADE_SCALE } from "@/config/decisions";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, CircleDashed, FileText, Image as ImageIcon, Mail, TriangleAlert, Users, UserMinus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { BackLink, PlaceholderNote } from "@/components/shell/shell-parts";
import { LateTag, StatusTag } from "@/components/status-tag";
import { Tag } from "@/components/tag";
import { statusLabels } from "@/lib/submission-status";
import {
  copyOf,
  findAssignment,
  findSubmission,
  mockAssignments,
  submissionsFor,
  type SubmissionRow,
} from "@/mock/assignment-submissions";
import { formatDate } from "@/lib/dates";
import { CopyPanel } from "./copy-panel";
import { EvaluationForm } from "./evaluation-form";

// Mockup of REV-02 and REV-03: one student's copy for one assignment, fictitious data.
// No history of the student's previous results on this screen (REV-02 R2, halo effect).

type Props = PageProps<"/dev/mockups/assignments/[assignmentId]/students/[studentId]">;

export function generateStaticParams() {
  return mockAssignments.flatMap((a) =>
    submissionsFor(a.id).map((r) => ({ assignmentId: a.id, studentId: r.id })),
  );
}

export const metadata: Metadata = { title: "Submission" };

const dateFormat = { format: formatDate };

export default function Page({ params }: Props) {
  return (
    <>
      <Suspense fallback={<LoadingState label="Loading submission…" />}>
        <CopyScreen params={params} />
      </Suspense>
      <PlaceholderNote>
        Fictitious data. The calculated grade is the sum of the five levels, out of {GRADE_SCALE}; the step of a typed
        grade is provisional. Validation and publication arrive in E8.
      </PlaceholderNote>
    </>
  );
}

async function CopyScreen({ params }: Pick<Props, "params">) {
  const { assignmentId, studentId } = await params;
  const assignment = findAssignment(assignmentId);
  const row = findSubmission(assignmentId, studentId);
  if (!assignment || !row) notFound();
  const copy = copyOf(row);

  return (
    <>
      <BackLink href={`/dev/mockups/assignments/${assignment.id}`}>{assignment.title}</BackLink>
      <Identity row={row} />
      {row.status === "to_submit" || !copy || !row.mode ? (
        // REV-02 R4: no text yet, a status page without a form.
        <div className="card">
          <EmptyState
            icon={row.status === "to_submit" ? CircleDashed : TriangleAlert}
            title={row.status === "to_submit" ? "Not submitted yet" : statusLabels[row.status]}
            description={
              row.status === "to_submit"
                ? `Nothing to evaluate. The deadline is ${dateFormat.format(new Date(assignment.due))}.`
                : row.cause
                  ? `${row.cause}. Manual evaluation arrives in a later step (REV-06).`
                  : "There is no text to show yet."
            }
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col xl:sticky xl:top-[calc(var(--spacing-header)+1rem)] xl:max-h-[calc(100dvh-var(--spacing-header)-2rem)]">
            <CopyPanel text={copy.text} mode={row.mode} instructions={assignment.instructions} />
          </div>
          <div className="flex flex-col gap-4">
            {row.hasProposal ? (
              <EvaluationForm proposal={copy.proposal} initialGrade={row.teacherGrade} />
            ) : (
              <div className="card">
                <EmptyState
                  icon={CircleDashed}
                  title={`No AI proposal yet: ${statusLabels[row.status]}`}
                  description="The evaluation form appears once a proposal exists. Manual evaluation arrives in a later step (REV-06)."
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Who and what: identity (REV-02 R1), status, late flag, mode. Labels stay for screen readers. */
function Identity({ row }: { row: SubmissionRow }) {
  const ModeIcon = row.mode === "image" ? ImageIcon : FileText;
  return (
    <header className="mb-5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg">
          {row.firstName} {row.lastName}
        </h1>
        <StatusTag status={row.status} />
        {row.late && <LateTag />}
      </div>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted">
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">Email</dt>
          <Mail aria-hidden="true" className="size-4" />
          <dd>{row.email}</dd>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">{row.classes.length > 1 ? "Classes" : "Class"}</dt>
          <Users aria-hidden="true" className="size-4" />
          <dd className="flex flex-wrap items-center gap-2">
            {row.classes.join(", ")}
            {row.removedFromClass && <Tag icon={UserMinus}>Removed from class</Tag>}
          </dd>
        </div>
        {row.submittedAt && row.mode && (
          <div className="inline-flex items-center gap-1.5">
            <dt className="sr-only">Submitted</dt>
            <ModeIcon aria-hidden="true" className="size-4" />
            <dd>
              {row.mode === "text" ? "Text" : "Image"}, submitted{" "}
              {dateFormat.format(new Date(row.submittedAt))}
            </dd>
          </div>
        )}
        {!row.submittedAt && (
          <div className="inline-flex items-center gap-1.5">
            <dt className="sr-only">Submitted</dt>
            <CalendarClock aria-hidden="true" className="size-4" />
            <dd>Not submitted</dd>
          </div>
        )}
      </dl>
    </header>
  );
}
