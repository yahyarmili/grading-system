import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, ClipboardList, Languages, School } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { MetaList, PageHeader } from "@/components/shell/shell-parts";
import { LateTag, StudentStatusTag } from "@/components/status-tag";
import { Button } from "@/components/ui/button";
import { languageLabels } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { studentStatuses, studentStatusLabels, type StudentStatus } from "@/lib/submission-status";
import { getActor } from "@/server/auth/session";
import { listStudentAssignments, type StudentAssignment } from "@/server/data/assignments/assignments";
import { listClasses } from "@/server/data/classes/classes";

export const metadata: Metadata = { title: "My assignments" };

// SUB-01: the assignments received through the student's active classes,
// each once, with its state in the closed list of three (R3). The data layer
// sends nothing else: no level, no class, no internal state.

export default function Page() {
  return (
    <>
      <PageHeader title="My assignments" />
      <Suspense fallback={<LoadingState label="Loading your assignments…" />}>
        <AssignmentList />
      </Suspense>
    </>
  );
}

/** Most urgent first: still to submit by nearest deadline; the others latest first. */
const order = (status: StudentStatus) => (a: StudentAssignment, b: StudentAssignment) =>
  status === "to_submit" ? a.deadline.localeCompare(b.deadline) : b.deadline.localeCompare(a.deadline);

async function AssignmentList() {
  const actor = await getActor();
  const assignments = await listStudentAssignments(actor);

  if (assignments.length === 0) {
    // CA3: without a class, say how to get one; with classes, nothing was sent yet.
    const classes = await listClasses(actor);
    const inAClass = classes.role === "student" && classes.classes.length > 0;
    return (
      <div className="card">
        {inAClass ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description="Your teachers' assignments will appear here as soon as they send them."
          />
        ) : (
          <EmptyState
            icon={School}
            title="You are not in a class yet"
            description="Assignments come from your classes. Join your teacher's class with the link or code they gave you."
            action={
              <Button asChild>
                <Link href="/student/classes">Join a class</Link>
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {studentStatuses.map((status) => (
        <Group
          key={status}
          status={status}
          items={assignments.filter((a) => a.status === status).sort(order(status))}
        />
      ))}
    </div>
  );
}

function Group({ status, items }: { status: StudentStatus; items: StudentAssignment[] }) {
  if (items.length === 0) return null;
  const id = `group-${status}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-sm font-semibold text-fg-muted">
        {studentStatusLabels[status]} <span className="tabular-nums">({items.length})</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((a) => (
          <AssignmentCard key={a.id} a={a} />
        ))}
      </ul>
    </section>
  );
}

function AssignmentCard({ a }: { a: StudentAssignment }) {
  const titleId = `assignment-${a.id}`;
  return (
    <li aria-labelledby={titleId} className="card flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 id={titleId} className="min-w-0 text-base font-semibold break-words">
            {a.title}
          </h3>
          <div className="flex flex-wrap gap-1">
            {/* In its group, the heading already says the state. */}
            {a.status !== "to_submit" && <StudentStatusTag status={a.status} />}
            {a.status === "to_submit" && a.deadlinePassed && <LateTag submitted={false} />}
          </div>
        </div>
        <MetaList
          className="text-sm"
          items={[
            { icon: CalendarClock, label: `Due ${formatDateTime(a.deadline)}` },
            { icon: Languages, label: languageLabels[a.language] },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-fg-muted">Subject</h4>
        <p className="break-words whitespace-pre-wrap">{a.subject}</p>
      </div>
      {/* CA3 of ASG-01: no instructions, no empty block. */}
      {a.instructions && (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-fg-muted">Instructions</h4>
          <p className="break-words whitespace-pre-wrap">{a.instructions}</p>
        </div>
      )}
      {/* SUB-02: to submit, the text box; after, the dated confirmation. */}
      <Button asChild variant={a.status === "to_submit" ? "default" : "outline"} className="w-full sm:w-auto sm:self-start">
        <Link href={`/student/assignments/${a.id}`} aria-describedby={titleId}>
          {a.status === "to_submit" ? "Write my text" : "Open the assignment"}
        </Link>
      </Button>
    </li>
  );
}
