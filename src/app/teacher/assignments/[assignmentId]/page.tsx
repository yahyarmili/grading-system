import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, GraduationCap, Languages, Users, UserRoundX } from "lucide-react";
import { z } from "zod";
import { Alert } from "@/components/alert";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { REVIEW_LIST_PAGE_SIZE } from "@/config/provisional";
import { languageLabels, type AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { arrangeReviewList, parseReviewListQuery } from "@/lib/review-list";
import { ASSIGNMENT_LOCKED_NOTICE, ASSIGNMENT_NOT_DELETED_NOTICE } from "@/lib/texts";
import { getActor } from "@/server/auth/session";
import { getTeacherAssignment } from "@/server/data/assignments/assignments";
import { listAssignmentCopies } from "@/server/data/review/list";
import { relaunchableCopies } from "@/server/review/list";
import { TeacherNotice } from "@/app/teacher/teacher-notice";
import { AssignmentActions } from "./assignment-actions";
import { NoticeArea } from "./notice";
import { RefreshWhileEvaluating } from "./refresh-while";
import { ReviewListOpened } from "./review-list-opened";
import { SubmissionsList } from "./submissions-list";

export const metadata: Metadata = { title: "Assignment" };

type Props = PageProps<"/teacher/assignments/[assignmentId]">;

// ASG-02, ASG-03, REV-01: one of the teacher's assignments, its submissions,
// then its task. Another teacher's assignment, or one that does not exist,
// answers 404 alike (AUTH-04 R3). The check runs before any streaming, which
// would fix the status at 200: the page blocks on it.
export const instant = false;

export default async function Page({ params, searchParams }: Props) {
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
      <div className="flex flex-col gap-6">
        {assignment.locked && (
          <Alert tone="warning" title="Locked by submissions" className="max-w-3xl">
            {ASSIGNMENT_LOCKED_NOTICE} {ASSIGNMENT_NOT_DELETED_NOTICE}
          </Alert>
        )}

        <section aria-labelledby="submissions-title" className="flex flex-col gap-3">
          <Suspense
            fallback={
              <>
                <h2 id="submissions-title" className="text-base font-semibold">
                  Submissions
                </h2>
                <div className="card">
                  <LoadingState label="Loading submissions…" />
                </div>
              </>
            }
          >
            <Submissions assignmentId={assignment.id} language={assignment.language} searchParams={searchParams} />
          </Suspense>
        </section>

        <section aria-labelledby="task-title" className="card flex max-w-3xl flex-col gap-4 p-5">
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
      </div>
    </>
  );
}

/** REV-01: the whole list read once, then filtered, sorted and cut here, on the server. */
async function Submissions({
  assignmentId,
  language,
  searchParams,
}: { assignmentId: string; language: AssignmentLanguage } & Pick<Props, "searchParams">) {
  const actor = await getActor();
  const copies = await listAssignmentCopies(actor, assignmentId);
  // The section keeps its title (aria-labelledby) whatever it shows instead of the list.
  const title = (
    <h2 id="submissions-title" className="text-base font-semibold">
      Submissions
    </h2>
  );
  // Deleted meanwhile: the 404 was decided above, the section says it.
  if (!copies)
    return (
      <>
        {title}
        <p className="text-fg-muted">This assignment was not found. It may have been deleted.</p>
      </>
    );
  // NFR-DON-04 (E7.7): the server returns no copy before the teacher notice is read.
  if (copies === "notice_required")
    return (
      <>
        {title}
        <TeacherNotice />
      </>
    );

  const query = parseReviewListQuery(await searchParams, copies.classes.map((c) => c.id));
  const list = arrangeReviewList(copies.rows, query, REVIEW_LIST_PAGE_SIZE);
  const submitted = copies.rows.filter((r) => r.status !== "to_submit").length;
  // PRC-02 R4, CA3: read only when a line may be offered (C8b), the refreshes while a copy is evaluated included.
  const relaunchable = await relaunchableCopies(actor, assignmentId, language, copies.rows);
  // E7.6: a copy under way, or a request waiting, shows its outcome without a reload.
  const underWay = copies.rows.some((r) => r.requested || r.status === "received" || r.status === "evaluating");

  return (
    <>
      <ReviewListOpened assignmentId={assignmentId} stamp={copies.stamp} />
      {underWay && <RefreshWhileEvaluating />}
      <h2 id="submissions-title" className="text-base font-semibold">
        Submissions{" "}
        <span className="font-normal text-fg-muted">
          · {submitted} of {copies.rows.length} submitted
        </span>
      </h2>
      {copies.rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={UserRoundX}
            title="No students yet"
            description="Students who join the recipient classes will appear here, with their submissions."
          />
        </div>
      ) : (
        <NoticeArea>
          <SubmissionsList
            assignmentId={assignmentId}
            rows={list.rows}
            total={list.total}
            counts={list.counts}
            query={{ ...query, page: list.page }}
            classes={copies.classes}
            pageSize={REVIEW_LIST_PAGE_SIZE}
            relaunchable={relaunchable}
          />
        </NoticeArea>
      )}
    </>
  );
}
