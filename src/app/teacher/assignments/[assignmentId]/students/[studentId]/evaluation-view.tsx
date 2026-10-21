import type { ReactNode } from "react";
import { Bot, Eye, Lock, PenLine } from "lucide-react";
import { Alert } from "@/components/alert";
import { Tag } from "@/components/tag";
import { GRADE_SCALE } from "@/config/decisions";
import type { AssignmentLanguage } from "@/lib/assignment";
import { formatDateTime } from "@/lib/dates";
import { proposalAlertLabels } from "@/lib/evaluation";
import { formatGrade } from "@/lib/grade";
import { fieldsFromProposal, gradeGap, type EvaluationFields } from "@/lib/review";
import { levelLabel, rubric } from "@/lib/rubric";
import type { CurrentProposal } from "@/server/data/evaluation/proposals";
import { LevelPicker } from "./level-picker";

// REV-02 R4, REV-03 R1: the AI proposal, read-only and never shown to the
// student, beside the teacher's evaluation, which starts from it. Read-only
// until saving opens (E7.4).

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

/** A read-only text of the teacher's evaluation: focusable and selectable, not editable. */
function ReadOnlyText({ id, label, value, hint }: { id: string; label: ReactNode; value: string; hint?: ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="input field-sizing-content"
        rows={2}
        readOnly
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function EvaluationView({
  proposal,
  evaluation,
  language,
}: {
  proposal: CurrentProposal & { model: string | null; evaluatedAt: string };
  /** The teacher's evaluation, once they changed something; otherwise the proposal's values. */
  evaluation: EvaluationFields | null;
  language: AssignmentLanguage;
}) {
  const fields = evaluation ?? fieldsFromProposal(proposal);
  const gap = gradeGap(fields);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg-muted">
        Five criteria, {rubric[0].weight} % each. The AI proposal is read-only and never shown to the student; your
        evaluation starts from it.
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
        const level = fields.levels[criterion.id];
        const modified = level !== ai.level || fields.remarks[criterion.id] !== ai.justification;
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
                    <LevelPicker name={`level-${criterion.id}`} legend="Your level" value={level} aiLevel={ai.level} />
                    {level !== null && (
                      <p className="text-xs text-fg-muted">
                        <span className="font-semibold text-fg">{levelLabel(level)}:</span>{" "}
                        {criterion.descriptors[level]}
                      </p>
                    )}
                    <ReadOnlyText
                      id={`remark-${criterion.id}`}
                      label={
                        <span className="flex flex-wrap items-center gap-2">
                          Remark
                          {fields.reread[criterion.id] && (
                            <Tag tone="warning" icon={Eye}>
                              To re-read
                            </Tag>
                          )}
                        </span>
                      }
                      value={fields.remarks[criterion.id]}
                      hint={fields.reread[criterion.id] ? "The level changed: check that the remark still fits." : undefined}
                    />
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
            teacher={<ReadOnlyText id="comment" label="General comment" value={fields.generalComment} />}
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
              <ReadOnlyText id="next-steps" label="Next steps" value={fields.nextSteps.join("\n")} hint="One per line." />
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
                <p>
                  Final grade{" "}
                  <span className="font-semibold tabular-nums">
                    {fields.finalGrade === null ? "—" : formatGrade(fields.finalGrade)}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    {fields.gradeFixed
                      ? "Fixed by you; no longer recalculated."
                      : `Calculated from your levels, out of ${GRADE_SCALE}.`}
                  </span>
                </p>
                {gap !== 0 && fields.finalGrade !== null && (
                  <Alert tone="warning" title="Final grade differs from the calculated grade">
                    Final {formatGrade(fields.finalGrade)}, calculated {formatGrade(fields.finalGrade - gap)} (
                    {gap > 0 ? "+" : "−"}
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

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3">
        <Lock aria-hidden="true" className="size-4 text-fg-muted" />
        <p>
          <span className="font-semibold">Read-only for now.</span>{" "}
          <span className="text-fg-muted">Changing the evaluation is not available yet.</span>
        </p>
      </div>
    </div>
  );
}
