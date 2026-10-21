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
