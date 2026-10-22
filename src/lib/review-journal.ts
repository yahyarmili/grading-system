import { formatGrade } from "@/lib/grade";
import type { ReviewEvent } from "@/lib/review-lists";
import { criterionIds, levelLabel, rubric, type CriterionId, type Level } from "@/lib/rubric";

// REV-04 R3 (E7.7): the copy's log as the corrector reads it under
// "History". Pure: what each event and field says, and the entries of one
// save shown together.

/** One log entry, as the data layer gives it (src/server/data/review/journal.ts). */
export type JournalEntryLike = {
  id: string;
  event: ReviewEvent;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  author: { firstName: string; lastName: string } | null;
  versionNumber: number | null;
  evaluationRevision: number | null;
  createdAt: string;
};

export type FieldChangeView = { field: string; label: string; before: string; after: string };

/** One line of the history: an act, its author and date, and the fields it changed. */
export type HistoryItem = {
  key: string;
  label: string;
  /** "System" when no one acted. */
  author: string;
  createdAt: string;
  versionNumber: number | null;
  changes: FieldChangeView[];
};

const EVENT_LABELS: Record<ReviewEvent, string> = {
  list_opened: "Opened the submissions",
  copy_opened: "Opened the copy",
  evaluation_created: "Started their evaluation from the AI proposal",
  evaluation_changed: "Changed the evaluation",
  retry_requested: "Asked to retry the evaluation",
  relaunch_requested: "Asked to relaunch the evaluation",
  retry_abandoned: "Request dropped: no evaluation slot was freed in time",
  manual_started: "Started a manual evaluation",
  validated: "Validated the evaluation",
  published: "Published the evaluation",
  unpublished: "Withdrew the publication",
  sent_back_to_review: "Sent back to review by a change",
};

/** REV-05 R2 (E8.1): a validation says its nature, recorded with it (validationNature). */
const VALIDATED_LABELS: Record<string, string> = {
  unchanged: "Validated without changes",
  changed: "Validated after changes",
  manual: "Validated (entered manually)",
};

function eventLabel(entry: JournalEntryLike): string {
  if (entry.event === "validated") {
    const nature = (entry.newValue as { nature?: string } | null)?.nature;
    return (nature && VALIDATED_LABELS[nature]) || EVENT_LABELS.validated;
  }
  return EVENT_LABELS[entry.event];
}

const criterionName = (id: string) => rubric.find((c) => c.id === id)?.name ?? id;

/** The field's place in a save, as the log writes them (diffEvaluation). */
const FIELD_ORDER = [
  ...criterionIds.flatMap((id: CriterionId) => [`level.${id}`, `remark.${id}`, `reread.${id}`]),
  "general_comment",
  "next_steps",
  "final_grade",
  "grade_fixed",
];

export function fieldLabel(field: string): string {
  const [kind, id] = field.split(".");
  if (kind === "level") return `${criterionName(id)}: level`;
  if (kind === "remark") return `${criterionName(id)}: remark`;
  if (kind === "reread") return `${criterionName(id)}: to re-read`;
  if (field === "general_comment") return "General comment";
  if (field === "next_steps") return "Next steps";
  if (field === "final_grade") return "Final grade";
  if (field === "grade_fixed") return "Grade";
  return field;
}

/** A logged value in words: never shown raw. */
export function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "None";
  const [kind] = field.split(".");
  if (kind === "level" && typeof value === "number") return levelLabel(value as Level);
  if (kind === "reread") return value ? "To re-read" : "Re-read";
  if (field === "final_grade" && typeof value === "number") return formatGrade(value);
  if (field === "grade_fixed") return value ? "Fixed by the teacher" : "Calculated";
  if (Array.isArray(value)) return value.length === 0 ? "None" : value.map(String).join("\n");
  if (typeof value === "string") return value === "" ? "Empty" : value;
  return String(value);
}

const changeOf = (entry: JournalEntryLike): FieldChangeView => ({
  field: entry.field!,
  label: fieldLabel(entry.field!),
  before: fieldValue(entry.field!, entry.oldValue),
  after: fieldValue(entry.field!, entry.newValue),
});

const authorOf = (entry: JournalEntryLike) => (entry.author ? `${entry.author.firstName} ${entry.author.lastName}` : "System");

/**
 * The log, newest first, one item per act: the entries of one save (its
 * revision: evaluation_created and every evaluation_changed) are one item,
 * fields in the form's order.
 */
export function historyOf(entries: readonly JournalEntryLike[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  const saves = new Map<number, HistoryItem>();
  for (const entry of entries) {
    const save = entry.event === "evaluation_created" || entry.event === "evaluation_changed" ? entry.evaluationRevision : null;
    let item = save === null ? undefined : saves.get(save);
    if (!item) {
      item = {
        key: entry.id,
        label: eventLabel(entry),
        author: authorOf(entry),
        createdAt: entry.createdAt,
        versionNumber: entry.versionNumber,
        changes: [],
      };
      items.push(item);
      if (save !== null) saves.set(save, item);
    }
    if (entry.event === "evaluation_created") item.label = EVENT_LABELS.evaluation_created;
    if (entry.event === "evaluation_changed" && entry.field) item.changes.push(changeOf(entry));
  }
  for (const item of items) item.changes.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
  return items;
}
