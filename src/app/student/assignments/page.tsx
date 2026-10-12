import type { Metadata } from "next";
import { CalendarClock, Users } from "lucide-react";
import { MetaList, PageHeader, PlaceholderNote } from "@/components/shell/shell-parts";
import { LateTag, StudentStatusTag } from "@/components/status-tag";
import { mockStudentAssignments } from "@/mock/data";

export const metadata: Metadata = { title: "My assignments" };

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

type Item = (typeof mockStudentAssignments)[number];

function AssignmentCard({ a }: { a: Item }) {
  return (
    <li className="card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{a.title}</h3>
        <div className="flex flex-wrap gap-1">
          {/* In the "To submit" group, the heading already says it. */}
          {a.status !== "to_submit" && <StudentStatusTag status={a.status} />}
          {a.late && <LateTag />}
        </div>
      </div>
      <MetaList
        className="text-sm"
        items={[
          { icon: CalendarClock, label: `Due ${dateFormat.format(new Date(a.due))}` },
          { icon: Users, label: a.className },
        ]}
      />
    </li>
  );
}

function Group({ id, title, items }: { id: string; title: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h2 id={`${id}-title`} className="text-sm font-semibold text-fg-muted">
        {title} <span className="tabular-nums">({items.length})</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((a) => (
          <AssignmentCard key={a.id} a={a} />
        ))}
      </ul>
    </section>
  );
}

export default function Page() {
  // Most urgent first: what is still to submit, by deadline; then what was submitted, latest first.
  const toSubmit = mockStudentAssignments
    .filter((a) => a.status === "to_submit")
    .sort((a, b) => a.due.localeCompare(b.due));
  const submitted = mockStudentAssignments
    .filter((a) => a.status !== "to_submit")
    .sort((a, b) => b.due.localeCompare(a.due));

  return (
    <>
      <PageHeader title="My assignments" />
      <div className="flex flex-col gap-6">
        <Group id="to-submit" title="To submit" items={toSubmit} />
        <Group id="submitted" title="Submitted" items={submitted} />
      </div>
      <PlaceholderNote>Fictitious data. Submitting arrives in E3.</PlaceholderNote>
    </>
  );
}
