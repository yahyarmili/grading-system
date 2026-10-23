"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { LateTag, StudentStatusTag } from "@/components/status-tag";
import { Button } from "@/components/ui/button";
import type { AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import type { StudentStatus } from "@/lib/submission-status";
import { READ_BACK_NOTICE, TEXT_KEPT_AS_WRITTEN_NOTICE } from "@/lib/texts";
import type { SubmitTextState } from "@/server/submissions/submissions";
import { submitTextAction } from "./actions";
import { ReplaceSection } from "./replace-section";
import { StudentNotice } from "./student-notice";
import { NoNameInstruction, TextField } from "./text-field";

// SUB-02: the text box before the first submission, the dated confirmation
// after it, the text as sent (SUB-01 R2, E8.3), then the replacement (SUB-05).

export function SubmissionPanel({
  assignmentId,
  language,
  contentVersion,
  requestId,
  replaceRequestId,
  status,
  submittedAt,
  late,
  lastVersionAt,
  replacementsLeft,
  canReplace,
  canSubmit,
  noticeRead,
  readBack,
}: {
  assignmentId: string;
  language: AssignmentLanguage;
  contentVersion: number;
  requestId: string;
  replaceRequestId: string;
  status: StudentStatus;
  submittedAt: string | null;
  /** SUB-04: the first submission came after the deadline. */
  late: boolean;
  lastVersionAt: string | null;
  replacementsLeft: number;
  canReplace: boolean;
  canSubmit: boolean;
  /** NFR-DON-04: the notice in force was read; until then, it comes first. */
  noticeRead: boolean;
  /** SUB-01 R2: the text as sent, rendered by the server once the page knows the submission. */
  readBack?: React.ReactNode;
}) {
  // Kept here: the text survives the notice shown again (a new version) and a refusal.
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState<SubmitTextState, FormData>(submitTextAction, {
    status: "idle",
  });
  const doneRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.status === "done") doneRef.current?.focus();
    if (state.status === "invalid") textRef.current?.focus();
  }, [state]);

  const done = state.status === "done" ? state.submittedAt : submittedAt;
  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <Submitted
          ref={doneRef}
          submittedAt={done}
          lastVersionAt={lastVersionAt}
          late={state.status === "done" ? state.late : late}
          status={status === "to_submit" ? "being_marked" : status}
          announce={state.status === "done"}
          assignmentId={assignmentId}
        />
        {readBack}
        {/* Once the page knows the submission (after its refresh). */}
        {submittedAt && (
          <ReplaceSection
            assignmentId={assignmentId}
            language={language}
            requestId={replaceRequestId}
            replacementsLeft={replacementsLeft}
            canReplace={canReplace}
          />
        )}
      </div>
    );
  }

  if (!canSubmit) {
    return (
      <Alert tone="warning" title="You can't submit for this assignment">
        You may no longer be in the class it was sent to.
      </Alert>
    );
  }

  const refusal = state.status === "error" && (
    <Alert tone={state.reason === "changed" || state.reason === "noticeNotRead" ? "warning" : "error"} title="Your text was not submitted" live>
      {state.message}
    </Alert>
  );

  if (!noticeRead) {
    return (
      <div className="flex flex-col gap-4">
        {refusal}
        <StudentNotice />
      </div>
    );
  }

  return (
    <section aria-labelledby="your-text-title" className="card flex flex-col gap-4 p-4">
      <h2 id="your-text-title" className="text-base font-semibold">
        Submit your text
      </h2>

      <NoNameInstruction />

      {refusal}

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <input type="hidden" name="contentVersion" value={contentVersion} />
        <input type="hidden" name="requestId" value={requestId} />
        <TextField
          id="submission-text"
          label="Your text"
          text={text}
          onText={setText}
          textRef={textRef}
          language={language}
          error={state.status === "invalid" ? state.error : undefined}
        />
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
          <li>{TEXT_KEPT_AS_WRITTEN_NOTICE}</li>
          <li>{READ_BACK_NOTICE}</li>
        </ul>
        <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full sm:w-auto sm:self-start">
          {pending && <Spinner />}
          {pending ? "Submitting…" : "Submit my text"}
        </Button>
      </form>
    </section>
  );
}

/** SUB-02 CA1: the dated confirmation, then the state in the closed list of three. */
function Submitted({
  ref,
  submittedAt,
  lastVersionAt,
  late,
  status,
  announce,
  assignmentId,
}: {
  ref: React.Ref<HTMLDivElement>;
  assignmentId: string;
  submittedAt: string;
  /** The active version, when a replacement made it differ from the first. */
  lastVersionAt: string | null;
  late: boolean;
  status: StudentStatus;
  announce: boolean;
}) {
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="submitted-title"
      className="card flex flex-col gap-4 p-4 outline-none"
    >
      <div role={announce ? "status" : undefined} className="flex items-start gap-2">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-fg" />
        <div className="flex flex-col gap-1">
          <h2 id="submitted-title" className="text-base font-semibold">
            Text submitted
          </h2>
          <p>Submitted on {formatDateTime(submittedAt)}.</p>
          {lastVersionAt && lastVersionAt !== submittedAt && (
            <p>Last replaced on {formatDateTime(lastVersionAt)}.</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">State:</span>
        <StudentStatusTag status={status} />
        {late && <LateTag />}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* PUB-02: the result, once published only; never prefetched (E8 plan §5). */}
        {status === "marked" && (
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/student/assignments/${assignmentId}/result`} prefetch={false}>
              See your result
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link href="/student/assignments">Back to My assignments</Link>
        </Button>
      </div>
    </section>
  );
}
