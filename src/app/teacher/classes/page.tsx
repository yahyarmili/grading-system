import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarDays, School, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { MetaList, PageHeader } from "@/components/shell/shell-parts";
import { getActor } from "@/server/auth/session";
import { listClasses } from "@/server/data/classes/classes";
import { NewClassDialog } from "./new-class-dialog";

export const metadata: Metadata = { title: "Classes" };

// CLS-01: the teacher's own classes only; the data layer filters on the owner.

// Time zone not decided yet (NFR-USA-02): dates are shown in UTC.
const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const students = (n: number) => (n === 1 ? "1 student" : `${n} students`);

export default function Page() {
  return (
    <>
      <PageHeader title="Classes" actions={<NewClassDialog />} />
      <Suspense fallback={<LoadingState label="Loading classes…" />}>
        <ClassList />
      </Suspense>
    </>
  );
}

async function ClassList() {
  const list = await listClasses(await getActor());
  if (list.role !== "teacher") return null;

  if (list.classes.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={School}
          title="No classes yet"
          description="Create a class, then share its link or code with your students. They join at once, without approval."
          action={<NewClassDialog variant="outline" />}
        />
      </div>
    );
  }

  return (
    <>
      <MetaList className="mb-4" items={[{ icon: School, label: list.classes.length === 1 ? "1 class" : `${list.classes.length} classes` }]} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.classes.map((c) => (
          <li key={c.id} className="card flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold break-words">{c.name}</h2>
            <MetaList
              items={[
                { icon: Users, label: students(c.activeStudents) },
                { icon: CalendarDays, label: `Created ${day.format(new Date(c.createdAt))}` },
              ]}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
