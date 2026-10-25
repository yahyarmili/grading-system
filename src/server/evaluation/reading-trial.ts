import { ILLEGIBLE } from "@/server/ai/reading";
import type { Usage } from "@/server/ai";
import { estimateCostUsd } from "./prices";

// The handwriting trial (E9.0, then the final fidelity trial; spec 0011,
// AC-19): what the reader wrote, compared with what was really written. Out
// of the pipeline: run by `npm run ai:read` on fictitious photos, its report
// copied as is into conception/ by hand. Words are compared as written (case
// and punctuation kept for the faults), lines for the order.

/** One photo of the trial: what was really written, faults included, each deliberately unreadable spot as the marker. */
export type TrialPhoto = {
  name: string;
  reference: string;
  /** Faults written on purpose: kept by a faithful reading, corrected by an unfaithful one. */
  faults: { written: string; correct: string }[];
};

/** The exploration of E5.8 wrote the marker in English: both mean the same spot. */
export const normalizeReference = (reference: string) => reference.replaceAll("[illegible]", ILLEGIBLE);

const tokens = (text: string) => text.split(/\s+/).filter(Boolean);
const bare = (word: string) => word.toLowerCase().replace(/^[^\p{L}\p{N}[]+|[^\p{L}\p{N}\]]+$/gu, "");

type Edit = { kind: "same" | "sub" | "del" | "ins"; ref?: string; out?: string };

/** Word alignment (Levenshtein on words, compared bare), with its operations. */
export function alignWords(reference: string[], output: string[]): Edit[] {
  const [n, m] = [reference.length, output.length];
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = bare(reference[i - 1]) === bare(output[j - 1]) ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const edits: Edit[] = [];
  let [i, j] = [n, m];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (bare(reference[i - 1]) === bare(output[j - 1]) ? 0 : 1)) {
      const same = bare(reference[i - 1]) === bare(output[j - 1]);
      edits.push({ kind: same ? "same" : "sub", ref: reference[i - 1], out: output[j - 1] });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      edits.push({ kind: "del", ref: reference[--i] });
    } else {
      edits.push({ kind: "ins", out: output[--j] });
    }
  }
  return edits.reverse();
}

/**
 * Reference lines found out of order in the output: n minus the longest run of
 * their positions that never goes back. Two lines the reader joined into one
 * share a position: in order, not moved.
 */
export function linesOutOfOrder(reference: string, output: string): { lines: number; matched: number; outOfOrder: number } {
  const refLines = reference.split("\n").map((l) => new Set(tokens(l).map(bare))).filter((s) => s.size > 0);
  const outLines = output.split("\n").map((l) => new Set(tokens(l).map(bare))).filter((s) => s.size > 0);
  const positions: number[] = [];
  for (const line of refLines) {
    let best = -1;
    let bestScore = 0.5; // at least half of the line's words
    outLines.forEach((out, k) => {
      const score = [...line].filter((w) => out.has(w)).length / line.size;
      if (score > bestScore) [best, bestScore] = [k, score];
    });
    if (best >= 0) positions.push(best);
  }
  const lis: number[] = [];
  for (const p of positions) {
    const k = lis.findIndex((x) => x > p);
    if (k === -1) lis.push(p);
    else lis[k] = p;
  }
  return { lines: refLines.length, matched: positions.length, outOfOrder: positions.length - lis.length };
}

export type Comparison = ReturnType<typeof compare>;

export function compare(photo: Pick<TrialPhoto, "reference" | "faults">, output: string) {
  const reference = normalizeReference(photo.reference);
  const edits = alignWords(tokens(reference), tokens(output));
  const outWords = new Set(tokens(output).map(bare));
  const faults = photo.faults.map((f) => ({
    ...f,
    result: outWords.has(bare(f.written)) ? "kept" : outWords.has(bare(f.correct)) ? "corrected" : "other",
  }));
  const marker = bare(ILLEGIBLE);
  const atIllegible = edits.filter((e) => e.ref !== undefined && bare(e.ref) === marker);
  return {
    words: tokens(reference).length,
    same: edits.filter((e) => e.kind === "same").length,
    substituted: edits.filter((e) => e.kind === "sub").length,
    missing: edits.filter((e) => e.kind === "del").length,
    added: edits.filter((e) => e.kind === "ins").length,
    faults,
    illegible: {
      inReference: atIllegible.length,
      marked: atIllegible.filter((e) => e.kind === "same").length,
      guessed: atIllegible.filter((e) => e.kind === "sub").map((e) => e.out!),
      markersInOutput: tokens(output).filter((w) => bare(w) === marker).length,
    },
    order: linesOutOfOrder(reference, output),
    differences: edits.filter((e) => e.kind !== "same").map((e) => `${e.ref ?? "∅"} → ${e.out ?? "∅"}`),
  };
}

