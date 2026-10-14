import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, GraduationCap, Inbox, Languages, Users } from "lucide-react";
import { z } from "zod";
import { Alert } from "@/components/alert";
import { EmptyState } from "@/components/empty-state";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { languageLabels } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { ASSIGNMENT_LOCKED_NOTICE, ASSIGNMENT_NOT_DELETED_NOTICE } from "@/lib/texts";
import { getActor } from "@/server/auth/session";
import { getTeacherAssignment } from "@/server/data/assignments/assignments";
import { AssignmentActions } from "./assignment-actions";

export const metadata: Metadata = { title: "Assignment" };

// ASG-02, ASG-03: one of the teacher's assignments, with Edit and Delete.
// Another teacher's assignment, or one that does not exist, answers 404 alike
// (AUTH-04 R3). The check runs before any streaming, which would fix the
// status at 200: the page blocks on it.
export const instant = false;

export default async function Page({ params }: PageProps<"/teacher/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const assignment = await getTeacherAssignment(await getActor(), assignmentId);
  if (!assignment) notFound();

  return (
    <>
      <BackLink href="/teacher/assignments">Assignments</BackLink>
      <PageHeader
        title={assignment.title}
        meta={[
          { icon: Users, label: assignment.classes.join(", ") },
          { icon: Languages, label: languageLabels[assignment.language] },
          { icon: GraduationCap, label: `Level ${assignment.level}` },
          { icon: CalendarClock, label: `Due ${formatDateTime(assignment.deadline)}` },
        ]}
        actions={<AssignmentActions id={assignment.id} title={assignment.title} locked={assignment.locked} />}
      />
      <div className="flex max-w-3xl flex-col gap-6">
        {assignment.locked && (
          <Alert tone="warning" title="Locked by submissions">
            {ASSIGNMENT_LOCKED_NOTICE} {ASSIGNMENT_NOT_DELETED_NOTICE}
          </Alert>
        )}
        <section aria-labelledby="task-title" className="card flex flex-col gap-4 p-5">
          <h2 id="task-title" className="text-base font-semibold">
            The task
          </h2>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-fg-muted">Subject</h3>
            <p className="break-words whitespace-pre-wrap">{assignment.subject}</p>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-fg-muted">Instructions</h3>
            {assignment.instructions ? (
              <p className="break-words whitespace-pre-wrap">{assignment.instructions}</p>
            ) : (
              <p className="text-fg-muted">None.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="submissions-title" className="flex flex-col gap-3">
          <h2 id="submissions-title" className="text-base font-semibold">
            Submissions
          </h2>
          {/* Submissions arrive in E4; their list, sorted and filtered, in E7 (REV-01). */}
          <div className="card">
            <EmptyState
              icon={Inbox}
              title="No submissions yet"
              description="Your students' submissions will appear here."
            />
          </div>
        </section>
      </div>
    </>
  );
}
