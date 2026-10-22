import { describe, expect, it } from "vitest";
import { criterionIds } from "@/lib/rubric";
import { clearDraft, parseDraft, storedDraft, writeDraft, type Draft, type DraftScope } from "./unsaved-draft";

// C1: the copy of changes not saved kept in the tab (evaluation-form.tsx).

const draft: Draft = {
  levels: Object.fromEntries(criterionIds.map((id) => [id, 2])) as Draft["levels"],
  remarks: Object.fromEntries(criterionIds.map((id) => [id, `Remark ${id}.`])) as Draft["remarks"],
  generalComment: "Typed, not saved.",
  nextSteps: "Read more.\nWrite more.",
  gradeFixed: true,
  gradeText: "12.5",
  rereadDone: [criterionIds[0]],
};

const scope: DraftScope = { submissionId: "s-1", versionNumber: 1, proposalId: "p-1", revision: 3 };

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const refusing = (): Storage =>
  ({
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  }) as unknown as Storage;

describe("unsaved draft", () => {
  it("gives back what was written, for the same submission, version, proposal and revision", () => {
    const storage = memoryStorage();
    writeDraft(storage, scope, draft);
    expect(parseDraft(storedDraft(storage, "s-1"), scope)).toEqual({ kind: "restore", draft });
    // One entry per submission: another one has nothing.
    expect(parseDraft(storedDraft(storage, "s-2"), { ...scope, submissionId: "s-2" })).toEqual({ kind: "none" });
  });

  it("gives back a draft typed over another revision as outdated: the form restores it and the teacher chooses", () => {
    const storage = memoryStorage();
    writeDraft(storage, scope, draft);
    expect(parseDraft(storedDraft(storage, "s-1"), { ...scope, revision: 4 })).toEqual({ kind: "outdated", draft });
    expect(parseDraft(storedDraft(storage, "s-1"), { ...scope, revision: 2 })).toEqual({ kind: "outdated", draft });
  });

  it("ignores a draft of another version or proposal (the copy replaced), and anything unreadable", () => {
    const storage = memoryStorage();
    writeDraft(storage, scope, draft);
    const raw = storedDraft(storage, "s-1");
    expect(parseDraft(raw, { ...scope, versionNumber: 2 })).toEqual({ kind: "none" });
    expect(parseDraft(raw, { ...scope, proposalId: "p-2" })).toEqual({ kind: "none" });
    expect(parseDraft("", scope)).toEqual({ kind: "none" });
    expect(parseDraft("{not json", scope)).toEqual({ kind: "none" });
    const stored = JSON.parse(raw);
    expect(parseDraft(JSON.stringify({ ...stored, draft: { ...draft, levels: { ...draft.levels, task: 7 } } }), scope)).toEqual({ kind: "none" });
    expect(parseDraft(JSON.stringify({ ...stored, draft: { ...draft, rereadDone: ["style"] } }), scope)).toEqual({ kind: "none" });
    expect(parseDraft(JSON.stringify({ ...stored, draft: { ...draft, generalComment: undefined } }), scope)).toEqual({ kind: "none" });
  });

  it("erases the entry", () => {
    const storage = memoryStorage();
    writeDraft(storage, scope, draft);
    clearDraft(storage, "s-1");
    expect(storedDraft(storage, "s-1")).toBe("");
    expect(storage.length).toBe(0);
  });

  it("never throws: storage refused or missing reads as nothing", () => {
    for (const storage of [refusing(), null]) {
      expect(() => writeDraft(storage, scope, draft)).not.toThrow();
      expect(() => clearDraft(storage, "s-1")).not.toThrow();
      expect(storedDraft(storage, "s-1")).toBe("");
    }
  });
});
