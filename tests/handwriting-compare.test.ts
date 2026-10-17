import { describe, expect, it } from "vitest";
import { compare, linesOutOfOrder } from "../explorations/handwriting/read-photos";

// E5.8 (out of the product): the comparison of a transcription with what was
// really written. The reading itself is an exploratory trial, recorded in conception/.

const reference = "my town it is a litle town\nbut very [illegible] and quiet.\nI like the river.";
const faults = [{ written: "litle", correct: "little" }];

describe("compare", () => {
  it("sees a faithful transcription: fault kept, illegible spot marked, lines in order", () => {
    const r = compare({ reference, faults }, reference);
    expect(r).toMatchObject({ substituted: 0, missing: 0, added: 0, faults: [{ result: "kept" }] });
    expect(r.illegible).toMatchObject({ inReference: 1, marked: 1, guessed: [] });
    expect(r.order).toEqual({ lines: 3, matched: 3, outOfOrder: 0 });
  });

  it("sees a corrected fault, a guessed word and a missing one", () => {
    const r = compare({ reference, faults }, "my town it is a little town\nbut very beautiful and quiet.\nlike the river.");
    expect(r.faults[0].result).toBe("corrected");
    expect(r.illegible.guessed).toEqual(["beautiful"]);
    expect(r.missing).toBe(1);
    expect(r.differences).toContain("litle → little");
  });

  it("counts the lines put out of order", () => {
    expect(linesOutOfOrder("one two three\nfour five six\nseven eight nine", "seven eight nine\none two three\nfour five six")).toEqual({
      lines: 3, matched: 3, outOfOrder: 1,
    });
  });
});
