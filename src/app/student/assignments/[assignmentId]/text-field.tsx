"use client";

import { CircleAlert, UserX } from "lucide-react";
import { FormField } from "@/components/form-field";
import { SUBMISSION_TEXT_MAX_LENGTH } from "@/config/decisions";
import type { AssignmentLanguage } from "@/lib/assignment";
import { countCharacters, normalizeLineEndings } from "@/lib/submission-text";
import { NO_NAME_INSTRUCTION, SUBMISSION_TEXT_LIMIT_NOTICE } from "@/lib/texts";

// The text box of a first submission and of a replacement (SUB-02, SUB-05).

const number = (n: number) => n.toLocaleString("en-US");

/** Q10 [D]: the instruction alone, before sending; no alert, no masking. */
export function NoNameInstruction() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5">
      <UserX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-fg" />
      <p className="font-semibold">{NO_NAME_INSTRUCTION}</p>
    </div>
  );
}

/**
 * NFR-TRT-02: no autocorrect, spellcheck or capitalization by the device.
 * No maxLength: it would cut a pasted text silently; the counter says how far
 * over the limit it is, and the server refuses it (SUB-02 R1). Controlled by
 * the caller: React resets a form's fields after its action, and a refused
 * text must stay.
 */
export function TextField({
  id,
  label,
  text,
  onText,
  textRef,
  language,
  error,
}: {
  id: string;
  label: string;
  text: string;
  onText: (text: string) => void;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  language: AssignmentLanguage;
  error?: string;
}) {
  const count = countCharacters(normalizeLineEndings(text));
  const over = count - SUBMISSION_TEXT_MAX_LENGTH;
  return (
    <div className="flex flex-col gap-1.5">
      <FormField label={label} required hint={SUBMISSION_TEXT_LIMIT_NOTICE} error={error}>
        <textarea
          ref={textRef}
          id={id}
          name="text"
          lang={language}
          rows={12}
          className="input min-h-60 resize-y"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-gramm="false"
          aria-describedby={`${id}-count`}
          value={text}
          onChange={(e) => onText(e.target.value)}
        />
      </FormField>
      <p id={`${id}-count`} className="flex items-center justify-end gap-1 text-sm tabular-nums">
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
