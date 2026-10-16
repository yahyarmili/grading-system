import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, Inbox, Languages, Users } from "lucide-react";
import { LoadingState } from "@/components/loading";
import { BackLink, PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { GRADE_SCALE } from "@/config/decisions";
import { findAssignment, mockAssignments, submissionsFor } from "@/mock/assignment-submissions";
import { formatDate } from "@/lib/dates";
import { SubmissionsList } from "./submissions-list";

// Mockup of REV-01: submissions of one assignment, fictitious data.

export function generateStaticParams() {
  return mockAssignments.map((a) => ({ assignmentId: a.id }));
}

export const metadata: Metadata = { title: "Submissions" };

const dateFormat = { format: formatDate };

// The URL-independent part stays in the App Shell; reading params happens
// behind Suspense so navigation stays instant (cacheComponents + partialPrefetching).
export default function Page({ params }: PageProps<"/dev/mockups/assignments/[assignmentId]">) {
  return (
    <>
      <BackLink href="/dev/mockups">Mockups</BackLink>
      <Suspense fallback={<LoadingState label="Loading submissions…" />}>
        <AssignmentSubmissions params={params} />
      </Suspense>
      <PlaceholderNote>
        Fictitious data. Calculated grades are the sum of the five levels, out of {GRADE_SCALE}.
      </PlaceholderNote>
    </>
  );
}

async function AssignmentSubmissions({ params }: Pick<PageProps<"/dev/mockups/assignments/[assignmentId]">, "params">) {
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
