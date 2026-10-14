"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CalendarClock, CircleAlert, CircleCheck, Users } from "lucide-react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
import { Spinner } from "@/components/loading";
import { MetaList } from "@/components/shell/shell-parts";
import { Button } from "@/components/ui/button";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import {
  ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH,
  ASSIGNMENT_SUBJECT_MAX_LENGTH,
  ASSIGNMENT_TITLE_MAX_LENGTH,
} from "@/config/provisional";
import { assignmentLanguages, assignmentLevels, languageLabels } from "@/lib/assignment";
import { formatDateTime, TIME_ZONE_NAME } from "@/lib/dates";
import { AI_FIELDS_NOTICE, LATE_ACCEPTED_NOTICE, LEVEL_NOT_SENT_NOTICE, RUBRIC_UNCHANGED_NOTICE } from "@/lib/texts";
import { wallTimeToInstant } from "@/lib/time-zone";
import type { AssignmentField, AssignmentValues, CreateAssignmentState } from "@/server/assignments/assignments";
import { createAssignmentAction } from "../actions";

type ClassOption = { id: string; name: string };

/** Fields in screen order: the error summary and the focus follow it. */
const FIELDS: { field: AssignmentField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "subject", label: "Subject" },
  { field: "instructions", label: "Instructions" },
  { field: "level", label: "Level" },
  { field: "language", label: "Language" },
  { field: "deadline", label: "Deadline" },
  { field: "classIds", label: "Classes" },
];

const fieldId = (field: AssignmentField) => `assignment-${field}`;

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
    if (state.status !== "invalid") return;
    // After a refusal: the first field in error.
    const first = FIELDS.find(({ field }) => state.fieldErrors[field]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${fieldId(first.field)}`)?.focus();
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

  const errorList = FIELDS.filter(({ field }) => fieldErrors[field]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-3xl flex-col gap-6">
      {state.status === "error" && (
        <Alert tone="error" title="No assignment was created" live>
          {state.message}
        </Alert>
      )}
      {errorList.length > 0 && (
        <Alert tone="error" title="No assignment was created. Fix the following fields" live>
          <ul className="list-disc pl-5">
            {errorList.map(({ field, label }) => (
              <li key={field}>
                <a className="link" href={`#${fieldId(field)}`}>
                  {label}: {fieldErrors[field]}
                </a>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* key: refills the typed values after a refusal. */}
      <div key={JSON.stringify(state)} className="flex flex-col gap-6">
        <FormField
          label="Title"
          required
          hint={`Students see this title. At most ${ASSIGNMENT_TITLE_MAX_LENGTH} characters.`}
          error={fieldErrors.title}
        >
          <input
            id={fieldId("title")}
            name="title"
            className="input"
            autoComplete="off"
            maxLength={ASSIGNMENT_TITLE_MAX_LENGTH + 20}
            defaultValue={values.title}
          />
        </FormField>

        <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold">The task</legend>
          <Alert tone="warning" title="Sent to the AI">
            {AI_FIELDS_NOTICE} {RUBRIC_UNCHANGED_NOTICE}
          </Alert>
          <FormField
            label="Subject"
            required
            hint={`What students write about. At most ${ASSIGNMENT_SUBJECT_MAX_LENGTH} characters.`}
            error={fieldErrors.subject}
          >
            <textarea
              id={fieldId("subject")}
              name="subject"
              className="input"
              rows={4}
              maxLength={ASSIGNMENT_SUBJECT_MAX_LENGTH + 20}
              defaultValue={values.subject}
            />
          </FormField>
          <FormField
            label="Instructions"
            hint={`Optional: length, form, what to include. At most ${ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH} characters.`}
            error={fieldErrors.instructions}
          >
            <textarea
              id={fieldId("instructions")}
              name="instructions"
              className="input"
              rows={4}
              maxLength={ASSIGNMENT_INSTRUCTIONS_MAX_LENGTH + 20}
              defaultValue={values.instructions}
            />
          </FormField>
        </fieldset>

        <div className="grid gap-6 md:grid-cols-2">
          <FormField label="Level" required hint={LEVEL_NOT_SENT_NOTICE} error={fieldErrors.level}>
            <select id={fieldId("level")} name="level" className="input" defaultValue={values.level}>
              <option value="" disabled>
                Choose…
              </option>
              {assignmentLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </FormField>

          <ChoiceGroup legend="Language" required error={fieldErrors.language} errorFor="language">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {assignmentLanguages.map((language, i) => (
                <label key={language} className="flex min-h-10 items-center gap-2">
                  <input
                    // The first option takes the id the error summary links to.
                    id={i === 0 ? fieldId("language") : undefined}
                    type="radio"
                    name="language"
                    value={language}
                    defaultChecked={values.language === language}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {languageLabels[language]}
                </label>
              ))}
            </div>
          </ChoiceGroup>
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

/** Wall time typed in the single time zone, read back with the zone's name before sending. */
function DeadlineField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const [wall, setWall] = useState(defaultValue);
  const instant = wall ? wallTimeToInstant(wall, DEADLINE_TIME_ZONE) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <FormField
        label={`Deadline (${TIME_ZONE_NAME})`}
        required
        hint={`Date and time in ${TIME_ZONE_NAME} (${DEADLINE_TIME_ZONE}), for you and your students. ${LATE_ACCEPTED_NOTICE}`}
        error={error}
        className="max-w-xs"
      >
        <input
          id={fieldId("deadline")}
          name="deadline"
          type="datetime-local"
          className="input"
          defaultValue={defaultValue}
          onChange={(event) => setWall(event.target.value)}
        />
      </FormField>
      {instant && (
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
          Due {formatDateTime(instant)}
        </p>
      )}
    </div>
  );
}

/** A group of radios or checkboxes: legend, hint and error, wired like FormField. */
function ChoiceGroup({
  legend,
  hint,
  error,
  errorFor,
  required,
  children,
}: {
  legend: string;
  hint?: string;
  error?: string;
  errorFor: AssignmentField;
  required?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${fieldId(errorFor)}-error` : undefined;
  return (
    <fieldset
      className="field"
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
    >
      <legend className="label mb-1.5">
        {legend}
        {required && <span className="font-normal text-fg-muted"> (required)</span>}
      </legend>
      {children}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="sr-only">Error: </span>
            {error}
          </span>
        </p>
      )}
    </fieldset>
  );
}
