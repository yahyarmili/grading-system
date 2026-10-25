"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { Bot, Check, CircleCheck, Eye, PenLine, RotateCcw, Send } from "lucide-react";
import { Alert } from "@/components/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Spinner } from "@/components/loading";
import { Tag } from "@/components/tag";
import { GRADE_SCALE } from "@/config/decisions";
import type { AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { proposalAlertLabels } from "@/lib/evaluation";
import { formatGrade } from "@/lib/grade";
import { applyChanges, calculatedGrade, emptyFields, fieldsFromProposal, readTypedGrade, reconcileSaved, type EvaluationFields } from "@/lib/review";
import { levelLabel, rubric, type CriterionId, type Level } from "@/lib/rubric";
import { MANUAL_RUBRIC_SUBSTITUTE_NOTICE } from "@/lib/texts";
import type { CurrentProposal } from "@/server/data/evaluation/proposals";
import type { CopySeen, SavedEvaluation, SeenEvaluation } from "@/server/data/review/copy";
import type { EvaluationField } from "@/server/review/evaluation";
import type { DecisionState } from "@/server/review/publication";
import { saveEvaluationAction, validateAndPublishAction, validateEvaluationAction } from "./actions";
import { DecisionButton } from "./decision-button";
import { useNotice } from "../../notice";
import { NO_FORM, useCopyState } from "./copy-state";
import { LeaveGuard } from "./leave-guard";
import { LevelPicker } from "./level-picker";
import { clearDraft, parseDraft, sessionDrafts, storedDraft, writeDraft, type Draft } from "./unsaved-draft";

// REV-03, REV-04: the AI proposal, read-only and never shown to the student,
// beside the teacher's evaluation, which starts from it and is saved whole
// (E7 plan §1.4). Changing anything needs no justification (D5); each save
// is logged by the server, field by field. REV-06 (E8.2): without a proposal,
// the same form alone, entered by hand from nothing.

const draftOf = (saved: EvaluationFields): Draft => ({
  levels: { ...saved.levels },
  remarks: { ...saved.remarks },
  generalComment: saved.generalComment,
  nextSteps: saved.nextSteps.join("\n"),
  gradeFixed: saved.gradeFixed,
  gradeText: saved.gradeFixed && saved.finalGrade !== null ? String(saved.finalGrade) : "",
  rereadDone: [],
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/** The tab's storage tells nothing when it changes: read on each rendering (useSyncExternalStore). */
const noSubscription = () => () => {};

/** The whole form as sent; `over`: save over another tab's save, the teacher having chosen it. */
type SaveInput = {
  seen: SeenEvaluation;
  levels: Record<CriterionId, Level | null>;
  remarks: Record<CriterionId, string>;
  generalComment: string;
  nextSteps: string;
  grade: { fixed: false } | { fixed: true; value: string };
  rereadDone: CriterionId[];
  over?: boolean;
  /** E8.1: save only, or save then validate (REV-05), or then publish too (D6's shortcut). */
  intent?: Intent;
};

type Intent = "save" | "validate" | "validate_publish";

const submitActions = { save: saveEvaluationAction, validate: validateEvaluationAction, validate_publish: validateAndPublishAction };

/**
 * Sends the form for its intent. Asked to save over, a conflict is answered
 * by saving again from the revision stored: the teacher chose it knowing the
 * copy changed elsewhere, as "Save mine over it" after a conflict (E7.5);
 * the server guards that second save as any other.
 */
async function saveForm(previous: DecisionState, { over = false, intent = "save", ...input }: SaveInput): Promise<DecisionState> {
  const state = await submitActions[intent](previous, input);
  if (!over || state.status !== "conflict") return state;
  return submitActions[intent](previous, { ...input, seen: { ...input.seen, revision: state.saved.revision } });
}

/** A conflict shown with its two choices: what is stored now, and why. */
type Conflict = { saved: SavedEvaluation; message: string };

const CHANGED_ELSEWHERE = "This evaluation was changed in another tab or window.";

const PENDING_LABELS: Record<Intent, string> = {
  save: "Saving…",
  validate: "Validating…",
  validate_publish: "Validating and publishing…",
};

/** Q8 [D, 2026-10-22], said when a change of a Validated or Published copy is saved. */
const SENT_BACK = "Your change was saved. The copy is To review again: validate it, then publish it, for the student to see the result.";

/** Two columns from a wide card (container query), stacked otherwise; the teacher's alone without a proposal (REV-06). */
function SideBySide({ ai, teacher }: { ai: ReactNode; teacher: ReactNode }) {
  if (ai === null || ai === undefined || ai === false) return <div className="flex flex-col gap-3">{teacher}</div>;
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
  substituteRubric = false,
}: {
  /** Null for a manual evaluation (REV-06): the form alone, from nothing. */
  proposal: (CurrentProposal & { model: string | null; evaluatedAt: string }) | null;
  /** The teacher's evaluation, once they changed something; otherwise it starts from the proposal (REV-03 R1). */
  evaluation: SavedEvaluation | null;
  /** With the copy's state: To review, Validated or Published (E8.1); failed or not assessable, entered by hand (E8.2). */
  seen: CopySeen;
  language: AssignmentLanguage;
  /** Q6: a manual evaluation of a language without a rubric of its own is entered on the English one, said so. */
  substituteRubric?: boolean;
}) {
  const router = useRouter();
  const showNotice = useNotice();
  const { report, stale, setStale } = useCopyState();
  const [saved, setSaved] = useState<SavedEvaluation>(
    () => evaluation ?? { ...(proposal ? fieldsFromProposal(proposal) : emptyFields()), revision: 0 },
  );
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  const [state, save, pending] = useActionState(saveForm, { status: "idle" } as DecisionState);
  /** The act being sent, for the bar's status line. */
  const [intent, setIntent] = useState<Intent>("save");
  /** Q8: a change of a Validated or Published copy is confirmed before it is saved. */
  const [confirmingSave, setConfirmingSave] = useState(false);
  const decided = seen.status === "validated" || seen.status === "published";
  /** To review, or failed or not assessable and entered by hand (REV-06): save, validate, or validate and publish. */
  const open = !decided;
  /** REV-06: a manual evaluation of a copy failed or not assessable, nothing saved yet. */
  const manualStart = seen.status === "evaluation_failed" || seen.status === "not_assessable";
  /** The draft the pending save sent: typing resumed meanwhile is kept when it answers. */
  const [sent, setSent] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);

  const dirty = !sameDraft(draft, draftOf(saved));

  // A new answer of the server: what it saved becomes the form's starting
  // point; what was typed while it saved stays in the form.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "saved" || state.status === "decided" || state.status === "publish_failed") {
      setSaved(state.evaluation);
      if (sent === null || sameDraft(draft, sent)) setDraft(draftOf(state.evaluation));
      setConflict(null);
    }
    if (state.status === "conflict") setConflict({ saved: state.saved, message: state.message });
  }

  // A fresh rendering of the page (the refresh after a save, an opening, a
  // reload by the router) brings the stored evaluation: newer, it replaces a
  // clean form; over changes typed, the teacher chooses (REV-03 CA4). The
  // form is never mounted again for a new revision (page.tsx).
  const [rendered, setRendered] = useState(evaluation);
  if (evaluation !== rendered) {
    setRendered(evaluation);
    if (evaluation) {
      const next = reconcileSaved(saved.revision, evaluation.revision, dirty);
      if (next === "adopt") {
        setSaved(evaluation);
        setDraft(draftOf(evaluation));
      }
      if (next === "conflict") setConflict({ saved: evaluation, message: CHANGED_ELSEWHERE });
    }
  }

  // What follows an answer of the server, once per answer: the router hides
  // the page and shows it again (<Activity>) by cleaning up and running its
  // effects again, with the same answer; acting again would refresh for
  // nothing, bring back a message dismissed, move the focus or the scroll.
  // An answer that came while the page was hidden is acted on when shown.
  const acted = useRef(state);
  useEffect(() => {
    if (acted.current === state) return;
    acted.current = state;
    // Saved: the page is rendered again, its History and what it saw with it (C6).
    if (state.status === "saved" || state.status === "decided") {
      setStale(false);
      router.refresh();
    }
    // Q8: the change sent a Validated or Published copy back To review: said above the copy.
    if (state.status === "saved" && state.sentBack) {
      showNotice({ title: "To review again", message: SENT_BACK });
    }
    // PUB-01 R3: the shortcut's second act failed; the copy stays Validated, unless changed meanwhile (E8.7).
    if (state.status === "publish_failed") {
      setStale(false);
      showNotice({ title: state.validated ? "Validated, but not published" : "Not published", message: state.message });
      router.refresh();
    }
    // Replaced or closed meanwhile: the page shows the copy as it is now, the message above it (R5).
    if (state.status === "replaced" || state.status === "not_open") {
      showNotice({ title: "Not saved", message: state.message });
      router.refresh();
    }
    if (state.status === "invalid") {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
    }
    // Saved from anywhere on a long page: the conflict and its two choices come into view.
    if (state.status === "conflict") conflictRef.current?.scrollIntoView({ block: "center" });
  }, [state, router, showNotice, setStale]);

  // What an opening of the copy needs to know (CopyOpened); nothing once the form is gone or hidden.
  useEffect(() => {
    report({ dirty, revision: saved.revision });
    return () => report(NO_FORM);
  }, [report, dirty, saved.revision]);

  // C1: changes not saved are kept in the tab (unsaved-draft.ts) and given
  // back, said, to a form rendered fresh (a page evicted by the router, a
  // reload): read once the page is hydrated (the server knows nothing of
  // it: null until then), when the form is mounted, not when shown again;
  // written while the form differs from what is saved, erased otherwise
  // (saved or discarded). Typed over a revision saved since: restored too,
  // with the choice of a conflict.
  const [restored, setRestored] = useState<"restored" | "outdated" | null>(null);
  if (restored !== null && !dirty) setRestored(null);
  const { submissionId, versionNumber, proposalId } = seen;
  const stored = useSyncExternalStore(
    noSubscription,
    () => storedDraft(sessionDrafts(), submissionId),
    () => null,
  );
  const [storageRead, setStorageRead] = useState(false);
  if (!storageRead && stored !== null) {
    setStorageRead(true);
    const kept = parseDraft(stored, { submissionId, versionNumber, proposalId, revision: saved.revision });
    if (kept.kind !== "none" && !sameDraft(kept.draft, draftOf(saved))) {
      setDraft(kept.draft);
      setRestored(kept.kind === "restore" ? "restored" : "outdated");
    }
  }
  useEffect(() => {
    if (!storageRead) return;
    const storage = sessionDrafts();
    if (dirty) writeDraft(storage, { submissionId, versionNumber, proposalId, revision: saved.revision }, draft);
    else clearDraft(storage, submissionId);
  }, [storageRead, submissionId, versionNumber, proposalId, saved.revision, draft, dirty]);

  // An opening found the copy changed: with nothing typed, the page is simply rendered again.
  useEffect(() => {
    if (stale && !dirty) {
      setStale(false);
      router.refresh();
    }
  }, [stale, dirty, setStale, router]);

  const shownConflict = conflict !== null && conflict.saved.revision !== saved.revision ? conflict : null;

  // Null while a level is missing (a manual evaluation in progress, REV-06).
  const calculated = calculatedGrade(draft.levels);
  const typed = draft.gradeFixed ? readTypedGrade(draft.gradeText) : null;
  const fixedValue = typed && "value" in typed ? typed.value : null;
  const gap = fixedValue === null || calculated === null ? 0 : fixedValue - calculated;
  const shownGrade = (value: number | null) => (value === null ? "—" : formatGrade(value));
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

  /**
   * Sends the whole form for `intent`, from the revision `base` the teacher
   * last saw; `over`: over whatever is stored since.
   */
  function send(base: SavedEvaluation, over = false, act: Intent = "save") {
    if (draft.gradeFixed && typed && "error" in typed) {
      setGradeError(typed.error);
      document.getElementById("grade")?.focus();
      return;
    }
    setGradeError(null);
    setSent(draft);
    setIntent(act);
    const { submissionId, versionNumber, proposalId } = seen;
    startTransition(() =>
      save({
        intent: act,
        seen: { submissionId, versionNumber, proposalId, revision: base.revision } satisfies SeenEvaluation,
        levels: draft.levels,
        remarks: draft.remarks,
        generalComment: draft.generalComment,
        nextSteps: draft.nextSteps,
        grade: draft.gradeFixed ? { fixed: true, value: draft.gradeText } : { fixed: false },
        rereadDone: draft.rereadDone,
        over,
      }),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    // Q8: saving a change of a Validated or Published copy sends it back To review: asked first.
    if (decided) setConfirmingSave(true);
    else send(saved);
  }

  const shownGradeError = gradeError ?? fieldError("grade");

  /** Back to the copy's status page, the list's state kept: the form is discarded, nothing written. */
  function leaveManual() {
    setDraft(draftOf(saved));
    const url = new URL(window.location.href);
    url.searchParams.delete("manual");
    router.replace(`${url.pathname}${url.search}`);
  }

  return (
    <form ref={formRef} className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {proposal ? (
        <p className="text-fg-muted">
          Five criteria, {rubric[0].weight} % each. The AI proposal is read-only and never shown to the student; your
          evaluation starts from it. Change anything, no justification needed: each change is logged.
        </p>
      ) : (
        // REV-06: no proposal beside the form; the first save starts the evaluation, logged as such.
        <p className="text-fg-muted">
          Manual evaluation, without an AI proposal. Five criteria, {rubric[0].weight} % each: choose a level for each,
          and write your remarks. Each change is logged.
        </p>
      )}
      {substituteRubric && (
        <Alert tone="info" title="English rubric">
          {MANUAL_RUBRIC_SUBSTITUTE_NOTICE}
        </Alert>
      )}
      <LeaveGuard active={dirty} />
      {/* REV-05 R1, Q8: what the student sees, and what a change does. */}
      {seen.status === "validated" && (
        <Alert tone="info" title="Validated, not published">
          The student sees nothing yet. Publish it when ready. Saving a change sends the copy back to review.
        </Alert>
      )}
      {seen.status === "published" && (
        <Alert tone="info" title="Published">
          The student can see this result. Saving a change sends the copy back to review: the student no longer sees it
          until you validate and publish it again.
        </Alert>
      )}

      {/* C1: changes given back after the page was rendered fresh are said, never restored in silence. */}
      {restored === "restored" && (
        <Alert
          tone="info"
          title="Unsaved changes restored"
          live
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(draftOf(saved))}>
              Discard changes
            </button>
          }
        >
          You left this page without saving. Your changes are back in the form: save them, or discard them.
        </Alert>
      )}
      {/* An opening found the copy changed while changes were typed, or changes typed over a revision saved since
          were given back: nothing is replaced until the teacher chooses. */}
      {(stale || restored === "outdated") && dirty && !shownConflict && !pending && (
        <Alert
          tone="warning"
          title="Changed in another tab or window"
          live
          action={
            <span className="flex flex-wrap gap-2">
              {/* Discards the form; the page is then rendered again, as stored. */}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(draftOf(saved))}>
                Load saved version
              </button>
              {/* Keeps the form and saves it over what is stored, knowingly: logged like any save. */}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => send(saved, true)}>
                Save mine over it
              </button>
            </span>
          }
        >
          This copy changed since this page was shown. Your changes are still in the form: load the saved version, or save
          yours over it.
        </Alert>
      )}

      {proposal && proposal.alerts.length > 0 && (
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
        const ai = proposal?.criteria[criterion.id] ?? null;
        const level = draft.levels[criterion.id];
        const modified = ai !== null && (level !== ai.level || draft.remarks[criterion.id] !== ai.justification);
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
                  ai && (
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
                  )
                }
                teacher={
                  <>
                    <LevelPicker
                      name={`level-${criterion.id}`}
                      legend="Your level"
                      value={level}
                      aiLevel={ai?.level ?? null}
                      onChange={(next) => change({ levels: { ...draft.levels, [criterion.id]: next } })}
                    />
                    {levelError && <FieldError id={`level-${criterion.id}-error`} message={levelError} />}
                    <p className="text-xs text-fg-muted">
                      {level === null ? (
                        "No level chosen yet."
                      ) : (
                        <>
                          <span className="font-semibold text-fg">{levelLabel(level)}:</span> {criterion.descriptors[level]}
                        </>
                      )}
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
                            {/* E8.7 (review R3): marking alone would send a decided copy back To review (Q8). */}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={decided}
                              aria-describedby={decided ? `${remarkId}-reread-closed` : undefined}
                              onClick={() => change({ rereadDone: [...draft.rereadDone, criterion.id] })}
                            >
                              Mark as re-read
                            </button>
                            {decided && (
                              <span id={`${remarkId}-reread-closed`} className="text-xs text-fg-muted">
                                Only while To review
                              </span>
                            )}
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
            ai={proposal && <p>{proposal.generalComment}</p>}
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
              proposal && (
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                {proposal.nextSteps.map((step, s) => (
                  <li key={s}>{step}</li>
                ))}
              </ul>
              )
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
              proposal && (
              <p>
                Proposed grade <span className="font-semibold tabular-nums">{formatGrade(proposal.proposedGrade)}</span>
                <span className="block text-xs text-fg-muted">Calculated by the system from the AI levels.</span>
              </p>
              )
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
                      value={draft.gradeFixed ? draft.gradeText : calculated === null ? "" : String(calculated)}
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
                      ? `Fixed by you; no longer recalculated. Calculated grade: ${shownGrade(calculated)}.`
                      : calculated === null
                        ? "Calculated once a level is chosen for each criterion. Type a grade to fix it."
                        : "Calculated from your levels; updates when a level changes. Type a grade to fix it."}
                  </p>
                  <FieldError id="grade-error" message={shownGradeError} />
                </div>
                {/* Invariant 6: the gap is said in words and signs, not only by the color. */}
                {gap !== 0 && fixedValue !== null && (
                  <Alert tone="warning" title="Final grade differs from the calculated grade">
                    Final {formatGrade(fixedValue)}, calculated {shownGrade(calculated)} ({gap > 0 ? "+" : "−"}
                    {Math.abs(gap)}).
                  </Alert>
                )}
              </>
            }
          />
        </div>
      </section>

      {proposal && (
      <p className="text-xs text-fg-muted">
        Proposed by {proposal.model ?? "the AI"} on {formatDateTime(proposal.evaluatedAt)}.
      </p>
      )}

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
      {shownConflict && (
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
                    setSaved(shownConflict.saved);
                    setDraft(draftOf(shownConflict.saved));
                    setConflict(null);
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
                    setSaved(shownConflict.saved);
                    setConflict(null);
                    send(shownConflict.saved);
                  }}
                >
                  Save mine over it
                </button>
              </span>
            }
          >
            {shownConflict.message} Your changes are still in the form: load the saved version, or save yours over it.
          </Alert>
        </div>
      )}

      {/* Stays in view on long copies: the grade, what is saved, and the save action. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-border-subtle bg-surface px-4 py-3 shadow-overlay">
        <p>
          Grade{" "}
          <span className="font-semibold tabular-nums">
            {draft.gradeFixed ? shownGrade(fixedValue) : shownGrade(calculated)}
          </span>{" "}
          <span className="text-fg-muted">· {draft.gradeFixed ? "fixed by you" : "calculated"}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-fg-muted">
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner />
                {PENDING_LABELS[intent]}
              </span>
            ) : dirty ? (
              "Unsaved changes"
            ) : state.status === "saved" ? (
              <span className="inline-flex items-center gap-1.5">
                <Check aria-hidden="true" className="size-4" />
                {state.changed ? "Saved" : "Nothing to save"}
              </span>
            ) : state.status === "decided" ? (
              <span className="inline-flex items-center gap-1.5">
                <Check aria-hidden="true" className="size-4" />
                {state.message}
              </span>
            ) : null}
          </p>
          {/* REV-06: a manual evaluation not saved yet is left without a trace (nothing written). */}
          {manualStart &&
            (dirty ? (
              <ConfirmDialog
                trigger={
                  <button type="button" className="btn btn-ghost" disabled={pending}>
                    Cancel
                  </button>
                }
                title="Discard this manual evaluation?"
                description="Nothing was saved: what you entered is lost, and the copy stays as it is."
                confirmLabel="Discard"
                destructive
                onConfirm={leaveManual}
              />
            ) : (
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={leaveManual}>
                Cancel
              </button>
            ))}
          <button type="submit" className="btn btn-secondary" disabled={pending || !dirty}>
            Save changes
          </button>
          {open && (
            <>
              {/* REV-05: the form on screen is saved, then validated, in one act; nothing visible to the student (R1). */}
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => send(saved, false, "validate")}>
                <CircleCheck aria-hidden="true" className="size-4" />
                Validate
              </button>
              {/* D6: two acts, logged apart (PUB-01 R1). */}
              <ConfirmDialog
                trigger={
                  <button type="button" className="btn btn-primary" disabled={pending}>
                    <Send aria-hidden="true" className="size-4" />
                    Validate and publish
                  </button>
                }
                title="Validate and publish this evaluation?"
                description="Your evaluation is validated, then published: the student will see the grade, the levels, your remarks, the general comment and the next steps. You can withdraw the publication later."
                confirmLabel="Validate and publish"
                onConfirm={() => send(saved, false, "validate_publish")}
              />
            </>
          )}
          {seen.status === "validated" && (
            <>
              <DecisionButton
                kind="publish"
                primary
                seen={{ submissionId: seen.submissionId, versionNumber: seen.versionNumber, proposalId: seen.proposalId, revision: saved.revision }}
                disabled={pending || dirty}
                describedBy={dirty ? "decision-hint" : undefined}
              />
              {dirty && (
                <p id="decision-hint" className="basis-full text-right text-xs text-fg-muted">
                  Save or discard your changes before publishing.
                </p>
              )}
            </>
          )}
          {seen.status === "published" && (
            <DecisionButton
              kind="withdraw"
              seen={{ submissionId: seen.submissionId, versionNumber: seen.versionNumber, proposalId: seen.proposalId, revision: saved.revision }}
              disabled={pending}
            />
          )}
        </div>
      </div>
      {decided && (
        <ConfirmDialog
          open={confirmingSave}
          onOpenChange={setConfirmingSave}
          title="Save and send back to review?"
          description={
            seen.status === "published"
              ? "Saving returns this copy to To review. The student will no longer see the result until you validate and publish it again."
              : "Saving returns this copy to To review: validate it again before publishing."
          }
          confirmLabel="Save"
          onConfirm={() => send(saved)}
        />
      )}
    </form>
  );
}
