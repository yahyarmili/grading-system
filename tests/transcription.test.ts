import { describe, expect, it } from "vitest";
import { applyWordChanges, assembleSegments, assembleText, ILLEGIBLE, pageSegments, wordsOf, type AssembledPage } from "@/lib/transcription";

// E9 (spec 0011): the words a student may change, the changes applied, and
// the pages assembled into the text sent to evaluation (AC-4, AC-6) and
// shown to the teacher next to the engine's words (REV-02 CA3, AC-13).

describe("wordsOf", () => {
  it("cuts on any whitespace, punctuation kept with its word", () => {
    expect(wordsOf("My town,  is\nsmall.\tYes")).toEqual(["My", "town,", "is", "small.", "Yes"]);
  });

  it(`counts ${ILLEGIBLE} as one word`, () => {
    expect(wordsOf(`the ${ILLEGIBLE} market`)).toEqual(["the", ILLEGIBLE, "market"]);
  });

  it("gives no word for an empty or blank reading", () => {
    expect(wordsOf("")).toEqual([]);
    expect(wordsOf(" \n\t ")).toEqual([]);
  });
});

describe("applyWordChanges (AC-4)", () => {
  const reading = "my town is beatiful.\n\nThe  peoples are friendly.";

  it("replaces each changed word by its index, whitespace and line breaks kept", () => {
    const changes = [
      { wordIndex: 3, engineWord: "beatiful.", studentWord: "beautiful." },
      { wordIndex: 5, engineWord: "peoples", studentWord: "people" },
    ];
    expect(applyWordChanges(reading, changes)).toBe("my town is beautiful.\n\nThe  people are friendly.");
  });

  it(`replaces an ${ILLEGIBLE} the student read, and the first and last words`, () => {
    const text = `${ILLEGIBLE} market every friday`;
    const changes = [
      { wordIndex: 0, engineWord: ILLEGIBLE, studentWord: "A" },
      { wordIndex: 3, engineWord: "friday", studentWord: "Friday" },
    ];
    expect(applyWordChanges(text, changes)).toBe("A market every Friday");
  });

  it("leaves the reading as is without changes, leading and trailing whitespace too", () => {
    expect(applyWordChanges("  as read \n")).toBe("  as read \n");
    expect(applyWordChanges("  as read \n", [])).toBe("  as read \n");
  });

  it("keeps the whitespace around a changed word at the edges", () => {
    expect(applyWordChanges("  one two  ", [{ wordIndex: 1, engineWord: "two", studentWord: "2" }])).toBe("  one 2  ");
  });

  it("refuses a change whose engine word is not the word at that index", () => {
    expect(() => applyWordChanges(reading, [{ wordIndex: 0, engineWord: "town", studentWord: "city" }])).toThrow("does not match");
  });

  it("ignores a change past the last word (the server refuses it before: badChange)", () => {
    expect(applyWordChanges("one two", [{ wordIndex: 9, engineWord: "x", studentWord: "y" }])).toBe("one two");
  });
});

describe("pageSegments (REV-02 CA3)", () => {
  it("cuts the reading where the student changed a word, with the engine's word beside it", () => {
    const segments = pageSegments("the peoples are nice", [{ wordIndex: 1, engineWord: "peoples", studentWord: "people" }]);
    expect(segments).toEqual([{ text: "the " }, { text: "people", engineWord: "peoples" }, { text: " are nice" }]);
  });

  it("gives two adjacent changes as two pieces, the space between them kept", () => {
    const segments = pageSegments("a b", [
      { wordIndex: 0, engineWord: "a", studentWord: "A" },
      { wordIndex: 1, engineWord: "b", studentWord: "B" },
    ]);
    expect(segments).toEqual([{ text: "A", engineWord: "a" }, { text: " " }, { text: "B", engineWord: "b" }]);
  });

  it("gives one piece without changes, and none for an empty reading", () => {
    expect(pageSegments("as read")).toEqual([{ text: "as read" }]);
    expect(pageSegments("")).toEqual([]);
  });
});

describe("assembleText (AC-4, AC-6)", () => {
  const pages: AssembledPage[] = [
    { position: 3, hasWriting: true, text: "third page" },
    { position: 1, hasWriting: true, text: "first pgae", changes: [{ wordIndex: 1, engineWord: "pgae", studentWord: "page" }] },
    { position: 2, hasWriting: false, text: "" },
  ];

  it("joins the pages with writing in position order, changes applied, by one blank line", () => {
    expect(assembleText(pages)).toBe("first page\n\nthird page");
  });

  it("keeps a word split across two pages as two words", () => {
    expect(assembleText([
      { position: 1, hasWriting: true, text: "beau" },
      { position: 2, hasWriting: true, text: "tiful" },
    ])).toBe("beau\n\ntiful");
  });

  it("gives an empty text, never null, when no page has writing", () => {
    expect(assembleText([{ position: 1, hasWriting: false, text: "" }])).toBe("");
    expect(assembleText([])).toBe("");
  });

  it("does not reorder the caller's pages", () => {
    const given = [...pages];
    assembleText(given);
    expect(given.map((p) => p.position)).toEqual([3, 1, 2]);
  });
});

describe("assembleSegments", () => {
  const pages: AssembledPage[] = [
    { position: 2, hasWriting: true, text: "second", changes: [{ wordIndex: 0, engineWord: "second", studentWord: "2nd" }] },
    { position: 1, hasWriting: true, text: "first" },
    { position: 3, hasWriting: false, text: "" },
  ];

  it("joined, gives the same text as assembleText", () => {
    expect(assembleSegments(pages).map((s) => s.text).join("")).toBe(assembleText(pages));
  });

  it("marks only the changed words, and puts the blank line between pages only", () => {
    expect(assembleSegments(pages)).toEqual([{ text: "first" }, { text: "\n\n" }, { text: "2nd", engineWord: "second" }]);
  });
});