/** One reading of the trial: the page sent, how the call ended, and the reading compared when it is one. */
export type ReadingTrialCall = {
  photo: string;
  run: number;
  /** The page as sent: its size after shrinking, and its JPEG bytes. */
  page: { width: number; height: number; bytes: number };
  durationMs: number;
  modelAnswered: string | null;
  stopReason: string | null;
  usage: Usage | null;
  /** A failed call: its kind, HTTP status, request-id and code, never a message. */
  failure: string | null;
  /** The raw answer: in the local JSON only, never in the report. */
  content: string | null;
  /** The answer as the schema reads it; null for a failed call or an answer off the schema. */
  reading: { hasWriting: boolean; text: string } | null;
  comparison: Comparison | null;
};

export type ReadingTrialSettings = {
  date: string;
  provider: string;
  model: string;
  promptVersion: string;
  generation: { effort: string; thinking: string; maxOutputTokens: number };
  /** The longest wait a student accepts for a page (READ_REQUEST_MAX_MS), shown against each duration. */
  readMaxMs: number;
};

const cell = (value: string | number) => String(value).replaceAll("|", "\\|");

/** The report, in Markdown: settings, then one line per call, then the totals. No text read, no raw answer. */
export function formatReadingReport(calls: ReadingTrialCall[], settings: ReadingTrialSettings): string {
  const { generation } = settings;
  const answered = [...new Set(calls.map((c) => c.modelAnswered).filter((m): m is string => m !== null))];
  const lines = [
    `Date: ${settings.date}. Provider: ${settings.provider}; model requested: ${settings.model}; answered: ${answered.join(", ") || "–"}.`,
    `Prompt ${settings.promptVersion}; effort ${generation.effort}, thinking ${generation.thinking}, max_tokens ${generation.maxOutputTokens}.`,
    "",
    "| Photo | Run | Page sent | Result | Duration | Words same / ref | Substituted | Missing | Added | Faults kept / corrected / other | Illegible marked / guessed of ref (markers out) | Lines out of order | Tokens in / out | Cost (USD) |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const c of calls) {
    const page = `${c.page.width}×${c.page.height}, ${Math.round(c.page.bytes / 1024)} KB`;
    const duration = `${c.durationMs} ms${c.durationMs > settings.readMaxMs ? " (over the wait)" : ""}`;
    const tokensUsed = c.usage ? `${c.usage.promptTokens ?? "?"} / ${c.usage.completionTokens ?? "?"}` : "–";
    const cost = estimateCostUsd(c.usage);
    const costCell = cost === null ? "–" : cost.toFixed(5);
    const result = c.failure ? `failed: ${c.failure}` : c.reading === null ? "off the schema" : c.reading.hasWriting ? "read" : "no writing";
    const r = c.comparison;
    if (!r) {
      lines.push(`| ${cell(c.photo)} | ${c.run} | ${page} | ${cell(result)} | ${duration} | | | | | | | | ${tokensUsed} | ${costCell} |`);
      continue;
    }
    const tally = (k: string) => r.faults.filter((f) => f.result === k).length;
    lines.push(
      `| ${cell(c.photo)} | ${c.run} | ${page} | ${result} | ${duration} | ${r.same} / ${r.words} | ${r.substituted} | ${r.missing} | ${r.added} | ${tally("kept")} / ${tally("corrected")} / ${tally("other")} | ${r.illegible.marked} / ${r.illegible.guessed.length} of ${r.illegible.inReference} (${r.illegible.markersInOutput}) | ${r.order.outOfOrder} of ${r.order.matched} matched (${r.order.lines} lines) | ${tokensUsed} | ${costCell} |`,
    );
  }
  const costs = calls.map((c) => estimateCostUsd(c.usage)).filter((v): v is number => v !== null);
  const durations = calls.filter((c) => !c.failure).map((c) => c.durationMs);
  lines.push(
    "",
    `Calls: ${calls.length}; failed: ${calls.filter((c) => c.failure).length}; off the schema: ${calls.filter((c) => !c.failure && !c.reading).length}.`,
    `Longest answered call: ${durations.length ? Math.max(...durations) : "–"} ms (student wait ${settings.readMaxMs} ms).`,
    `Estimated cost: ${costs.reduce((a, b) => a + b, 0).toFixed(5)} USD in all.`,
  );
  return lines.join("\n");
}
