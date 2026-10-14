"use client";

import { useId, useState, type ReactNode } from "react";
import { CalendarClock, CircleAlert } from "lucide-react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";
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
import type { AssignmentField, AssignmentValues } from "@/server/assignments/assignments";

// Fields of an assignment, shared by creation (ASG-01) and edit (ASG-03).

type FieldErrors = Partial<Record<AssignmentField, string>>;

/** Fields in screen order: the error summary and the focus follow it. */
export const FIELDS: { field: AssignmentField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "subject", label: "Subject" },
  { field: "instructions", label: "Instructions" },
  { field: "level", label: "Level" },
  { field: "language", label: "Language" },
  { field: "deadline", label: "Deadline" },
  { field: "classIds", label: "Classes" },
];

export const fieldId = (field: AssignmentField) => `assignment-${field}`;

/** After a refusal: the first field in error, inside `form`. */
export function focusFirstError(form: HTMLFormElement | null, fieldErrors: FieldErrors) {
  const first = FIELDS.find(({ field }) => fieldErrors[field]);
  if (first) form?.querySelector<HTMLElement>(`#${fieldId(first.field)}`)?.focus();
}

/** One link per field in error, in screen order. */
export function ErrorSummary({ title, fieldErrors }: { title: string; fieldErrors: FieldErrors }) {
  const errorList = FIELDS.filter(({ field }) => fieldErrors[field]);
  if (errorList.length === 0) return null;
  return (
    <Alert tone="error" title={title} live>
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
  );
}

export function TitleField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  return (
    <FormField
      label="Title"
      required
      hint={`Students see this title. At most ${ASSIGNMENT_TITLE_MAX_LENGTH} characters.`}
      error={error}
    >
      <input
        id={fieldId("title")}
        name="title"
        className="input"
        autoComplete="off"
        maxLength={ASSIGNMENT_TITLE_MAX_LENGTH + 20}
        defaultValue={defaultValue}
      />
    </FormField>
  );
}

/** Subject and instructions, with the R4 notice: both are sent to the AI. */
export function TaskFields({ values, fieldErrors }: { values: AssignmentValues; fieldErrors: FieldErrors }) {
  return (
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
  );
}

export function LevelField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  return (
    <FormField label="Level" required hint={LEVEL_NOT_SENT_NOTICE} error={error}>
      <select id={fieldId("level")} name="level" className="input" defaultValue={defaultValue}>
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
  );
}

export function LanguageField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  return (
    <ChoiceGroup legend="Language" required error={error} errorFor="language">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {assignmentLanguages.map((language, i) => (
          <label key={language} className="flex min-h-10 items-center gap-2">
            <input
              // The first option takes the id the error summary links to.
              id={i === 0 ? fieldId("language") : undefined}
              type="radio"
              name="language"
              value={language}
              defaultChecked={defaultValue === language}
              className="size-4 accent-[var(--primary)]"
            />
            {languageLabels[language]}
          </label>
        ))}
      </div>
    </ChoiceGroup>
  );
}

/** Wall time typed in the single time zone, read back with the zone's name before sending. */
export function DeadlineField({ defaultValue, error }: { defaultValue: string; error?: string }) {
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
export function ChoiceGroup({
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
