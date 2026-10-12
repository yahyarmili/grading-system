"use client";

import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { FormField } from "@/components/form-field";

type Errors = Partial<Record<"title" | "language" | "deadline", string>>;

/**
 * Demo of the form pattern: validate on submit, one message per field,
 * an error summary that links to the fields, focus on the first error.
 * Real forms will validate with Zod on the server (to be confirmed in E1).
 */
export function FormDemo() {
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Errors = {};
    const title = String(data.get("title") ?? "").trim();
    if (!title) next.title = "Enter a title.";
    else if (title.length < 3) next.title = "Use at least 3 characters.";
    if (!data.get("language")) next.language = "Choose the language of the task.";
    if (!data.get("deadline")) next.deadline = "Choose a deadline.";

    setErrors(next);
    setSaved(Object.keys(next).length === 0);
    const firstInvalid = Object.keys(next)[0];
    if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
  }

  const errorList = Object.entries(errors);

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {errorList.length > 0 && (
        <Alert tone="error" title="Fix the following fields" live>
          <ul className="list-disc pl-5">
            {errorList.map(([field, message]) => (
              <li key={field}>
                <a className="link" href={`#${field}`}>
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {saved && (
        <Alert tone="info" title="Saved" live>
          The assignment was saved (demo only, nothing is stored).
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Title" required error={errors.title} hint="Students see this title.">
          <input id="title" name="title" className="input" autoComplete="off" />
        </FormField>
        <FormField label="Language" required error={errors.language}>
          <select id="language" name="language" className="input" defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            <option value="en">English</option>
            <option value="fr">French</option>
          </select>
        </FormField>
        <FormField label="Deadline" required error={errors.deadline}>
          <input id="deadline" name="deadline" type="date" className="input" />
        </FormField>
        <FormField label="Instructions" hint="Optional. Shown above the writing area.">
          <textarea id="instructions" name="instructions" className="input" rows={3} />
        </FormField>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary">
          Save assignment
        </button>
        <button
          type="reset"
          className="btn btn-ghost"
          onClick={() => {
            setErrors({});
            setSaved(false);
          }}
        >
          Reset
        </button>
      </div>
    </form>
  );
}
