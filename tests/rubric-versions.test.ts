import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assignmentLanguages } from "@/lib/assignment";
import {
  criterionIds,
  levels,
  manualRubricFor,
  publishedRubric,
  RUBRIC_VERSIONS,
  type RubricVersion,
} from "@/lib/rubric";

// EVL-01, NFR-QUA-02: the rubric is published by versions that never change.
// Each published version is frozen here by its digest: editing one fails
// this test. A change of text is a new version, appended with its digest
// (conception/procedures.md), so that every evaluation keeps the version it
// was made with.

const PUBLISHED: Record<string, string> = {
  // [D, 2026-10-16] The client's rubric word for word, level qualifiers included.
  "en-1": "1426a7b182de4aad7cefc2669c1991950bcfc2846e4560384bd8263dfdf6d8aa",
};

/** JSON with sorted keys: the digest depends on the content only. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const digest = (version: RubricVersion) => createHash("sha256").update(canonical(version)).digest("hex");

const levelKeys = levels.map(String);

describe("published versions never change", () => {
  it("keeps the digest of every published version, and loses none", () => {
    expect(Object.fromEntries(RUBRIC_VERSIONS.map((v) => [v.id, digest(v)]))).toEqual(PUBLISHED);
  });

  it("detects a change of a single character", () => {
    const [first] = RUBRIC_VERSIONS;
    const edited = structuredClone(first) as RubricVersion;
    (edited.criteria[0].descriptors as Record<number, string>)[4] += " ";
    expect(digest(edited)).not.toBe(digest(first));
  });

  it("names versions <language>-<n>, numbered from 1 in publication order, dated in order", () => {
    for (const language of assignmentLanguages) {
      const ofLanguage = RUBRIC_VERSIONS.filter((v) => v.language === language);
      expect(ofLanguage.map((v) => v.id)).toEqual(ofLanguage.map((_, i) => `${language}-${i + 1}`));
    }
    const dates = RUBRIC_VERSIONS.map((v) => v.publishedOn);
    for (const date of dates) expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("the rubric is read-only at run time (CA1)", () => {
  it("throws on any change of the registry, and stays the same", () => {
    const [first] = RUBRIC_VERSIONS;
    const before = digest(first);
    const attempts: (() => void)[] = [
      () => (RUBRIC_VERSIONS as RubricVersion[]).push(structuredClone(first)),
      () => ((RUBRIC_VERSIONS as RubricVersion[])[0] = structuredClone(first)),
      () => ((first as { id: string }).id = "en-0"),
      () => ((first.criteria as RubricVersion["criteria"][number][]).pop()),
      () => ((first.criteria[0] as { weight: number }).weight = 40),
      () => ((first.criteria[0].descriptors as Record<number, string>)[4] = "Anything goes."),
      () => ((first.levelNames[4] as { name: string }).name = "Perfect"),
    ];
    for (const attempt of attempts) expect(attempt).toThrow(TypeError);
    expect(RUBRIC_VERSIONS).toHaveLength(Object.keys(PUBLISHED).length);
    expect(digest(first)).toBe(before);
  });
});

describe.each(RUBRIC_VERSIONS.map((v) => [v.id, v] as const))("%s (CA2)", (_id, version) => {
  it("has exactly the five criteria of R1, in order, at 20% each", () => {
    expect(version.criteria.map((c) => c.id)).toEqual([...criterionIds]);
    expect(version.criteria.map((c) => c.weight)).toEqual([20, 20, 20, 20, 20]);
    expect(version.criteria.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
  });

  it("has whole levels from 0 to 4, each named and described for every criterion", () => {
    expect([...levels]).toEqual([0, 1, 2, 3, 4]);
    expect(Object.keys(version.levelNames).sort()).toEqual(levelKeys);
    for (const { name, qualifier } of Object.values(version.levelNames)) {
      expect(name.trim()).not.toBe("");
      expect(qualifier.trim()).not.toBe("");
    }
    for (const criterion of version.criteria) {
      expect(criterion.name.trim()).not.toBe("");
      expect(Object.keys(criterion.descriptors).sort()).toEqual(levelKeys);
      for (const text of Object.values(criterion.descriptors)) expect(text.trim()).not.toBe("");
    }
  });
});

describe("the version in force", () => {
  it("is en-1 in English; none in French until the client validates it (Q6)", () => {
    expect(publishedRubric("en")?.id).toBe("en-1");
    expect(publishedRubric("fr")).toBeNull();
  });

  it("is the latest version of its language", () => {
    const [en1] = RUBRIC_VERSIONS;
    const registry = [
      en1,
      { ...en1, id: "fr-1", language: "fr" },
      { ...en1, id: "en-2" },
    ] satisfies RubricVersion[];
    expect(publishedRubric("en", registry)?.id).toBe("en-2");
    expect(publishedRubric("fr", registry)?.id).toBe("fr-1");
  });
});

describe("the rubric of a manual evaluation (REV-06, Q6)", () => {
  it("is the language's own when published; the English one, said a substitute, while French has none", () => {
    expect(manualRubricFor("en")).toMatchObject({ version: { id: "en-1" }, substitute: false });
    expect(manualRubricFor("fr")).toMatchObject({ version: { id: "en-1" }, substitute: true });
    const [en1] = RUBRIC_VERSIONS;
    const withFrench = [en1, { ...en1, id: "fr-1", language: "fr" }] satisfies RubricVersion[];
    expect(manualRubricFor("fr", withFrench)).toMatchObject({ version: { id: "fr-1" }, substitute: false });
  });
});
