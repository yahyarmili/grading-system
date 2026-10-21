"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bot, Check, Eye, PenLine, RotateCcw } from "lucide-react";
import { Alert } from "@/components/alert";
import { Spinner } from "@/components/loading";
import { Tag } from "@/components/tag";
import { GRADE_SCALE } from "@/config/decisions";
import type { AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { proposalAlertLabels } from "@/lib/evaluation";
import { calculateGrade, formatGrade } from "@/lib/grade";
import { applyChanges, fieldsFromProposal, readTypedGrade, type EvaluationFields } from "@/lib/review";
import { criterionIds, levelLabel, rubric, type CriterionId, type Level } from "@/lib/rubric";
import type { CurrentProposal } from "@/server/data/evaluation/proposals";
import type { SavedEvaluation, SeenEvaluation } from "@/server/data/review/copy";
import type { EvaluationField, SaveEvaluationState } from "@/server/review/evaluation";
import { saveEvaluationAction } from "./actions";
import { useCopyNotice } from "./copy-notice";
import { LevelPicker } from "./level-picker";

// REV-03, REV-04: the AI proposal, read-only and never shown to the student,
// beside the teacher's evaluation, which starts from it and is saved whole
// (E7 plan §1.4). Changing anything needs no justification (D5); each save
// is logged by the server, field by field.

/** What the form holds while the teacher types. */
type Draft = {
  levels: Record<CriterionId, Level>;
  remarks: Record<CriterionId, string>;
  generalComment: string;
  /** One step per line. */
  nextSteps: string;
  gradeFixed: boolean;
  /** The typed grade, while fixed. */
  gradeText: string;
  /** "To re-read" cleared without changing the remark. */
  rereadDone: CriterionId[];
};

const draftOf = (saved: EvaluationFields): Draft => ({
  levels: { ...(saved.levels as Record<CriterionId, Level>) },
  remarks: { ...saved.remarks },
  generalComment: saved.generalComment,
  nextSteps: saved.nextSteps.join("\n"),
  gradeFixed: saved.gradeFixed,
  gradeText: saved.gradeFixed && saved.finalGrade !== null ? String(saved.finalGrade) : "",
  rereadDone: [],
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/** Two columns from a wide card (container query), stacked otherwise. */
function SideBySide({ ai, teacher }: { ai: ReactNode; teacher: ReactNode }) {
  return (
    <div className="grid gap-4 @xl:grid-cols-2 @xl:gap-6">
      <div className="flex flex-col gap-2 rounded-lg bg-surface-muted p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          <Bot aria-hidden="true" className="size-4" />
          AI proposal
        </p>
        {ai}
      </div>
      <div className="flex flex-col gap-3">{teacher}</div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} className="field-error" hidden={!message}>
      {message && (
        <>
          <span className="sr-only">Error: </span>
          {message}
        </>
      )}
    </p>
  );
}

export function EvaluationForm({
  proposal,
  evaluation,
  seen,
  language,
}: {
  proposal: CurrentProposal & { model: string | null; evaluatedAt: string };
  /** The teacher's evaluation, once they changed something; otherwise it starts from the proposal (REV-03 R1). */
  evaluation: SavedEvaluation | null;
  seen: SeenEvaluation;
  language: AssignmentLanguage;
}) {
  const router = useRouter();
  const showNotice = useCopyNotice();
  const [saved, setSaved] = useState<SavedEvaluation>(() => evaluation ?? { ...fieldsFromProposal(proposal), revision: 0 });
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  const [state, save, pending] = useActionState(saveEvaluationAction, { status: "idle" } as SaveEvaluationState);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);

  // A new answer of the server: what it saved becomes the form's starting point.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "saved") {
      setSaved(state.evaluation);
      setDraft(draftOf(state.evaluation));
    }
  }

  // Replaced or closed meanwhile: the page shows the copy as it is now, the message above it (R5).
  useEffect(() => {
    if (state.status === "replaced" || state.status === "not_open") {
      showNotice(state.message);
      router.refresh();
    }
    if (state.status === "invalid") {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
    }
    // Saved from anywhere on a long page: the conflict and its two choices come into view.
    if (state.status === "conflict") conflictRef.current?.scrollIntoView({ block: "center" });
  }, [state, router, showNotice]);

  const dirty = !sameDraft(draft, draftOf(saved));
  // A change typed and not saved is not lost by closing the tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const calculated = calculateGrade(criterionIds.map((id) => draft.levels[id]));
  const typed = draft.gradeFixed ? readTypedGrade(draft.gradeText) : null;
  const fixedValue = typed && "value" in typed ? typed.value : null;
  const gap = fixedValue === null ? 0 : fixedValue - calculated;
  // The marks as the server will compute them (REV-03 R3): the same pure function.
  const preview = applyChanges(saved, {
    levels: draft.levels,
    remarks: draft.remarks,
    generalComment: draft.generalComment,
    nextSteps: [],
    grade: { fixed: false },
    rereadDone: draft.rereadDone,
  });
  const errors: Partial<Record<EvaluationField, string>> = state.status === "invalid" && state === handled ? state.fieldErrors : {};
  // Shown from the server's refusal until the next save.
  const fieldError = (field: EvaluationField) => errors[field];

  const change = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));

  /** Sends the whole form, from the revision `base` the teacher last saw. */
  function send(base: SavedEvaluation) {
    if (draft.gradeFixed && typed && "error" in typed) {
      setGradeError(typed.error);
      document.getElementById("grade")?.focus();
      return;
    }
    setGradeError(null);
    startTransition(() =>
      save({
        seen: { ...seen, revision: base.revision },
        levels: draft.levels,
        remarks: draft.remarks,
        generalComment: draft.generalComment,
        nextSteps: draft.nextSteps,
        grade: draft.gradeFixed ? { fixed: true, value: draft.gradeText } : { fixed: false },
        rereadDone: draft.rereadDone,
      }),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(saved);
  }

  const shownGradeError = gradeError ?? fieldError("grade");

  return (
    <form ref={formRef} className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <p className="text-fg-muted">
        Five criteria, {rubric[0].weight} % each. The AI proposal is read-only and never shown to the student; your
        evaluation starts from it. Change anything, no justification needed: each change is logged.
      </p>

      {proposal.alerts.length > 0 && (
        <Alert tone="warning" title={proposal.alerts.length === 1 ? "AI alert" : "AI alerts"}>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {proposal.alerts.map((alert) => (
              <li key={alert}>{proposalAlertLabels[alert]}</li>
            ))}
          </ul>
          <p className="mt-1">Best effort, not guaranteed. Only you see these alerts.</p>
        </Alert>
      )}

      {rubric.map((criterion, i) => {
        const ai = proposal.criteria[criterion.id];
        const level = draft.levels[criterion.id];
        const modified = level !== ai.level || draft.remarks[criterion.id] !== ai.justification;
        const reread = preview.reread[criterion.id];
        const remarkId = `remark-${criterion.id}`;
        const remarkError = fieldError(`remark.${criterion.id}`);
        const levelError = fieldError(`level.${criterion.id}`);
        return (
          <section key={criterion.id} aria-labelledby={`${criterion.id}-title`} className="card @container">
            <header className="card-header flex-wrap">
              <h2 id={`${criterion.id}-title`} className="text-base font-semibold">
                <span className="mr-1.5 text-fg-muted tabular-nums">{i + 1}</span>
                {criterion.name}
              </h2>
              {modified && <Tag icon={PenLine}>Modified</Tag>}
            </header>
            <div className="card-body">
              <SideBySide
                ai={
                  <>
                    <p className="font-semibold">Level {levelLabel(ai.level)}</p>
                    <p>{ai.justification}</p>
                    <div>
                      <p className="text-xs font-medium text-fg-muted">From the text</p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {ai.quotes.map((quote, q) => (
                          <li key={q} className="border-l-2 border-border pl-3 text-fg-muted">
                            <q lang={language}>{quote}</q>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                }
                teacher={
                  <>
                    <LevelPicker
                      name={`level-${criterion.id}`}
                      legend="Your level"
                      value={level}
                      aiLevel={ai.level}
                      onChange={(next) => change({ levels: { ...draft.levels, [criterion.id]: next } })}
                    />
                    {levelError && <FieldError id={`level-${criterion.id}-error`} message={levelError} />}
                    <p className="text-xs text-fg-muted">
                      <span className="font-semibold text-fg">{levelLabel(level)}:</span> {criterion.descriptors[level]}
                    </p>
                    <div className="field">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="label" htmlFor={remarkId}>
                          Remark
                        </label>
                        {reread && (
                          <span className="flex items-center gap-2">
                            <Tag tone="warning" icon={Eye}>
                              To re-read
                            </Tag>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => change({ rereadDone: [...draft.rereadDone, criterion.id] })}
                            >
                              Mark as re-read
                            </button>
                          </span>
                        )}
                      </div>
                      <textarea
                        id={remarkId}
                        lang={language}
                        className="input field-sizing-content"
                        rows={2}
                        value={draft.remarks[criterion.id]}
                        onChange={(e) => change({ remarks: { ...draft.remarks, [criterion.id]: e.target.value } })}
                        aria-invalid={remarkError ? true : undefined}
                        aria-describedby={`${remarkId}-reread ${remarkId}-error`}
                      />
                      <p id={`${remarkId}-reread`} className="field-hint" hidden={!reread}>
                        The level changed: check that the remark still fits.
                      </p>
                      <FieldError id={`${remarkId}-error`} message={remarkError} />
                    </div>
                  </>
                }
              />
            </div>
          </section>
        );
      })}

      <section aria-labelledby="comment-title" className="card @container">
        <header className="card-header">
          <h2 id="comment-title" className="text-base font-semibold">
            General comment and next steps
          </h2>
        </header>
        <div className="card-body flex flex-col gap-6">
          <SideBySide
            ai={<p>{proposal.generalComment}</p>}
            teacher={
              <div className="field">
                <label className="label" htmlFor="comment">
                  General comment
                </label>
                <textarea
                  id="comment"
                  lang={language}
                  className="input field-sizing-content"
                  rows={3}
                  value={draft.generalComment}
                  onChange={(e) => change({ generalComment: e.target.value })}
                  aria-invalid={fieldError("generalComment") ? true : undefined}
                  aria-describedby="comment-error"
                />
                <FieldError id="comment-error" message={fieldError("generalComment")} />
              </div>
            }
          />
          <SideBySide
            ai={
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                {proposal.nextSteps.map((step, s) => (
                  <li key={s}>{step}</li>
                ))}
              </ul>
            }
            teacher={
              <div className="field">
                <label className="label" htmlFor="next-steps">
                  Next steps
                </label>
                <textarea
                  id="next-steps"
                  lang={language}
                  className="input field-sizing-content"
                  rows={3}
                  value={draft.nextSteps}
                  onChange={(e) => change({ nextSteps: e.target.value })}
                  aria-invalid={fieldError("nextSteps") ? true : undefined}
                  aria-describedby="next-steps-hint next-steps-error"
                />
                <p id="next-steps-hint" className="field-hint">
                  One per line.
                </p>
                <FieldError id="next-steps-error" message={fieldError("nextSteps")} />
              </div>
            }
          />
        </div>
      </section>

      <section aria-labelledby="grade-title" className="card @container">
        <header className="card-header">
          <h2 id="grade-title" className="text-base font-semibold">
            Grade
          </h2>
        </header>
        <div className="card-body flex flex-col gap-4">
          <SideBySide
            ai={
              <p>
                Proposed grade <span className="font-semibold tabular-nums">{formatGrade(proposal.proposedGrade)}</span>
                <span className="block text-xs text-fg-muted">Calculated by the system from the AI levels.</span>
              </p>
            }
            teacher={
              <>
                <div className="field">
                  <label className="label" htmlFor="grade">
                    Final grade <span className="font-normal text-fg-muted">(out of {GRADE_SCALE})</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="grade"
                      inputMode="decimal"
                      autoComplete="off"
                      className="input w-28 tabular-nums"
                      value={draft.gradeFixed ? draft.gradeText : String(calculated)}
                      // Typing a grade fixes it (REV-03 R2): no longer recalculated.
                      onChange={(e) => {
                        setGradeError(null);
                        change({ gradeFixed: true, gradeText: e.target.value });
                      }}
                      aria-invalid={shownGradeError ? true : undefined}
                      aria-describedby="grade-status grade-error"
                    />
                    {draft.gradeFixed && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setGradeError(null);
                          change({ gradeFixed: false, gradeText: "" });
                        }}
                      >
                        <RotateCcw aria-hidden="true" className="size-4" />
                        Use calculated grade
                      </button>
                    )}
                  </div>
                  <p id="grade-status" className="field-hint">
                    {draft.gradeFixed
                      ? `Fixed by you; no longer recalculated. Calculated grade: ${formatGrade(calculated)}.`
                      : "Calculated from your levels; updates when a level changes. Type a grade to fix it."}
                  </p>
                  <FieldError id="grade-error" message={shownGradeError} />
                </div>
                {/* Invariant 6: the gap is said in words and signs, not only by the color. */}
                {gap !== 0 && fixedValue !== null && (
                  <Alert tone="warning" title="Final grade differs from the calculated grade">
                    Final {formatGrade(fixedValue)}, calculated {formatGrade(calculated)} ({gap > 0 ? "+" : "−"}
                    {Math.abs(gap)}).
                  </Alert>
                )}
              </>
            }
          />
        </div>
      </section>

      <p className="text-xs text-fg-muted">
        Proposed by {proposal.model ?? "the AI"} on {formatDateTime(proposal.evaluatedAt)}.
      </p>

      {state === handled && state.status === "invalid" && (
        <Alert tone="error" title="Nothing was saved" live>
          Check the fields marked below.
        </Alert>
      )}
      {state.status === "not_found" && (
        <Alert tone="error" title="Not saved" live>
          {state.message}
        </Alert>
      )}
      {state.status === "conflict" && state.saved.revision !== saved.revision && (
        <div ref={conflictRef}>
          <Alert
            tone="warning"
            title="Changed in another tab or window"
            live
            action={
              <span className="flex flex-wrap gap-2">
                {/* Discards the form: the saved evaluation is shown instead. */}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={pending}
                  onClick={() => {
                    setSaved(state.saved);
                    setDraft(draftOf(state.saved));
                  }}
                >
                  Load saved version
                </button>
                {/* Keeps the form and saves it over the saved one, knowingly: logged like any save. */}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={pending}
                  onClick={() => {
                    setSaved(state.saved);
                    send(state.saved);
                  }}
                >
                  Save mine over it
                </button>
              </span>
            }
          >
            {state.message} Your changes are still in the form: load the saved version, or save yours over it.
          </Alert>
        </div>
      )}

      {/* Stays in view on long copies: the grade, what is saved, and the save action. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-border-subtle bg-surface px-4 py-3 shadow-overlay">
        <p>
          Grade{" "}
          <span className="font-semibold tabular-nums">
            {draft.gradeFixed ? (fixedValue === null ? "—" : formatGrade(fixedValue)) : formatGrade(calculated)}
          </span>{" "}
          <span className="text-fg-muted">· {draft.gradeFixed ? "fixed by you" : "calculated"}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-fg-muted">
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner />
                Saving…
              </span>
            ) : dirty ? (
              "Unsaved changes"
            ) : state.status === "saved" ? (
              <span className="inline-flex items-center gap-1.5">
                <Check aria-hidden="true" className="size-4" />
                {state.changed ? "Saved" : "Nothing to save"}
              </span>
            ) : null}
          </p>
          <button type="submit" className="btn btn-primary" disabled={pending || !dirty}>
            Save changes
          </button>
        </div>
      </div>
    </form>
  );
}
