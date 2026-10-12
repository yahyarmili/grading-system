import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { LoadingState } from "@/components/loading";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockAssignment, mockAssignmentSubmissions } from "@/mock/assignment-submissions";
import { SubmissionsList } from "./submissions-list";

// Mockup of REV-01: submissions of one assignment, fictitious data.

export function generateStaticParams() {
  return [{ assignmentId: mockAssignment.id }];
}

export const metadata: Metadata = { title: mockAssignment.title };

const dateFormat = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", timeZone: "UTC" });

// The URL-independent part stays in the App Shell; reading params happens
// behind Suspense so navigation stays instant (cacheComponents + partialPrefetching).
export default function Page({ params }: PageProps<"/teacher/assignments/[assignmentId]">) {
  return (
    <>
      <Link
        href="/teacher/assignments"
        className="mb-3 inline-flex items-center gap-1 rounded-sm text-fg-muted hover:text-fg"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Assignments
      </Link>
      <Suspense fallback={<LoadingState label="Loading submissions…" />}>
        <AssignmentSubmissions params={params} />
      </Suspense>
      <PlaceholderNote>
        Mockup with fictitious data. Grades out of 20 are provisional (Q1 open). Click a last name to open the
        submission.
      </PlaceholderNote>
    </>
  );
}

async function AssignmentSubmissions({ params }: Pick<PageProps<"/teacher/assignments/[assignmentId]">, "params">) {
  const { assignmentId } = await params;
  if (assignmentId !== mockAssignment.id) notFound();
  const a = mockAssignment;

  return (
    <>
      <PageHeader
        title={a.title}
        description={`${a.classes.join(", ")} · ${a.language} · Due ${dateFormat.format(new Date(a.due))}`}
      />
      <SubmissionsList assignmentId={a.id} rows={mockAssignmentSubmissions} classes={a.classes} />
    </>
  );
}
