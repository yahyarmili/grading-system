import type { Metadata } from "next";
import { ClipboardCheck, ClipboardList } from "lucide-react";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockAssignments, submissionsFor } from "@/mock/assignment-submissions";
import { AssignmentsTable, type AssignmentRow } from "./assignments-table";

export const metadata: Metadata = { title: "Assignments" };

export default function Page() {
  const rows: AssignmentRow[] = mockAssignments.map((a) => {
    const submissions = submissionsFor(a.id);
    return {
      id: a.id,
      title: a.title,
      classes: a.classes,
      language: a.language,
      due: a.due,
      students: submissions.length,
      submitted: submissions.filter((s) => s.status !== "to_submit").length,
      toReview: submissions.filter((s) => s.status === "to_review").length,
    };
  });
  const toReview = rows.reduce((sum, a) => sum + a.toReview, 0);

  return (
    <>
      <PageHeader
        title="Assignments"
        meta={[
          { icon: ClipboardList, label: `${rows.length} assignments` },
          { icon: ClipboardCheck, label: `${toReview} submissions to review` },
        ]}
      />
      <AssignmentsTable rows={rows} />
      <PlaceholderNote>Fictitious data. Creating and editing assignments arrives in E3.</PlaceholderNote>
    </>
  );
}
