"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, UserX } from "lucide-react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import { StudentStatusTag } from "@/components/status-tag";
import { Button } from "@/components/ui/button";
import { SUBMISSION_TEXT_MAX_LENGTH } from "@/config/decisions";
import type { AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import type { StudentStatus } from "@/lib/submission-status";
import { countCharacters, normalizeLineEndings } from "@/lib/submission-text";
import {
  NO_NAME_INSTRUCTION,
  NO_READ_BACK_NOTICE,
  SUBMITTED_NO_READ_BACK_NOTICE,
  SUBMISSION_TEXT_LIMIT_NOTICE,
  TEXT_KEPT_AS_WRITTEN_NOTICE,
} from "@/lib/texts";
import type { SubmitTextState } from "@/server/submissions/submissions";
import { submitTextAction } from "./actions";
import { StudentNotice } from "./student-notice";

// SUB-02: the text box before the first submission, the dated confirmation
// after it. The text is never shown again once submitted (A3).

const number = (n: number) => n.toLocaleString("en-US");

export function SubmissionPanel({
  assignmentId,
  language,
  contentVersion,
  requestId,
  status,
  submittedAt,
  canSubmit,
  noticeRead,
}: {
  assignmentId: string;
  language: AssignmentLanguage;
  contentVersion: number;
  requestId: string;
  status: StudentStatus;
  submittedAt: string | null;
  canSubmit: boolean;
  /** NFR-DON-04: the notice in force was read; until then, it comes first. */
  noticeRead: boolean;
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
      <Submitted
        ref={doneRef}
        submittedAt={done}
        status={status === "to_submit" ? "being_marked" : status}
        announce={state.status === "done"}
      />
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

      {/* Q10 [D]: the instruction alone, before sending. */}
      <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5">
        <UserX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-fg" />
        <p className="font-semibold">{NO_NAME_INSTRUCTION}</p>
      </div>

      {refusal}

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <input type="hidden" name="contentVersion" value={contentVersion} />
        <input type="hidden" name="requestId" value={requestId} />
        <TextField
          text={text}
          onText={setText}
          textRef={textRef}
          language={language}
          error={state.status === "invalid" ? state.error : undefined}
        />
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
          <li>{TEXT_KEPT_AS_WRITTEN_NOTICE}</li>
          <li>{NO_READ_BACK_NOTICE}</li>
        </ul>
        <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full sm:w-auto sm:self-start">
          {pending && <Spinner />}
          {pending ? "Submitting…" : "Submit my text"}
        </Button>
      </form>
    </section>
  );
}

/**
 * NFR-TRT-02: no autocorrect, spellcheck or capitalization by the device.
 * No maxLength: it would cut a pasted text silently; the counter says how far
 * over the limit it is, and the server refuses it (SUB-02 R1).
 */
function TextField({
  text,
  onText,
  textRef,
  language,
  error,
}: {
  text: string;
  onText: (text: string) => void;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  language: AssignmentLanguage;
  error?: string;
}) {
  // Controlled: React resets a form's fields after its action; a refused text must stay.
  const count = countCharacters(normalizeLineEndings(text));
  const over = count - SUBMISSION_TEXT_MAX_LENGTH;
  return (
    <div className="flex flex-col gap-1.5">
      <FormField label="Your text" required hint={SUBMISSION_TEXT_LIMIT_NOTICE} error={error}>
        <textarea
          ref={textRef}
          id="submission-text"
          name="text"
          lang={language}
          rows={12}
          className="input min-h-60 resize-y"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-gramm="false"
          value={text}
          onChange={(e) => onText(e.target.value)}
        />
      </FormField>
      <p className="flex items-center justify-end gap-1 text-sm tabular-nums">
        {over > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-danger-fg">
            <CircleAlert aria-hidden="true" className="size-4" />
            {number(over)} {over === 1 ? "character" : "characters"} too many
          </span>
        ) : (
          <span className="text-fg-muted">
            {number(count)} / {number(SUBMISSION_TEXT_MAX_LENGTH)} characters
          </span>
        )}
      </p>
      {/* Said once when the limit is crossed, not at each key. */}
      <p className="sr-only" aria-live="polite">
        {over > 0 ? `Your text is over the limit of ${number(SUBMISSION_TEXT_MAX_LENGTH)} characters.` : ""}
      </p>
    </div>
  );
}

/** SUB-02 CA1: the dated confirmation, then the state in the closed list of three. */
function Submitted({
  ref,
  submittedAt,
  status,
  announce,
}: {
  ref: React.Ref<HTMLDivElement>;
  submittedAt: string;
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
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">State:</span>
        <StudentStatusTag status={status} />
      </div>
      <p className="text-sm text-fg-muted">{SUBMITTED_NO_READ_BACK_NOTICE}</p>
      <Button variant="outline" asChild className="w-full sm:w-auto sm:self-start">
        <Link href="/student/assignments">Back to My assignments</Link>
      </Button>
    </section>
  );
}
