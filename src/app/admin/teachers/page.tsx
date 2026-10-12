import type { Metadata } from "next";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockTeachers } from "@/mock/data";

export const metadata: Metadata = { title: "Teachers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Teachers" description="Teacher accounts are created here." />
      <ul className="card divide-y divide-border-subtle">
        {mockTeachers.map((t) => (
          <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-4">
            <p className="font-medium">{t.name}</p>
            <p className="text-fg-muted">{t.email}</p>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Mock data. Account creation arrives in E1.</PlaceholderNote>
    </>
  );
}
