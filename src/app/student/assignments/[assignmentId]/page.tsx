import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Languages } from "lucide-react";
import { z } from "zod";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { LateTag } from "@/components/status-tag";
import { languageLabels } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { getActor } from "@/server/auth/session";
import { getStudentAssignment } from "@/server/data/assignments/assignments";
import { getNoticeAcknowledgement } from "@/server/data/notices/notices";
import { SubmissionPanel } from "./submission-panel";

export const metadata: Metadata = { title: "Assignment" };

// SUB-02: one assignment and the student's text. An assignment that does not
// exist, or that the student did not receive, answers 404 alike (AUTH-04 R3);
// the check runs before any streaming, which would fix the status at 200.
// The student never reads their text back (A3): the page has no access to it.
export const instant = false;

export default async function Page({ params }: PageProps<"/student/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const actor = await getActor();
  const assignment = await getStudentAssignment(actor, assignmentId);
  if (!assignment) notFound();
  // NFR-DON-04: before the first submission only.
  const noticeRead = !assignment.canSubmit || (await getNoticeAcknowledgement(actor)) !== null;

  return (
    <>
      <BackLink href="/student/assignments">My assignments</BackLink>
      <PageHeader
        title={assignment.title}
        meta={[
          { icon: CalendarClock, label: `Due ${formatDateTime(assignment.deadline)}` },
          { icon: Languages, label: languageLabels[assignment.language] },
        ]}
      />
      <div className="flex max-w-2xl flex-col gap-5">
        <section aria-labelledby="task-title" className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="task-title" className="text-base font-semibold">
              The task
            </h2>
            {assignment.status === "to_submit" && assignment.deadlinePassed && <LateTag submitted={false} />}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-fg-muted">Subject</h3>
            <p className="break-words whitespace-pre-wrap">{assignment.subject}</p>
          </div>
          {assignment.instructions && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-fg-muted">Instructions</h3>
              <p className="break-words whitespace-pre-wrap">{assignment.instructions}</p>
            </div>
          )}
        </section>

        <SubmissionPanel
          assignmentId={assignment.id}
          language={assignment.language}
          contentVersion={assignment.contentVersion}
          // One per page shown: a double click or a resend after a network cut is the same submission.
          requestId={randomUUID()}
          status={assignment.status}
          submittedAt={assignment.submittedAt}
          canSubmit={assignment.canSubmit}
          noticeRead={noticeRead}
        />
      </div>
    </>
  );
}
