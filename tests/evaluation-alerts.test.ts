import { describe, expect, it } from "vitest";
import { SHORT_TEXT_MIN_WORDS } from "@/config/provisional";
import { RUBRIC_VERSIONS } from "@/lib/rubric";
import { checkBlockingAlerts, countWords, isVeryShort } from "@/server/evaluation/alerts";
import { readSources } from "./helpers/access-inventory";
import { FR_TEST_RUBRIC } from "./fixtures/rubric-fr-test";

// EVL-04: the alerts the system raises itself, deterministic. Blocking: no
// letter, then no rubric for the language (EVL-01 R4). Information: very short.

const WITH_FRENCH = [...RUBRIC_VERSIONS, FR_TEST_RUBRIC];

describe("blocking alerts (R1), before any request", () => {
  it("gives no_content to a text without a letter, before the missing French rubric", () => {
    for (const text of ["12345 !!!", "...", "😀 👍", "3,14 / 2 = 1,57"]) {
      expect(checkBlockingAlerts({ text, language: "en" }, RUBRIC_VERSIONS)).toEqual({ cause: "no_content" });
      expect(checkBlockingAlerts({ text, language: "fr" }, RUBRIC_VERSIONS)).toEqual({ cause: "no_content" });
    }
  });

  it("finds a letter in any script", () => {
    for (const text of ["a", "é 1", "مرحبا", "日本", "Ωμέγα"]) {
      expect(checkBlockingAlerts({ text, language: "en" }, RUBRIC_VERSIONS)).toEqual({ rubric: RUBRIC_VERSIONS[0] });
    }
  });

  it("gives rubric_unavailable to a French text until a French rubric is published (EVL-01 CA4)", () => {
    expect(checkBlockingAlerts({ text: "Ma ville est petite.", language: "fr" }, RUBRIC_VERSIONS)).toEqual({ cause: "rubric_unavailable" });
    expect(checkBlockingAlerts({ text: "Ma ville est petite.", language: "fr" }, WITH_FRENCH)).toEqual({ rubric: FR_TEST_RUBRIC });
  });
});

describe("very short (R2)", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

  it("counts words, numbers included, punctuation and spaces left out", () => {
    expect(countWords("Hello, world!  42 ...", "en")).toBe(3);
    expect(countWords("Ma ville, c'est la plus belle !", "fr")).toBeGreaterThanOrEqual(5);
    expect(countWords("   \n", "en")).toBe(0);
  });

  it(`is under ${SHORT_TEXT_MIN_WORDS} words, the provisional threshold`, () => {
    expect(isVeryShort(words(SHORT_TEXT_MIN_WORDS - 1), "en")).toBe(true);
    expect(isVeryShort(words(SHORT_TEXT_MIN_WORDS), "en")).toBe(false);
    expect(isVeryShort(`${words(SHORT_TEXT_MIN_WORDS - 1)} !!! ... ,`, "fr")).toBe(true);
  });
});

describe("the French rubric used by the tests stays in the tests", () => {
  // Reads src/, scripts/ and e2e/: slow on the Windows bind mount.
  it("is named by no file outside tests/, and the application imports nothing from tests/", { timeout: 30_000 }, () => {
    const app = ["src", "scripts"].flatMap((directory) => readSources(directory, () => true));
    // The E2E suite is test code: it may share tests/setup (the test database), never this rubric.
    const outside = [...app, ...readSources("e2e", () => true)];
    expect(app.length).toBeGreaterThan(0);
    const named = outside.filter((file) => /rubric-fr-test|FR_TEST_RUBRIC/.test(file.text)).map((file) => file.path);
    const imports = app.filter((file) => /from\s+["'][^"']*\btests\//.test(file.text)).map((file) => file.path);
    expect([...named, ...imports]).toEqual([]);
  });

  it("is a French version unknown to the published registry", () => {
    expect(FR_TEST_RUBRIC.language).toBe("fr");
    expect(RUBRIC_VERSIONS.map((version) => version.id)).not.toContain(FR_TEST_RUBRIC.id);
  });
});
