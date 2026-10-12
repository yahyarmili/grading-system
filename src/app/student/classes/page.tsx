import type { Metadata } from "next";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockStudentClasses } from "@/mock/data";

export const metadata: Metadata = { title: "My classes" };

export default function Page() {
  return (
    <>
      <PageHeader title="My classes" />
      <ul className="flex flex-col gap-3">
        {mockStudentClasses.map((c) => (
          <li key={c.id} className="card flex flex-col gap-1 p-4">
            <p className="text-base font-semibold">{c.name}</p>
            <p className="text-fg-muted">Teacher: {c.teacher}</p>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Mock data. Joining a class arrives in E2.</PlaceholderNote>
    </>
  );
}
