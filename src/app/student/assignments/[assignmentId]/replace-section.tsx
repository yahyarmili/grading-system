"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import type { AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import {
  NO_REPLACEMENT_LEFT_NOTICE,
  REPLACEMENT_CLOSED_NOTICE,
  REPLACEMENT_KEEPS_DATE_NOTICE,
  replacementsLeftNotice,
  TEXT_KEPT_AS_WRITTEN_NOTICE,
} from "@/lib/texts";
import type { ReplaceTextState } from "@/server/submissions/submissions";
import { replaceTextAction } from "./actions";
import { NoNameInstruction, TextField } from "./text-field";

// SUB-05: replace the submission with a new text while the teacher has
// neither changed nor validated it, 2 times at most (Q3 [D]). The previous
// text is kept for the teacher; the student reads back the active one
// (SUB-01 R2, E8.3).

export function ReplaceSection({
  assignmentId,
  language,
  requestId,
  replacementsLeft,
  canReplace,
}: {
  assignmentId: string;
  language: AssignmentLanguage;
  /** One per page shown, other than the first submission's. */
  requestId: string;
  replacementsLeft: number;
  canReplace: boolean;
}) {
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState<ReplaceTextState, FormData>(replaceTextAction, {
    status: "idle",
  });
  // The state the form was opened at: a new "done" closes it; a refusal keeps it open with the text.
  const [openedAt, setOpenedAt] = useState<ReplaceTextState | null>(null);
  const open = openedAt !== null && !(state.status === "done" && state !== openedAt);
  const setOpen = (value: boolean) => {
    if (value) setText("");
    setOpenedAt(value ? state : null);
  };
  const textRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.status === "done") resultRef.current?.focus();
    if (state.status === "invalid") textRef.current?.focus();
    if (state.status === "error") resultRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open]);

  const result =
    state.status === "done" ? (
      <Alert tone="info" title="Submission replaced" live>
        Your new text was submitted on {formatDateTime(state.replacedAt)}.
      </Alert>
    ) : state.status === "error" ? (
      <Alert tone={state.reason === "notAllowed" ? "error" : "warning"} title="Your submission was not replaced" live>
        {state.message}
      </Alert>
    ) : null;

  return (
    <section aria-labelledby="replace-title" className="card flex flex-col gap-4 p-4">
      <h2 id="replace-title" className="text-base font-semibold">
        Replace my submission
      </h2>
      <div ref={resultRef} tabIndex={-1} className="outline-none empty:hidden">
        {result}
      </div>

      {!canReplace ? (
        <p className="text-fg-muted">{replacementsLeft === 0 ? NO_REPLACEMENT_LEFT_NOTICE : REPLACEMENT_CLOSED_NOTICE}</p>
      ) : !open ? (
        <>
          <p>{replacementsLeftNotice(replacementsLeft)}</p>
          <p className="text-sm text-fg-muted">{REPLACEMENT_KEEPS_DATE_NOTICE}</p>
          <Button
            ref={openRef}
            variant="outline"
            onClick={() => setOpen(true)}
            className="w-full sm:w-auto sm:self-start"
          >
            <RefreshCw aria-hidden="true" />
            Replace my submission
          </Button>
        </>
      ) : (
        <form action={formAction} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="requestId" value={requestId} />
          <NoNameInstruction />
          <TextField
            id="replacement-text"
            label="Your new text"
            text={text}
            onText={setText}
            textRef={textRef}
            language={language}
            error={state.status === "invalid" ? state.error : undefined}
          />
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
            <li>{replacementsLeftNotice(replacementsLeft)}</li>
            <li>{REPLACEMENT_KEEPS_DATE_NOTICE}</li>
            <li>{TEXT_KEPT_AS_WRITTEN_NOTICE}</li>
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full sm:w-auto">
              {pending && <Spinner />}
              {pending ? "Submitting…" : "Submit the new text"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                // Back to the button that opened the form.
                requestAnimationFrame(() => openRef.current?.focus());
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
