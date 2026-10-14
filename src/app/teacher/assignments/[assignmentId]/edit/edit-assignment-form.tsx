"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { Tag } from "@/components/tag";
import { Button } from "@/components/ui/button";
import { languageLabels, type AssignmentLanguage, type AssignmentLevel } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { ASSIGNMENT_EDIT_VISIBLE_NOTICE, ASSIGNMENT_LOCKED_NOTICE } from "@/lib/texts";
import type { AssignmentValues, EditAssignmentState } from "@/server/assignments/assignments";
import { editAssignmentAction } from "../../actions";
import {
  DeadlineField,
  ErrorSummary,
  focusFirstError,
  LanguageField,
  LevelField,
  TaskFields,
  TitleField,
} from "../../assignment-fields";

export type EditableAssignment = {
  id: string;
  title: string;
  subject: string;
  instructions: string | null;
  level: AssignmentLevel;
  language: AssignmentLanguage;
  /** ISO instant, for display. */
  deadline: string;
  /** The same deadline as a wall time in the single zone, for the input. */
  deadlineWall: string;
  classes: string[];
  locked: boolean;
};

/**
 * ASG-03: before the first submission, every field but the classes (R1);
 * after it, the title and the level only, the task shown as locked (R2).
 * The server applies the same rule whatever this form sends.
 */
export function EditAssignmentForm({ assignment }: { assignment: EditableAssignment }) {
  const [state, formAction, pending] = useActionState<EditAssignmentState, FormData>(editAssignmentAction, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  // After a refusal, what was typed; otherwise the assignment as saved.
  const values: AssignmentValues =
    state.status === "invalid" || state.status === "error"
      ? state.values
      : {
          title: assignment.title,
          subject: assignment.subject,
          level: assignment.level,
          language: assignment.language,
          deadline: assignment.deadlineWall,
          instructions: assignment.instructions ?? "",
          classIds: [],
        };

  useEffect(() => {
    if (state.status === "invalid") focusFirstError(formRef.current, state.fieldErrors);
    else if (state.status !== "idle") noticeRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-3xl flex-col gap-6">
      <input type="hidden" name="assignmentId" value={assignment.id} />
      <div ref={noticeRef} tabIndex={-1} className="flex flex-col gap-4 outline-none empty:hidden">
        {state.status === "done" && (
          <Alert
            tone="info"
            title="Changes saved"
            live
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href={`/teacher/assignments/${assignment.id}`}>Open the assignment</Link>
              </Button>
            }
          >
            {assignment.locked ? "The title and the level are up to date." : ASSIGNMENT_EDIT_VISIBLE_NOTICE}
          </Alert>
        )}
        {state.status === "error" && (
          <Alert tone="error" title="Not saved" live>
            {state.message}
          </Alert>
        )}
      </div>
      <ErrorSummary title="Not saved. Fix the following fields" fieldErrors={fieldErrors} />
      {assignment.locked && (
        <Alert tone="warning" title="Locked by submissions">
          {ASSIGNMENT_LOCKED_NOTICE}
        </Alert>
      )}

      {/* key: refills the fields after a refusal, or with the saved assignment. */}
      <div key={JSON.stringify([state, assignment])} className="flex flex-col gap-6">
        <TitleField defaultValue={values.title} error={fieldErrors.title} />
        {assignment.locked ? (
          <>
            <LockedTask assignment={assignment} />
            <div className="grid gap-6 md:grid-cols-2">
              <LevelField defaultValue={values.level} error={fieldErrors.level} />
            </div>
          </>
        ) : (
          <>
            <TaskFields values={values} fieldErrors={fieldErrors} />
            <div className="grid gap-6 md:grid-cols-2">
              <LevelField defaultValue={values.level} error={fieldErrors.level} />
              <LanguageField defaultValue={values.language} error={fieldErrors.language} />
            </div>
            <DeadlineField defaultValue={values.deadline} error={fieldErrors.deadline} />
          </>
        )}
        <Recipients classes={assignment.classes} />
      </div>

      <div className="flex flex-col gap-2">
        {!assignment.locked && <p className="text-sm text-fg-muted">{ASSIGNMENT_EDIT_VISIBLE_NOTICE}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending} aria-disabled={pending}>
            {pending && <Spinner />}
            {pending ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/teacher/assignments/${assignment.id}`}>Cancel</Link>
          </Button>
        </div>
      </div>
    </form>
  );
}

/** R2: the task as it stands, read only; no input is sent for it. */
function LockedTask({ assignment }: { assignment: EditableAssignment }) {
  const rows = [
    { label: "Subject", value: assignment.subject },
    { label: "Instructions", value: assignment.instructions ?? "None." },
    { label: "Language", value: languageLabels[assignment.language] },
    { label: "Deadline", value: formatDateTime(assignment.deadline) },
  ];
  return (
    <section aria-labelledby="locked-task-title" className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="locked-task-title" className="text-sm font-semibold">
          The task
        </h2>
        <Tag tone="warning" icon={Lock}>
          Locked
        </Tag>
      </div>
      <dl className="flex flex-col gap-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-sm font-semibold text-fg-muted">{label}</dt>
            <dd className="break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** R1: the classes are chosen at creation only (adding one: V2). */
function Recipients({ classes }: { classes: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="label">Classes</p>
      <p className="break-words">{classes.join(", ")}</p>
      <p className="field-hint">The classes are chosen when the assignment is created; they can&rsquo;t be changed.</p>
    </div>
  );
}
