import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockTeachers } from "@/mock/data";

export const metadata: Metadata = { title: "Teachers" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Teachers"
        meta={[{ icon: Users, label: `${mockTeachers.length} teacher accounts` }]}
      />
      <ul className="card divide-y divide-border-subtle">
        {mockTeachers.map((t) => (
          <li
            key={t.id}
            className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:px-6"
          >
            <span className="font-medium">{t.name}</span>
            <span className="text-fg-muted">{t.email}</span>
          </li>
        ))}
      </ul>
      <PlaceholderNote>Fictitious data. Creating teacher accounts arrives in E1.</PlaceholderNote>
    </>
  );
}
