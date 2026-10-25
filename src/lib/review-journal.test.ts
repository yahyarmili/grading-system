import { describe, expect, it } from "vitest";
import { fieldLabel, fieldValue, historyOf, type JournalEntryLike } from "./review-journal";

// REV-04 R3 (E7.7): the history of a copy, as the corrector reads it.

let next = 0;
const entry = (over: Partial<JournalEntryLike>): JournalEntryLike => ({
  id: `e${++next}`,
  event: "copy_opened",
  field: null,
  oldValue: null,
  newValue: null,
  author: { firstName: "Sarah", lastName: "Bennett" },
  versionNumber: 1,
  evaluationRevision: null,
  createdAt: "2026-10-21T10:00:00.000Z",
  ...over,
});

describe("historyOf", () => {
  it("groups one save's entries, fields in the form's order, newest act first", () => {
    const at = "2026-10-21T10:05:00.000Z";
    const items = historyOf([
      entry({ event: "evaluation_changed", field: "final_grade", oldValue: 10, newValue: 14.5, evaluationRevision: 1, createdAt: at }),
      entry({ event: "evaluation_created", newValue: { origin: "proposal" }, evaluationRevision: 1, createdAt: at }),
      entry({ event: "evaluation_changed", field: "level.task", oldValue: 3, newValue: 4, evaluationRevision: 1, createdAt: at }),
      entry({ event: "copy_opened" }),
    ]);
    expect(items.map((i) => i.label)).toEqual(["Started their evaluation from the AI proposal", "Opened the copy"]);
    expect(items[0]).toMatchObject({ author: "Sarah Bennett", createdAt: at });
    expect(items[0].changes).toEqual([
      { field: "level.task", label: "Task Achievement / Content: level", before: expect.stringMatching(/^3 – /), after: expect.stringMatching(/^4 – /) },
      { field: "final_grade", label: "Final grade", before: "10 / 20", after: "14.5 / 20" },
    ]);
  });

  it("keeps two saves apart, and names the system when no one acted", () => {
    const items = historyOf([
      entry({ event: "evaluation_changed", field: "general_comment", oldValue: "A", newValue: "B", evaluationRevision: 2 }),
      entry({ event: "evaluation_changed", field: "general_comment", oldValue: "", newValue: "A", evaluationRevision: 1 }),
      entry({ event: "retry_abandoned", author: null, newValue: { origin: "retry" } }),
    ]);
    expect(items.map((i) => [i.label, i.author, i.changes.length])).toEqual([
      ["Changed the evaluation", "Sarah Bennett", 1],
      ["Changed the evaluation", "Sarah Bennett", 1],
      ["Request dropped: no evaluation slot was freed in time", "System", 0],
    ]);
    expect(items[1].changes[0]).toMatchObject({ before: "Empty", after: "A" });
  });

  it("names the start of a manual evaluation, an act of its own, and its first values (E8.2)", () => {
    const items = historyOf([entry({ event: "manual_started" }), entry({ event: "copy_opened" })]);
    expect(items.map((i) => [i.label, i.author, i.changes.length])).toEqual([
      ["Entered manually, without AI proposal", "Sarah Bennett", 0],
      ["Opened the copy", "Sarah Bennett", 0],
    ]);
    const first = historyOf([
      entry({ event: "evaluation_changed", field: "level.task", oldValue: null, newValue: 3, evaluationRevision: 1 }),
      entry({ event: "evaluation_created", newValue: { origin: "manual", rubricVersion: "en-1" }, evaluationRevision: 1 }),
    ]);
    expect(first.map((i) => i.label)).toEqual(["Entered the first values of their evaluation"]);
    expect(first[0].changes[0]).toMatchObject({ before: "None", after: expect.stringMatching(/^3 – /) });
  });

  it("E8.1: a validation says its nature; a publication, its withdrawal and a change sending a copy back are acts of their own", () => {
    const items = historyOf([
      entry({ event: "sent_back_to_review", newValue: { from: "published" } }),
      entry({ event: "unpublished", newValue: { revision: 2, cause: "change" } }),
      entry({ event: "unpublished", newValue: { revision: 2 } }),
      entry({ event: "published", newValue: { revision: 2 } }),
      entry({ event: "validated", newValue: { nature: "changed", revision: 2, finalGrade: 12 } }),
      entry({ event: "validated", newValue: { nature: "unchanged", revision: 1, finalGrade: 10 } }),
      entry({ event: "validated", newValue: { nature: "manual", revision: 1, finalGrade: 8 } }),
    ]);
    expect(items.map((i) => i.label)).toEqual([
      "Sent back to review by a change",
      "Withdrew the publication by a change",
      "Withdrew the publication",
      "Published the evaluation",
      "Validated after changes",
      "Validated without changes",
      "Validated (entered manually)",
    ]);
  });
});

describe("values in words", () => {
  it("never shows a raw value", () => {
    expect(fieldValue("reread.grammar", true)).toBe("To re-read");
    expect(fieldValue("grade_fixed", false)).toBe("Calculated");
    expect(fieldValue("next_steps", ["Check the spelling.", "Use linking words."])).toBe("Check the spelling.\nUse linking words.");
    expect(fieldValue("next_steps", [])).toBe("None");
    expect(fieldLabel("remark.mechanics")).toMatch(/: remark$/);
  });
});
