// The single, fixed rubric (conception/solution.md, appendix). Read-only for everyone.
// English version; the French version is not validated yet (Q6).

export const MAX_LEVEL = 4;
export const levels = [0, 1, 2, 3, 4] as const;
export type Level = (typeof levels)[number];

export const levelNames: Record<Level, string> = {
  4: "Excellent",
  3: "Good",
  2: "Developing",
  1: "Limited",
  0: "Inadequate",
};

export type Criterion = {
  id: "task" | "organization" | "vocabulary" | "grammar" | "mechanics";
  name: string;
  weight: number; // percent
  descriptors: Record<Level, string>;
};

export const rubric: readonly Criterion[] = [
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
];

export function levelLabel(level: Level): string {
  return `${level} – ${levelNames[level]}`;
}
