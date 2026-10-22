import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REVIEW_TEXT_MAX_LENGTH as MAX } from "@/config/provisional";
import { criterionIds, publishedRubric } from "@/lib/rubric";
import { parseProposalOutput } from "@/server/ai/output";
import { normalizeForQuote, quoteFound } from "@/server/ai/quotes";
import { buildEvaluationRequest } from "@/server/ai/request";
import { SimulatorEvaluator } from "@/server/ai/simulator";
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

  // C5 (E7): an accepted proposal starts the teacher's form and must save
  // unchanged. The form joins the next steps by "\n" and the server splits
  // them by line; each text must fit the teacher's box (REVIEW_TEXT_MAX_LENGTH,
  // string length, as src/server/review/evaluation.ts counts it).
  it.each([
    ["a next step with a line break", (a: Answer) => (a.next_steps = ["Practise:\n- past tense"])],
    ["a next step with a Windows line break", (a: Answer) => (a.next_steps = ["Practise:\r\n- past tense"])],
    ["a next step with a carriage return", (a: Answer) => (a.next_steps = ["Practise:\r- past tense"])],
    ["a second next step with a line break", (a: Answer) => a.next_steps.push("Read it again.\nAloud.")],
    ["a justification over the teacher's box", (a: Answer) => (a.criteria.task.justification = "x".repeat(MAX + 1))],
    ["a general comment over the teacher's box", (a: Answer) => (a.general_comment = "x".repeat(MAX + 1))],
    ["a next step over the teacher's box", (a: Answer) => (a.next_steps = ["x".repeat(MAX + 1)])],
    // The form shows "a\nb": MAX - 1 + 1 + 2 characters.
    ["next steps that fit one by one, not joined", (a: Answer) => (a.next_steps = ["x".repeat(MAX - 1), "xx"])],
  ])("refuses %s as schema", (_label, change) => {
    expect(parse(altered(change as (a: Answer & Record<string, unknown>) => void))).toEqual({ ok: false, code: "schema" });
  });

  it("accepts texts of exactly the teacher's box once trimmed, and the steps the form saves back unchanged", () => {
    const full = "x".repeat(MAX);
    const steps = ["x".repeat(MAX - 3), "xx"]; // Joined: MAX characters.
    const result = parse(
      altered((a) => {
        a.criteria.task.justification = `  ${full}  `;
        a.general_comment = full;
        a.next_steps = steps;
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.task.justification).toBe(full);
    expect(result.value.generalComment).toBe(full);
    // What the form sends untouched (evaluation-form.tsx) and the server reads back (review/evaluation.ts).
    const formBox = result.value.nextSteps.join("\n");
    expect(formBox.length).toBeLessThanOrEqual(MAX);
    expect(formBox.split("\n").map((line) => line.trim()).filter(Boolean)).toEqual(result.value.nextSteps);
  });

  it("accepts every answer of the simulator, on each text of the trial sets (scripts/fixtures/ai)", async () => {
    const rubric = publishedRubric("en")!;
    const entries = ["dev", "adversarial", "sensitive"].flatMap(
      (set) => JSON.parse(readFileSync(`scripts/fixtures/ai/${set}.json`, "utf8")) as { text: string; subject?: string; instructions?: string | null }[],
    );
    expect(entries.length).toBeGreaterThan(0);
    const simulator = new SimulatorEvaluator();
    for (const entry of entries) {
      const request = buildEvaluationRequest(
        { text: entry.text, subject: entry.subject ?? "My town", instructions: entry.instructions ?? null, language: "en" },
        rubric,
      );
      const response = await simulator.evaluate(request, { signal: new AbortController().signal, subjectId: null });
      expect(parseProposalOutput(response.content, entry.text).ok).toBe(true);
    }
    const french = "Ma ville est petite mais très belle.";
    const response = await simulator.evaluate(
      buildEvaluationRequest({ text: french, subject: "Ma ville", instructions: null, language: "fr" }, rubric),
      { signal: new AbortController().signal, subjectId: null },
    );
    expect(parseProposalOutput(response.content, french).ok).toBe(true);
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
