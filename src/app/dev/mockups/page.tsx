import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockAssignments, submissionsFor } from "@/mock/assignment-submissions";

export const metadata: Metadata = { title: "Mockups" };

/**
 * Entry to mockup 1.5 (a student's copy). Mockup 1.4, the submissions of an
 * assignment, became the real list in E7.2 (/teacher/assignments/[assignmentId]).
 */
export default function Page() {
  return (
    <>
      <PageHeader title="Mockups" />
      <p className="mb-3 text-fg-muted">A student&rsquo;s copy (1.5), by assignment:</p>
      <ul className="flex flex-col gap-4">
        {mockAssignments.map((a) => (
          <li key={a.id}>
            <h2 className="mb-1 font-semibold">{a.title}</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {submissionsFor(a.id).map((r) => (
                <li key={r.id}>
                  <Link className="link" href={`/dev/mockups/assignments/${a.id}/students/${r.id}`}>
                    {r.lastName} {r.firstName}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Fictitious data, kept for E7.3 (REV-02, REV-03).</PlaceholderNote>
    </>
  );
}
