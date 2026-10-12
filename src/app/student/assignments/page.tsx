import type { Metadata } from "next";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockStudentAssignments } from "@/mock/data";

export const metadata: Metadata = { title: "My assignments" };

export default function Page() {
  return (
    <>
      <PageHeader title="My assignments" />
      <ul className="flex flex-col gap-3">
        {mockStudentAssignments.map((a) => (
          <li key={a.id} className="card flex flex-col gap-1 p-4">
            <p className="text-base font-semibold">{a.title}</p>
            <p className="text-fg-muted">{a.className}</p>
            <p className="text-fg-muted">Due {a.due}</p>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Mock data. Assignments and submissions arrive in E3.</PlaceholderNote>
    </>
  );
}
