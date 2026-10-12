import type { Metadata } from "next";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockTeacherAssignments } from "@/mock/data";

export const metadata: Metadata = { title: "Assignments" };

export default function Page() {
  return (
    <>
      <PageHeader title="Assignments" description="Writing tasks you set for your classes." />
      <ul className="card divide-y divide-border-subtle">
        {mockTeacherAssignments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-4">
            <p className="font-medium">{a.title}</p>
            <p className="text-fg-muted">
              {a.className} · Due {a.due}
            </p>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Mock data. Assignments arrive in E3.</PlaceholderNote>
    </>
  );
}
