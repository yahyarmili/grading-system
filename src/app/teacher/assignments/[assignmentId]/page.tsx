import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, Inbox, Languages, Users } from "lucide-react";
import { LoadingState } from "@/components/loading";
import { BackLink, PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { GRADE_SCALE } from "@/config/provisional";
import { findAssignment, mockAssignments, submissionsFor } from "@/mock/assignment-submissions";
import { SubmissionsList } from "./submissions-list";

// Mockup of REV-01: submissions of one assignment, fictitious data.

export function generateStaticParams() {
  return mockAssignments.map((a) => ({ assignmentId: a.id }));
}

export const metadata: Metadata = { title: "Submissions" };

const dateFormat = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", timeZone: "UTC" });

// The URL-independent part stays in the App Shell; reading params happens
// behind Suspense so navigation stays instant (cacheComponents + partialPrefetching).
export default function Page({ params }: PageProps<"/teacher/assignments/[assignmentId]">) {
  return (
    <>
      <BackLink href="/teacher/assignments">Assignments</BackLink>
      <Suspense fallback={<LoadingState label="Loading submissions…" />}>
        <AssignmentSubmissions params={params} />
      </Suspense>
      <PlaceholderNote>
        Fictitious data. Grades out of {GRADE_SCALE} are provisional (Q1 open).
      </PlaceholderNote>
    </>
  );
}

async function AssignmentSubmissions({ params }: Pick<PageProps<"/teacher/assignments/[assignmentId]">, "params">) {
  const { assignmentId } = await params;
  const assignment = findAssignment(assignmentId);
  if (!assignment) notFound();
  const rows = submissionsFor(assignment.id);
  const submitted = rows.filter((r) => r.status !== "to_submit").length;

  return (
    <>
      <PageHeader
        title={assignment.title}
        meta={[
          { icon: Users, label: assignment.classes.join(", ") },
          { icon: Languages, label: assignment.language },
          { icon: CalendarClock, label: `Due ${dateFormat.format(new Date(assignment.due))}` },
          { icon: Inbox, label: `${submitted} of ${rows.length} submitted` },
        ]}
      />
      <SubmissionsList assignmentId={assignment.id} rows={rows} classes={assignment.classes} />
    </>
  );
}
