import type { Metadata } from "next";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockTeacherClasses } from "@/mock/data";

export const metadata: Metadata = { title: "Classes" };

export default function Page() {
  return (
    <>
      <PageHeader title="Classes" description="Your classes and their students." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mockTeacherClasses.map((c) => (
          <li key={c.id} className="card card-body flex flex-col gap-1">
            <p className="text-base font-semibold">{c.name}</p>
            <p className="text-fg-muted">{c.students} students</p>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Mock data. Class management arrives in E2.</PlaceholderNote>
    </>
  );
}
