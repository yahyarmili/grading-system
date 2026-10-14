"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarClock, CircleCheck, Users } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { MetaList } from "@/components/shell/shell-parts";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import type { AssignmentValues, CreateAssignmentState } from "@/server/assignments/assignments";
import { createAssignmentAction } from "../actions";
import {
  ChoiceGroup,
  DeadlineField,
  ErrorSummary,
  fieldId,
  focusFirstError,
  LanguageField,
  LevelField,
  TaskFields,
  TitleField,
} from "../assignment-fields";

type ClassOption = { id: string; name: string };
const EMPTY: AssignmentValues = {
  title: "",
  subject: "",
  level: "",
  language: "",
  deadline: "",
  instructions: "",
  classIds: [],
};

/** ASG-01: creation form; after a creation, a summary replaces it. */
export function NewAssignmentForm({ classes }: { classes: ClassOption[] }) {
  // A new, empty form for "Create another assignment".
  const [round, setRound] = useState(0);
  return <CreateForm key={round} classes={classes} onAgain={() => setRound((r) => r + 1)} />;
}

function CreateForm({ classes, onAgain }: { classes: ClassOption[]; onAgain: () => void }) {
  const [state, formAction, pending] = useActionState<CreateAssignmentState, FormData>(createAssignmentAction, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const values = state.status === "invalid" || state.status === "error" ? state.values : EMPTY;

  useEffect(() => {
    if (state.status === "done") doneRef.current?.focus();
    if (state.status === "invalid") focusFirstError(formRef.current, state.fieldErrors);
  }, [state]);

  if (state.status === "done") {
    const sentTo = classes.filter((c) => state.classIds.includes(c.id)).map((c) => c.name);
    return (
      <div ref={doneRef} tabIndex={-1} className="card flex max-w-3xl flex-col gap-4 p-5 outline-none">
        <div role="status" className="flex items-start gap-2">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-fg" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">Assignment “{state.title}” created</p>
            <MetaList
              items={[
                { icon: CalendarClock, label: `Due ${formatDateTime(state.deadline)}` },
                { icon: Users, label: `Sent to ${sentTo.join(", ")}` },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/teacher/assignments/${state.assignmentId}`}>Open the assignment</Link>
          </Button>
          <Button variant="outline" onClick={onAgain}>
            Create another assignment
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/teacher/assignments">Back to assignments</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-3xl flex-col gap-6">
      {state.status === "error" && (
        <Alert tone="error" title="No assignment was created" live>
          {state.message}
        </Alert>
      )}
      <ErrorSummary title="No assignment was created. Fix the following fields" fieldErrors={fieldErrors} />

      {/* key: refills the typed values after a refusal. */}
      <div key={JSON.stringify(state)} className="flex flex-col gap-6">
        <TitleField defaultValue={values.title} error={fieldErrors.title} />
        <TaskFields values={values} fieldErrors={fieldErrors} />
        <div className="grid gap-6 md:grid-cols-2">
          <LevelField defaultValue={values.level} error={fieldErrors.level} />
          <LanguageField defaultValue={values.language} error={fieldErrors.language} />
        </div>
        <DeadlineField defaultValue={values.deadline} error={fieldErrors.deadline} />

        <ChoiceGroup
          legend="Classes"
          required
          hint="The classes that receive the assignment. You cannot add a class later."
          error={fieldErrors.classIds}
          errorFor="classIds"
        >
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {classes.map((c, i) => (
              <li key={c.id}>
                <label className="flex min-h-10 items-center gap-2">
                  <input
                    id={i === 0 ? fieldId("classIds") : undefined}
                    type="checkbox"
                    name="classIds"
                    value={c.id}
                    defaultChecked={values.classIds.includes(c.id)}
                    className="size-4 shrink-0 accent-[var(--primary)]"
                  />
                  <span className="break-words">{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </ChoiceGroup>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Creating…" : "Create assignment"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/teacher/assignments">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
