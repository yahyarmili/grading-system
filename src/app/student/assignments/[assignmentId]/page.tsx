import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Languages } from "lucide-react";
import { z } from "zod";
import { FreshnessGuard } from "@/components/freshness-guard";
import { BackLink, PageHeader } from "@/components/shell/shell-parts";
import { LateTag } from "@/components/status-tag";
import { languageLabels, type AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { getActor } from "@/server/auth/session";
import { getStudentAssignment } from "@/server/data/assignments/assignments";
import { getNoticeAcknowledgement } from "@/server/data/notices/notices";
import { getOwnDraft } from "@/server/data/submissions/drafts";
import { getOwnSubmission, type OwnSubmission } from "@/server/data/submissions/student";
import { viewToken } from "@/server/results/freshness";
import { checkAssignmentFreshnessAction } from "./actions";
import { SubmissionPanel } from "./submission-panel";

export const metadata: Metadata = { title: "Assignment" };

// SUB-02: one assignment and the student's text. An assignment that does not
// exist, or that the student did not receive, answers 404 alike (AUTH-04 R3);
// the check runs before any streaming, which would fix the status at 200.
// Once submitted, the student reads their text back as sent (SUB-01 R2, E8.3).
export const instant = false;

export default async function Page({ params }: PageProps<"/student/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const actor = await getActor();
  const assignment = await getStudentAssignment(actor, assignmentId);
  if (!assignment) notFound();
  // NFR-DON-04: before the first submission, and before pages sent in its place (AC-17).
  const mayHandIn = assignment.canSubmit || assignment.canReplace;
  const [noticeRead, submission, draft] = await Promise.all([
    !mayHandIn || getNoticeAcknowledgement(actor).then((read) => read !== null),
    assignment.submittedAt ? getOwnSubmission(actor, assignment.id) : null,
    // E9: the pages not sent yet, before the first submission or for a replacement (AC-10).
    mayHandIn ? getOwnDraft(actor, assignment.id) : null,
  ]);

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
      {/* PUB-01 CA3 (E8.7): shown again by back or forward, the state is checked first; the text typed is kept. */}
      <FreshnessGuard
        renderId={randomUUID()}
        check={checkAssignmentFreshnessAction.bind(null, assignment.id, viewToken(assignment))}
        label="Checking the assignment…"
        className="flex max-w-2xl flex-col gap-5"
      >
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
          imagesRequestId={randomUUID()}
          replaceRequestId={randomUUID()}
          status={assignment.status}
          mode={submission?.mode ?? null}
          draft={draft}
          submittedAt={assignment.submittedAt}
          late={assignment.late}
          lastVersionAt={assignment.lastVersionAt}
          replacementsLeft={assignment.replacementsLeft}
          canReplace={assignment.canReplace}
          canSubmit={assignment.canSubmit}
          noticeRead={noticeRead}
          readBack={submission && <ReadBack submission={submission} language={assignment.language} />}
        />
      </FreshnessGuard>
    </>
  );
}

/**
 * SUB-01 R2: the text of the active version, as sent; nothing of its
 * processing. Images (E9, AC-14): the pages, through the image route, and the
 * transcription the student confirmed.
 */
function ReadBack({ submission, language }: { submission: OwnSubmission; language: AssignmentLanguage }) {
  return (
    <section aria-labelledby="your-submission-title" className="card flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 id="your-submission-title" className="text-base font-semibold">
          Your submission
        </h2>
        <p className="text-sm text-fg-muted">
          {submission.lastVersionAt === submission.submittedAt
            ? `As you sent it on ${formatDateTime(submission.submittedAt)}.`
            : `The ${submission.mode === "images" ? "pages" : "text"} you sent last, on ${formatDateTime(submission.lastVersionAt)}.`}
        </p>
      </div>
      {submission.mode === "images" && (
        <ol aria-label="Your pages" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {submission.pages.map((page) => (
            <li key={page.id}>
              <a href={`/api/pages/${page.id}`} target="_blank" rel="noopener" className="block rounded-md focus-visible:outline-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a private page, never optimized nor cached */}
                <img src={`/api/pages/${page.id}`} alt={`Page ${page.position}`} className="aspect-[3/4] w-full rounded-md border border-border-subtle object-cover" />
              </a>
            </li>
          ))}
        </ol>
      )}
      {submission.text !== null && (
        <div className="flex flex-col gap-1">
          {submission.mode === "images" && <h3 className="text-sm font-semibold text-fg-muted">The reading you checked</h3>}
          <p lang={language} className="rounded-md border border-border-subtle bg-surface-muted p-3 break-words whitespace-pre-wrap">
            {submission.text}
          </p>
        </div>
      )}
    </section>
  );
}
