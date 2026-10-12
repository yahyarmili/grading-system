"use client";

import { useState, type ReactNode } from "react";
import { Bot, Eye, PenLine, RotateCcw } from "lucide-react";
import { Alert } from "@/components/alert";
import { Tag } from "@/components/tag";
import { GRADE_SCALE, GRADE_STEP } from "@/config/provisional";
import { calculateGrade, formatGrade } from "@/lib/grade";
import { levelLabel, rubric, type Level } from "@/lib/rubric";
import type { MockProposal } from "@/mock/copies";
import { LevelPicker } from "./level-picker";

/** Validated grade input: a number in [0, GRADE_SCALE] on the GRADE_STEP grid (provisional, Q1). */
function parseGrade(text: string): { value: number } | { error: string } {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return { error: "Enter a grade, or use the calculated grade." };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > GRADE_SCALE)
    return { error: `Enter a grade between 0 and ${GRADE_SCALE}.` };
  if (Math.abs(value / GRADE_STEP - Math.round(value / GRADE_STEP)) > 1e-9)
    return { error: `Use steps of ${GRADE_STEP}.` };
  return { value };
}

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

export function EvaluationForm({
  proposal,
  initialGrade,
}: {
  proposal: MockProposal;
  /** Grade already set by the teacher, if any. */
  initialGrade: number | null;
}) {
  // The teacher's evaluation starts from the proposal (REV-03 R1); the proposal itself never changes.
  const [levels, setLevels] = useState<Level[]>([...proposal.levels]);
  const [remarks, setRemarks] = useState<string[]>([...proposal.justifications]);
  const [reread, setReread] = useState<boolean[]>(rubric.map(() => false));
  const [comment, setComment] = useState(proposal.comment);
  const [suggestions, setSuggestions] = useState(proposal.suggestions);
  const [fixedGrade, setFixedGrade] = useState<number | null>(initialGrade);
  const [gradeText, setGradeText] = useState(initialGrade === null ? "" : String(initialGrade));
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const calculated = calculateGrade(levels);
  const proposedGrade = calculateGrade(proposal.levels);
  const finalGrade = fixedGrade ?? calculated;
  const gap = fixedGrade === null ? 0 : fixedGrade - calculated;

  function changeLevel(i: number, level: Level) {
    if (level === levels[i]) return;
    setLevels((ls) => ls.map((l, j) => (j === i ? level : l)));
    // REV-03 R3: the remark no longer matches its level; flag it, never block.
    setReread((rs) => rs.map((r, j) => (j === i ? true : r)));
    setSaved(false);
  }

  function changeRemark(i: number, text: string) {
    setRemarks((rs) => rs.map((r, j) => (j === i ? text : r)));
    setReread((rs) => rs.map((r, j) => (j === i ? false : r)));
    setSaved(false);
  }

  function changeGrade(text: string) {
    setGradeText(text);
    setSaved(false);
    const parsed = parseGrade(text);
    if ("error" in parsed) {
      setGradeError(parsed.error);
      return;
    }
    setGradeError(null);
    setFixedGrade(parsed.value);
  }

  function useCalculatedGrade() {
    setFixedGrade(null);
    setGradeText("");
    setGradeError(null);
    setSaved(false);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!gradeError) setSaved(true);
      }}
    >
      <p className="text-fg-muted">
        Five criteria, {rubric[0].weight} % each. The AI proposal is read-only and never shown to the
        student; your evaluation starts from it.
      </p>

      {proposal.alerts.map((alert) => (
        <Alert key={alert.kind} tone="warning" title="AI alert">
          {alert.message} Only you see this alert.
        </Alert>
      ))}

      {rubric.map((criterion, i) => {
        const aiLevel = proposal.levels[i];
        const levelChanged = levels[i] !== aiLevel;
        const remarkChanged = remarks[i] !== proposal.justifications[i];
        return (
          <section key={criterion.id} aria-labelledby={`${criterion.id}-title`} className="card @container">
            <header className="card-header flex-wrap">
              <h2 id={`${criterion.id}-title`} className="text-base font-semibold">
                <span className="mr-1.5 text-fg-muted tabular-nums">{i + 1}</span>
                {criterion.name}
              </h2>
              {(levelChanged || remarkChanged) && <Tag icon={PenLine}>Modified</Tag>}
            </header>
            <div className="card-body">
              <SideBySide
                ai={
                  <>
                    <p className="font-semibold">Level {levelLabel(aiLevel)}</p>
                    <p>{proposal.justifications[i]}</p>
                  </>
                }
                teacher={
                  <>
                    <LevelPicker
                      name={`level-${criterion.id}`}
                      legend="Your level"
                      value={levels[i]}
                      aiLevel={aiLevel}
                      onChange={(level) => changeLevel(i, level)}
                    />
                    <p className="text-xs text-fg-muted">
                      <span className="font-semibold text-fg">{levelLabel(levels[i])}:</span>{" "}
                      {criterion.descriptors[levels[i]]}
                    </p>
                    <div className="field">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="label" htmlFor={`remark-${criterion.id}`}>
                          Remark
                        </label>
                        {reread[i] && (
                          <span className="flex items-center gap-2">
                            <Tag tone="warning" icon={Eye}>To re-read</Tag>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setReread((rs) => rs.map((r, j) => (j === i ? false : r)))}
                            >
                              Mark as re-read
                            </button>
                          </span>
                        )}
                      </div>
                      <textarea
                        id={`remark-${criterion.id}`}
                        className="input field-sizing-content"
                        rows={3}
                        value={remarks[i]}
                        onChange={(e) => changeRemark(i, e.target.value)}
                        aria-describedby={reread[i] ? `remark-${criterion.id}-reread` : undefined}
                      />
                      {reread[i] && (
                        <p id={`remark-${criterion.id}-reread`} className="field-hint">
                          The level changed: check that the remark still fits.
                        </p>
                      )}
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
            ai={<p>{proposal.comment}</p>}
            teacher={
              <div className="field">
                <label className="label" htmlFor="comment">
                  General comment
                </label>
                <textarea
                  id="comment"
                  className="input field-sizing-content"
                  rows={3}
                  value={comment}
                  onChange={(e) => {
                    setComment(e.target.value);
                    setSaved(false);
                  }}
                />
              </div>
            }
          />
          <SideBySide
            ai={<p>{proposal.suggestions}</p>}
            teacher={
              <div className="field">
                <label className="label" htmlFor="suggestions">
                  Next steps
                </label>
                <textarea
                  id="suggestions"
                  className="input field-sizing-content"
                  rows={3}
                  value={suggestions}
                  onChange={(e) => {
                    setSuggestions(e.target.value);
                    setSaved(false);
                  }}
                />
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
                Proposed grade{" "}
                <span className="font-semibold tabular-nums">{formatGrade(proposedGrade)}</span>
                <span className="block text-xs text-fg-muted">
                  Calculated by the system from the AI levels.
                </span>
              </p>
            }
            teacher={
              <>
                <div className="field">
                  <label className="label" htmlFor="grade">
                    Final grade <span className="font-normal text-fg-muted">(out of {GRADE_SCALE}, provisional format)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="grade"
                      inputMode="decimal"
                      className="input w-28 tabular-nums"
                      value={fixedGrade === null && gradeError === null ? String(calculated) : gradeText}
                      onChange={(e) => changeGrade(e.target.value)}
                      aria-invalid={gradeError ? true : undefined}
                      aria-describedby="grade-status grade-error"
                    />
                    {(fixedGrade !== null || gradeError) && (
                      <button type="button" className="btn btn-ghost" onClick={useCalculatedGrade}>
                        <RotateCcw aria-hidden="true" className="size-4" />
                        Use calculated grade
                      </button>
                    )}
                  </div>
                  <p id="grade-status" className="field-hint">
                    {fixedGrade === null
                      ? "Calculated from your levels; updates when a level changes."
                      : `Fixed by you; no longer recalculated. Calculated grade: ${formatGrade(calculated)}.`}
                  </p>
                  <p id="grade-error" className="field-error" hidden={!gradeError}>
                    {gradeError && <>
                      <span className="sr-only">Error: </span>
                      {gradeError}
                    </>}
                  </p>
                </div>
                {gap !== 0 && (
                  <Alert tone="warning" title="Final grade differs from the calculated grade" live>
                    Final {formatGrade(fixedGrade ?? 0)}, calculated {formatGrade(calculated)} (
                    {gap > 0 ? "+" : "−"}
                    {Math.abs(gap)}).
                  </Alert>
                )}
              </>
            }
          />
        </div>
      </section>

      {saved && (
        <Alert tone="info" title="Saved" live>
          Mockup: nothing is stored. Every change will be logged automatically (REV-04).
        </Alert>
      )}

      {/* Stays in view on long copies: current grade and the save action. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-border-subtle bg-surface px-4 py-3 shadow-overlay">
        <p>
          Grade <span className="font-semibold tabular-nums">{formatGrade(finalGrade)}</span>{" "}
          <span className="text-fg-muted">· {fixedGrade === null ? "calculated" : "fixed by you"}</span>
        </p>
        <button type="submit" className="btn btn-primary">
          Save changes
        </button>
      </div>
    </form>
  );
}
