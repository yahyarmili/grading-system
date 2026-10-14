import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import { instantToWallTime } from "@/lib/time-zone";
import { getActor } from "@/server/auth/session";
import { getTeacherAssignment } from "@/server/data/assignments/assignments";
import { EditAssignmentForm } from "./edit-assignment-form";

export const metadata: Metadata = { title: "Edit assignment" };

// ASG-03: the edit of one of the teacher's assignments; 404 for another
// teacher's or a missing one, checked before any streaming (see the page above).
export const instant = false;

export default async function Page({ params }: PageProps<"/teacher/assignments/[assignmentId]/edit">) {
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const assignment = await getTeacherAssignment(await getActor(), assignmentId);
  if (!assignment) notFound();

  return (
    <>
      <BackLink href={`/teacher/assignments/${assignment.id}`}>{assignment.title}</BackLink>
      <PageHeader title="Edit assignment" />
      <EditAssignmentForm
        assignment={{
          id: assignment.id,
          title: assignment.title,
          subject: assignment.subject,
          instructions: assignment.instructions,
          level: assignment.level,
          language: assignment.language,
          deadline: assignment.deadline,
          // The form shows the deadline as it was typed: a wall time in the single zone.
          deadlineWall: instantToWallTime(new Date(assignment.deadline), DEADLINE_TIME_ZONE),
          classes: assignment.classes,
          locked: assignment.locked,
        }}
      />
    </>
  );
}
