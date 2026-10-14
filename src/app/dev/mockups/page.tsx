import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockAssignments } from "@/mock/assignment-submissions";

export const metadata: Metadata = { title: "Mockups" };

/** Entry to mockups 1.4 (submissions of an assignment) and 1.5 (a copy), opened from there. */
export default function Page() {
  return (
    <>
      <PageHeader title="Mockups" />
      <p className="mb-3 text-fg-muted">Submissions of an assignment (1.4), then a student&rsquo;s copy (1.5):</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {mockAssignments.map((a) => (
          <li key={a.id}>
            <Link className="link" href={`/dev/mockups/assignments/${a.id}`}>
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Fictitious data, kept for E7 (REV-01, REV-02).</PlaceholderNote>
    </>
  );
}
