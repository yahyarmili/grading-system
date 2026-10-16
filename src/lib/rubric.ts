import type { AssignmentLanguage } from "./assignment";

// The single, fixed rubric (EVL-01), as published versions. Read-only for
// everyone (invariant 8): the versions live in this file, never in the
// database, and no screen or action writes them. Kept free of value imports:
// the database schema reads it, and drizzle-kit loads the schema alone.
//
// A published version never changes: tests/rubric-versions.test.ts freezes its
// digest. To change a text, or to publish the French version once the client
// has validated it (Q6), append a new version: conception/procedures.md.

export const MAX_LEVEL = 4;
export const levels = [0, 1, 2, 3, 4] as const;
export type Level = (typeof levels)[number];

/** R1 [D]: the same five criteria, in this order, in every version and both languages. */
export const criterionIds = ["task", "organization", "vocabulary", "grammar", "mechanics"] as const;
export type CriterionId = (typeof criterionIds)[number];

export type LevelName = { name: string; qualifier: string };

export type Criterion = {
  id: CriterionId;
  name: string;
  weight: number; // percent
  descriptors: Record<Level, string>;
};

export type RubricVersion = {
  /** "<language>-<n>", recorded with each evaluation (R2). */
  id: string;
  language: AssignmentLanguage;
  /** Day of publication, YYYY-MM-DD. */
  publishedOn: string;
  levelNames: Record<Level, LevelName>;
  criteria: readonly Criterion[];
};

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/**
 * [D, 2026-10-16] en-1: the client's rubric word for word (conception/solution.md,
 * appendix), level qualifiers included.
 */
const EN_1: RubricVersion = {
  id: "en-1",
  language: "en",
  publishedOn: "2026-10-16",
  levelNames: {
    4: { name: "Excellent", qualifier: "Full marks" },
    3: { name: "Good", qualifier: "High level" },
    2: { name: "Developing", qualifier: "Partial level" },
    1: { name: "Limited", qualifier: "Low level" },
    0: { name: "Inadequate", qualifier: "No evidence" },
  },
  criteria: [
    {
      id: "task",
      name: "Task Achievement / Content",
      weight: 20,
      descriptors: {
        4: "Fully addresses the task; ideas relevant and well developed.",
        3: "Addresses the task; ideas adequately developed.",
        2: "Partially addresses the task; ideas limited or somewhat developed.",
        1: "Limited relevance to the task; ideas underdeveloped or unclear.",
        0: "Does not address the task or is completely irrelevant.",
      },
    },
    {
      id: "organization",
      name: "Organization & Cohesion",
      weight: 20,
      descriptors: {
        4: "Clear and logical structure; well-organized paragraphs; effective use of cohesive devices and transitions.",
        3: "Generally clear structure; minor lapses in organization or cohesion.",
        2: "Some organizational problems; limited use of cohesive devices; ideas can be difficult to follow at times.",
        1: "Weak organization; frequent lapses in cohesion, lacks flow and connection.",
        0: "No clear organization; ideas are random or disconnected.",
      },
    },
    {
      id: "vocabulary",
      name: "Vocabulary Range & Accuracy",
      weight: 20,
      descriptors: {
        4: "Wide range of vocabulary; precise, natural and appropriate use; minimal inaccuracies.",
        3: "Adequate range of vocabulary; generally appropriate use; some minor inaccuracies.",
        2: "Limited range of vocabulary; frequent misuse or repetition; some words used inappropriately.",
        1: "Very limited range; mostly basic vocabulary; frequent misuse and awkward wording.",
        0: "Extremely limited or inaccurate vocabulary; severely affects meaning.",
      },
    },
    {
      id: "grammar",
      name: "Grammatical Range & Accuracy",
      weight: 20,
      descriptors: {
        4: "Wide range of structures; largely accurate with very few errors.",
        3: "Generally accurate; minor errors that do not interfere with meaning.",
        2: "Limited range of structures; noticeable errors; meaning usually clear.",
        1: "Frequent errors; meaning sometimes unclear.",
        0: "Persistent errors; seriously obstruct meaning.",
      },
    },
    {
      id: "mechanics",
      name: "Mechanics",
      weight: 20,
      descriptors: {
        4: "Very few spelling, punctuation and capitalization errors.",
        3: "Some minor errors that do not distract the reader.",
        2: "Noticeable errors in spelling, punctuation or capitalization.",
        1: "Frequent errors that distract the reader.",
        0: "Errors are pervasive and make the text difficult to read.",
      },
    },
  ],
};

/**
 * Every published version, oldest first. Append only, never edit: a frozen
 * copy, so that changing a version at run time throws.
 */
export const RUBRIC_VERSIONS: readonly RubricVersion[] = deepFreeze([EN_1]);

/**
 * The version in force for a language: its latest published one, or null
 * when there is none (French, until the client validates it: Q6, R4).
 * `registry` lets the tests publish a version of their own.
 */
export function publishedRubric(
  language: AssignmentLanguage,
  registry: readonly RubricVersion[] = RUBRIC_VERSIONS,
): RubricVersion | null {
  return registry.findLast((version) => version.language === language) ?? null;
}

/** The English rubric in force, for the screens that show a single one (mockups). */
export const rubric = EN_1.criteria;
export const levelNames: Record<Level, string> = {
  4: EN_1.levelNames[4].name,
  3: EN_1.levelNames[3].name,
  2: EN_1.levelNames[2].name,
  1: EN_1.levelNames[1].name,
  0: EN_1.levelNames[0].name,
};

export function levelLabel(level: Level): string {
  return `${level} – ${levelNames[level]}`;
}
