import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { MetaList, PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { mockStudentClasses } from "@/mock/data";

export const metadata: Metadata = { title: "My classes" };

export default function Page() {
  return (
    <>
      <PageHeader title="My classes" />
      <ul className="flex flex-col gap-3">
        {mockStudentClasses.map((c) => (
          <li key={c.id} className="card flex flex-col gap-1.5 p-4">
            <h2 className="text-base font-semibold">{c.name}</h2>
            <MetaList items={[{ icon: UserRound, label: c.teacher }]} />
          </li>
        ))}
      </ul>
      <PlaceholderNote>Fictitious data. Joining a class arrives in E2.</PlaceholderNote>
    </>
  );
}
