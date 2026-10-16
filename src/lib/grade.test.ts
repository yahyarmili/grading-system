import { describe, expect, it } from "vitest";
import { GRADE_SCALE } from "@/config/decisions";
import { calculateGrade, formatGrade } from "./grade";
import { criterionIds, levels, MAX_LEVEL, type Level } from "./rubric";

// EVL-01 CA3, Q1 [D]: the grade is the sum of the five levels, out of 20.

/** Every combination of five levels: 5^5 = 3125. */
function* combinations(n: number): Generator<Level[]> {
  if (n === 0) {
    yield [];
    return;
  }
  for (const rest of combinations(n - 1)) for (const level of levels) yield [...rest, level];
}

describe("calculateGrade (CA3)", () => {
  it("gives the sum of the levels for every combination, within 0 and 20", () => {
    let count = 0;
    const reached = new Set<number>();
    for (const combination of combinations(criterionIds.length)) {
      const grade = calculateGrade(combination);
      expect(grade, combination.join(",")).toBe(combination.reduce<number>((sum, level) => sum + level, 0));
      expect(Number.isInteger(grade)).toBe(true);
      expect(grade).toBeGreaterThanOrEqual(0);
      expect(grade).toBeLessThanOrEqual(GRADE_SCALE);
      reached.add(grade);
      count++;
    }
    expect(count).toBe(3125);
    // Every whole grade from 0 to 20 is reachable, and nothing else.
    expect([...reached].sort((a, b) => a - b)).toEqual(Array.from({ length: GRADE_SCALE + 1 }, (_, i) => i));
  });

  it("reaches its bounds: all at 0 is the minimum, all at 4 the maximum", () => {
    expect(calculateGrade([0, 0, 0, 0, 0])).toBe(0);
    expect(calculateGrade([4, 4, 4, 4, 4])).toBe(20);
    expect(criterionIds.length * MAX_LEVEL).toBe(GRADE_SCALE);
  });

  it("does not depend on which criterion holds a level: each weighs the same", () => {
    expect(calculateGrade([4, 0, 0, 0, 0])).toBe(calculateGrade([0, 0, 0, 0, 4]));
  });

  it.each([
    ["four levels", [4, 4, 4, 4]],
    ["six levels", [1, 1, 1, 1, 1, 1]],
    ["a level above 4", [5, 0, 0, 0, 0]],
    ["a negative level", [-1, 0, 0, 0, 0]],
    ["a fraction", [2.5, 2, 2, 2, 2]],
    ["a level as text", ["2", 2, 2, 2, 2]],
    ["five empty places", new Array(5)],
    ["a hole after four levels", Object.assign(new Array(5), [4, 4, 4, 4])],
  ])("refuses %s rather than give a grade", (_label, wrong) => {
    expect(() => calculateGrade(wrong as unknown as Level[])).toThrow(RangeError);
  });

  it("shows the grade out of 20", () => {
    expect(formatGrade(14)).toBe("14 / 20");
  });
});
