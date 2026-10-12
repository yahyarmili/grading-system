import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, UserMinus } from "lucide-react";
import { Alert } from "@/components/alert";
import { LoadingState } from "@/components/loading";
import { PlaceholderNote } from "@/components/shell/shell-parts";
import { LateTag, StatusTag } from "@/components/status-tag";
import { Tag } from "@/components/tag";
import { statusLabels } from "@/lib/submission-status";
import {
  copyOf,
  findSubmission,
  mockAssignment,
  mockAssignmentSubmissions,
  type SubmissionRow,
} from "@/mock/assignment-submissions";
import { CopyPanel } from "./copy-panel";
import { EvaluationForm } from "./evaluation-form";

// Mockup of REV-02 and REV-03: one student's copy for one assignment, fictitious data.
// No history of the student's previous results on this screen (REV-02 R2, halo effect).

type Props = PageProps<"/teacher/assignments/[assignmentId]/students/[studentId]">;

export function generateStaticParams() {
  return mockAssignmentSubmissions.map((r) => ({ assignmentId: mockAssignment.id, studentId: r.id }));
}

export const metadata: Metadata = { title: "Submission" };

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Page({ params }: Props) {
  return (
    <>
      <Link
        href={`/teacher/assignments/${mockAssignment.id}`}
        className="mb-3 inline-flex items-center gap-1 rounded-sm text-fg-muted hover:text-fg"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Submissions
      </Link>
      <Suspense fallback={<LoadingState label="Loading submission…" />}>
        <CopyScreen params={params} />
      </Suspense>
      <PlaceholderNote>
        Mockup with fictitious data. Grade format and conversion are provisional (Q1 open).
        Validation and publication arrive in E8.
      </PlaceholderNote>
    </>
  );
}

async function CopyScreen({ params }: Pick<Props, "params">) {
  const { assignmentId, studentId } = await params;
  const row = findSubmission(studentId);
  if (assignmentId !== mockAssignment.id || !row) notFound();
  const copy = copyOf(row);

  return (
    <>
      <Identity row={row} />
      {row.status === "to_submit" || !copy || !row.mode ? (
        // REV-02 R4: a student who has not submitted opens a status page without a form.
        <Alert tone="info" title={statusLabels[row.status]}>
          {row.status === "to_submit"
            ? "This student has not submitted yet. There is nothing to evaluate."
            : row.cause
              ? `${row.cause}. No text to show. Manual evaluation arrives in a later step (REV-06).`
              : "No text to show yet."}
        </Alert>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col xl:sticky xl:top-[calc(var(--spacing-header)+1rem)] xl:max-h-[calc(100dvh-var(--spacing-header)-2rem)]">
            <CopyPanel text={copy.text} mode={row.mode} instructions={mockAssignment.instructions} />
          </div>
          <div className="flex flex-col gap-4">
            {row.hasProposal ? (
              <EvaluationForm proposal={copy.proposal} initialGrade={row.teacherGrade} />
            ) : (
              <Alert tone="info" title={`No AI proposal: ${statusLabels[row.status]}`}>
                The evaluation form appears once a proposal exists. Manual evaluation arrives in a
                later step (REV-06).
              </Alert>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Identity({ row }: { row: SubmissionRow }) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      <h1 className="text-lg">
        {row.firstName} {row.lastName}
      </h1>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-[auto_1fr] lg:flex lg:flex-wrap">
        <div className="flex gap-2">
          <dt className="text-fg-muted">Email</dt>
          <dd>{row.email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-fg-muted">{row.classes.length > 1 ? "Classes" : "Class"}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {row.classes.join(", ")}
            {row.removedFromClass && <Tag icon={UserMinus}>Removed from class</Tag>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-fg-muted">Status</dt>
          <dd className="flex flex-wrap gap-1">
            <StatusTag status={row.status} />
            {row.late && <LateTag />}
          </dd>
        </div>
        {row.submittedAt && row.mode && (
          <div className="flex gap-2">
            <dt className="text-fg-muted">Submitted</dt>
            <dd>
              {dateFormat.format(new Date(row.submittedAt))} · {row.mode === "text" ? "Text" : "Image"}
            </dd>
          </div>
        )}
      </dl>
    </header>
  );
}
