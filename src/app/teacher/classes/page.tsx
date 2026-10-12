import type { Metadata } from "next";
import { ClipboardList, School, Users } from "lucide-react";
import { MetaList, PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { classSize, distinctStudents, mockAssignments } from "@/mock/assignment-submissions";
import { mockTeacherClasses } from "@/mock/data";

export const metadata: Metadata = { title: "Classes" };

export default function Page() {
  const classes = mockTeacherClasses.map((c) => ({
    ...c,
    students: c.students ?? classSize(c.name),
    assignments: mockAssignments.filter((a) => a.classes.includes(c.name)).length,
  }));
  // Rostered classes counted by distinct student; the others by their fixed size.
  const totalStudents =
    distinctStudents(mockTeacherClasses.filter((c) => c.students === undefined).map((c) => c.name)) +
    mockTeacherClasses.reduce((sum, c) => sum + (c.students ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Classes"
        meta={[
          { icon: School, label: `${classes.length} classes` },
          { icon: Users, label: `${totalStudents} students` },
        ]}
      />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {classes.map((c) => (
          <li key={c.id} className="card flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold">{c.name}</h2>
            <MetaList
              items={[
                { icon: Users, label: `${c.students} students` },
                {
                  icon: ClipboardList,
                  label: c.assignments === 1 ? "1 assignment" : `${c.assignments} assignments`,
                },
              ]}
            />
          </li>
        ))}
      </ul>
      <PlaceholderNote>Fictitious data. Class management arrives in E2.</PlaceholderNote>
    </>
  );
}
