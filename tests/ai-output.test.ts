import { describe, expect, it } from "vitest";
import { criterionIds } from "@/lib/rubric";
import { parseProposalOutput } from "@/server/ai/output";
import { normalizeForQuote, quoteFound } from "@/server/ai/quotes";
import { formatOutcomeLine } from "@/server/evaluation/evaluate";

// EVL-03 CA2: an answer outside the output contract is refused with its code,
// never repaired; quotes are found in the text despite copying slips, never
// when invented.

const TEXT =
  "Last summer I go to the beach with my familly. We was very happy becaus the wether was beatiful and the see was warm. " +
  "My brother he swimed all the day and I readed a book under a umbrella. It’s the best holiday of my life.";

const valid = () => ({
  criteria: Object.fromEntries(
    criterionIds.map((id) => [id, { level: 2, justification: "Some ideas.", quotes: ["I go to the beach with my familly"] }]),
  ),
  general_comment: "A lively text.",
  next_steps: ["Check the past tense of irregular verbs."],
  flags: { other_language: false, off_topic: false, addressed_to_marker: false },
});

type Answer = ReturnType<typeof valid>;
const parse = (answer: unknown) => parseProposalOutput(typeof answer === "string" ? answer : JSON.stringify(answer), TEXT);
const altered = (change: (a: Answer & Record<string, unknown>) => void) => {
  const answer = valid() as Answer & Record<string, unknown>;
  change(answer);
  return answer;
};

describe("parseProposalOutput (EVL-03 CA2)", () => {
  it("accepts a conform answer, trimmed, flags renamed", () => {
    const result = parse(altered((a) => (a.criteria.task.justification = "  Some ideas.  ")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.task).toEqual({ level: 2, justification: "Some ideas.", quotes: ["I go to the beach with my familly"] });
    expect(result.value.flags).toEqual({ otherLanguage: false, offTopic: false, addressedToMarker: false });
    expect(result.value.nextSteps).toEqual(["Check the past tense of irregular verbs."]);
  });

  it("refuses what is not JSON, a truncated answer included", () => {
    expect(parse("This is not JSON.")).toEqual({ ok: false, code: "not_json" });
    expect(parse(JSON.stringify(valid()).slice(0, 80))).toEqual({ ok: false, code: "not_json" });
  });

  it.each([
    ["a missing criterion", (a: Answer) => delete a.criteria.mechanics],
    ["an unknown criterion", (a: Answer) => (a.criteria.style = a.criteria.task)],
    ["an unknown key at the top", (a: Answer & Record<string, unknown>) => (a.grade = 10)],
    ["an unknown key in a criterion", (a: Answer) => Object.assign(a.criteria.task, { score: 2 })],
    ["level 2.5", (a: Answer) => (a.criteria.task.level = 2.5)],
    ['level "2"', (a: Answer) => ((a.criteria.task as { level: unknown }).level = "2")],
    ["level 5", (a: Answer) => (a.criteria.task.level = 5)],
    ["level -1", (a: Answer) => (a.criteria.task.level = -1)],
    ["a blank justification", (a: Answer) => (a.criteria.grammar.justification = "  ")],
    ["no quote", (a: Answer) => (a.criteria.grammar.quotes = [])],
    ["too many quotes", (a: Answer) => (a.criteria.grammar.quotes = Array(4).fill("We was very happy"))],
    ["a blank general comment", (a: Answer) => (a.general_comment = "")],
    ["no next step", (a: Answer) => (a.next_steps = [])],
    ["a missing flag", (a: Answer) => delete (a.flags as Partial<Answer["flags"]>).off_topic],
    ["an array instead of the object", (a: Answer) => ((a as { criteria: unknown }).criteria = [])],
  ])("refuses %s as schema", (_label, change) => {
    expect(parse(altered(change as (a: Answer & Record<string, unknown>) => void))).toEqual({ ok: false, code: "schema" });
  });

  it("refuses an invented quote", () => {
    const answer = altered((a) => (a.criteria.vocabulary.quotes = ["We was very happy", "The mountains were covered in snow"]));
    expect(parse(answer)).toEqual({ ok: false, code: "quote_not_found" });
  });
});

describe("quoteFound", () => {
  it("finds an exact excerpt, its mistakes included", () => {
    expect(quoteFound("My brother he swimed all the day", TEXT)).toBe(true);
  });

  it("forgives typographic quotes, case, spaces and decomposed accents", () => {
    expect(quoteFound("it's the BEST holiday", TEXT)).toBe(true);
    expect(quoteFound("We  was very\nhappy", TEXT)).toBe(true);
    const french = "Mon été à la plage était génial.";
    expect(quoteFound("mon été à la plage", french)).toBe(true);
    expect(normalizeForQuote("“Yes” — he said")).toBe('"yes" - he said');
  });

  it("forgives a few slips in a long quote of a very faulty text", () => {
    // Two letters "corrected" by the model in 52 characters: within 15 %.
    expect(quoteFound("We was very happy because the wether was beatiful", TEXT)).toBe(true);
    expect(quoteFound("I readed a book under an umbrella", TEXT)).toBe(true);
  });

  it("known limit at 15 %: a long quote corrected in a few places still passes (to set in E5.7)", () => {
    // Six edits in 52 characters: within floor(52 × 0.15) = 7.
    expect(quoteFound("We were very happy because the weather was beautiful", TEXT)).toBe(true);
    expect(quoteFound("We were very happy because the weather was beautiful", TEXT, 0.1)).toBe(false);
  });

  it("refuses a short quote with any slip, and an invented sentence", () => {
    // Six characters: no slip allowed (floor(6 × 0.15) = 0); seven allow one.
    expect(quoteFound("We wos", TEXT)).toBe(false);
    expect(quoteFound("We was", TEXT)).toBe(true);
    expect(quoteFound("the sea", TEXT)).toBe(true);
    expect(quoteFound("I went to the mountains with my friends last winter", TEXT)).toBe(false);
    expect(quoteFound("   ", TEXT)).toBe(false);
  });
});

describe("formatOutcomeLine", () => {
  it("says the state, the attempts, the duration and the error codes, nothing else", () => {
    expect(formatOutcomeLine("submission", { status: "to_review", attempts: 2, durationMs: 41, errors: ["schema"] })).toBe(
      "submission: to_review, 2 attempt(s), 41 ms, errors: schema",
    );
    expect(formatOutcomeLine("submission 1", { status: "skipped" })).toBe("submission 1: skipped (not received, or not a text)");
    expect(formatOutcomeLine("submission 2", { status: "error", kind: "TypeError" })).toBe("submission 2: error (TypeError)");
  });
});
