import "server-only";
import {
  ADVERSARIAL_MAX_LEVEL_GAP,
  AI_CALL_TIMEOUT_MS,
  AI_RETRY_DELAY_MS,
  AI_RETRY_MAX_WAIT_MS,
} from "@/config/provisional";
import type { EvaluationError, ProposalAlert } from "@/lib/evaluation";
import { criterionIds, publishedRubric, type CriterionId } from "@/lib/rubric";
import { EvaluatorError, type Evaluator } from "@/server/ai";
import { parseProposalOutput } from "@/server/ai/output";
import { buildEvaluationRequest, PROMPT_VERSION } from "@/server/ai/request";
import { isVeryShort } from "@/server/evaluation/alerts";

// The trial sets of the evaluation (E5.7, EVL-03 CA3): fictitious English
// texts sent one by one through the same request builder and validator as
// the service, nothing stored but the security log. Each run is one request
// per text: a refused answer is recorded as it is, never retried, so that the
// report shows the raw rejection rate. Only a rate limit (429) is retried,
// after its Retry-After, and counted apart. The report states numbers, never
// a conclusion on quality: the texts are written by adults (D10).

/** A text of the development set: what it is meant to exercise, in `kinds`. */
export type DevText = { id: string; kinds: string[]; subject: string; instructions: string | null; text: string };

/** A text of the adversarial set: its base text with an instruction to the marker injected. */
export type AdversarialText = { id: string; baseId: string; attack: string; text: string };

export type TrialText = { id: string; subject: string; instructions: string | null; text: string; baseId?: string };

export type TrialCall = {
  run: number;
  id: string;
  outcome: "proposed" | "rejected" | "error" | "not_sent";
  /** The validator's code (rejected), the error kind (error), or "daily_limit" (not_sent). */
  code?: EvaluationError | "daily_limit";
  levels?: Record<CriterionId, number>;
  alerts?: ProposalAlert[];
  /** HTTP requests sent for this text in this run, rate-limited ones included. */
  requests: number;
  rateLimited: number;
  modelAnswered?: string | null;
  providerAnswered?: string | null;
  durationMs?: number;
  /** The raw answer, kept for the record (fictitious texts only, DON-02). */
  content?: string;
};

export type TrialDeps = {
  evaluator: Evaluator;
  /** Requests still allowed today; checked before each one. */
  remaining: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  pauseMs: number;
  callTimeoutMs?: number;
  /** Retries of a rate-limited request, at most. */
  maxRateLimitRetries?: number;
};

/** The texts of both sets, in one list: each adversarial text takes its base's subject and instructions. */
export function trialTexts(dev: DevText[], adversarial: AdversarialText[]): TrialText[] {
  const byId = new Map(dev.map((entry) => [entry.id, entry]));
  return [
    ...dev.map(({ id, subject, instructions, text }) => ({ id, subject, instructions, text })),
    ...adversarial.map(({ id, baseId, text }) => {
      const base = byId.get(baseId);
      if (!base) throw new Error(`${id}: unknown base text ${baseId}`);
      return { id, baseId, subject: base.subject, instructions: base.instructions, text };
    }),
  ];
}

async function callOnce(entry: TrialText, run: number, deps: TrialDeps, first: boolean): Promise<TrialCall> {
  const rubric = publishedRubric("en")!;
  const request = buildEvaluationRequest(
    { text: entry.text, subject: entry.subject, instructions: entry.instructions, language: "en" },
    rubric,
  );
  const call: TrialCall = { run, id: entry.id, outcome: "error", requests: 0, rateLimited: 0 };
  const maxRetries = deps.maxRateLimitRetries ?? 2;
  let wait = first ? 0 : deps.pauseMs;
  for (;;) {
    if (wait > 0) await deps.sleep(wait);
    if ((await deps.remaining()) <= 0) {
      return call.requests === 0 ? { ...call, outcome: "not_sent", code: "daily_limit" } : { ...call, code: "rate_limited" };
    }
    call.requests++;
    const started = performance.now();
    try {
      const response = await deps.evaluator.evaluate(request, {
        signal: AbortSignal.timeout(deps.callTimeoutMs ?? AI_CALL_TIMEOUT_MS),
        subjectId: null,
      });
      call.durationMs = Math.round(performance.now() - started);
      call.modelAnswered = response.modelAnswered;
      call.providerAnswered = response.providerAnswered;
      call.content = response.content;
      const parsed = parseProposalOutput(response.content, entry.text);
      if (!parsed.ok) return { ...call, outcome: "rejected", code: parsed.code };
      const { criteria, flags } = parsed.value;
      const alerts: ProposalAlert[] = [];
      if (isVeryShort(entry.text, "en")) alerts.push("very_short");
      if (flags.otherLanguage) alerts.push("other_language");
      if (flags.offTopic) alerts.push("off_topic");
      if (flags.addressedToMarker) alerts.push("addressed_to_marker");
      return {
        ...call,
        outcome: "proposed",
        levels: Object.fromEntries(criterionIds.map((id) => [id, criteria[id].level])) as Record<CriterionId, number>,
        alerts,
      };
    } catch (error) {
      call.durationMs = Math.round(performance.now() - started);
      if (!(error instanceof EvaluatorError)) return { ...call, code: "internal" };
      if (error.kind === "rate_limited" && call.rateLimited < maxRetries) {
        call.rateLimited++;
        wait = Math.min(error.retryAfterMs ?? AI_RETRY_DELAY_MS, AI_RETRY_MAX_WAIT_MS);
        continue;
      }
      if (error.kind === "rate_limited") call.rateLimited++;
      return { ...call, code: error.kind };
    }
  }
}

/** `runs` runs over the texts, one after the other; a run never stops on a failure, only on the daily limit. */
export async function runTrial(texts: TrialText[], runs: number, deps: TrialDeps): Promise<TrialCall[]> {
  const calls: TrialCall[] = [];
  for (let run = 1; run <= runs; run++) {
    for (const entry of texts) calls.push(await callOnce(entry, run, deps, calls.length === 0));
  }
  return calls;
}

type Levels = Record<CriterionId, number>;
const gaps = (a: Levels, b: Levels) => criterionIds.map((id) => Math.abs(a[id] - b[id]));
const levelsText = (levels?: Levels) => (levels ? criterionIds.map((id) => levels[id]).join(" ") : "–");

/** The report, in Markdown: counts, each call, stability over two runs, adversarial gaps. Numbers only. */
export function formatTrialReport(
  texts: TrialText[],
  calls: TrialCall[],
  meta: { date: string; model: string; provider: string; runs: number; maxGap?: number },
): string {
  const maxGap = meta.maxGap ?? ADVERSARIAL_MAX_LEVEL_GAP;
  const find = (run: number, id: string) => calls.find((c) => c.run === run && c.id === id);
  const count = (predicate: (c: TrialCall) => boolean) => calls.filter(predicate).length;
  const codes = (outcome: TrialCall["outcome"]) => {
    const tally = new Map<string, number>();
    for (const c of calls) if (c.outcome === outcome && c.code) tally.set(c.code, (tally.get(c.code) ?? 0) + 1);
    return [...tally].map(([code, n]) => `${code} × ${n}`).join(", ") || "none";
  };
  const answered = [...new Set(calls.flatMap((c) => (c.outcome === "proposed" || c.outcome === "rejected" ? [`${c.modelAnswered ?? "(not said)"} / ${c.providerAnswered ?? "(not said)"}`] : [])))];

  const lines = [
    `Date: ${meta.date}. Provider: ${meta.provider}. Model requested: ${meta.model}. Prompt: ${PROMPT_VERSION}. Rubric: en-1. Runs: ${meta.runs}.`,
    `Model / provider that answered: ${answered.join("; ") || "–"}.`,
    "",
    "| Count | Value |",
    "|---|---|",
    `| Texts × runs | ${calls.length} |`,
    `| Requests sent (429 included) | ${calls.reduce((n, c) => n + c.requests, 0)} |`,
    `| Rate-limited answers (429), retried | ${calls.reduce((n, c) => n + c.rateLimited, 0)} |`,
    `| Conform proposals | ${count((c) => c.outcome === "proposed")} |`,
    `| Refused answers | ${count((c) => c.outcome === "rejected")} (${codes("rejected")}) |`,
    `| Failed calls | ${count((c) => c.outcome === "error")} (${codes("error")}) |`,
    `| Not sent (daily limit) | ${count((c) => c.outcome === "not_sent")} |`,
    "",
    `Levels in the order ${criterionIds.join(", ")}.`,
    "",
    `| Text | ${Array.from({ length: meta.runs }, (_, i) => `Run ${i + 1}`).join(" | ")} | Alerts (run 1) |`,
    `|---|${"---|".repeat(meta.runs)}---|`,
    ...texts.map((t) => {
      const cells = Array.from({ length: meta.runs }, (_, i) => {
        const c = find(i + 1, t.id);
        if (!c) return "–";
        if (c.outcome === "proposed") return levelsText(c.levels);
        return `${c.outcome}: ${c.code}`;
      });
      return `| ${t.id} | ${cells.join(" | ")} | ${find(1, t.id)?.alerts?.join(", ") || "–"} |`;
    }),
  ];

  if (meta.runs >= 2) {
    const pairs = texts.flatMap((t) => {
      const [a, b] = [find(1, t.id), find(2, t.id)];
      return a?.levels && b?.levels ? [{ id: t.id, gaps: gaps(a.levels, b.levels) }] : [];
    });
    const all = pairs.flatMap((p) => p.gaps);
    lines.push(
      "",
      "Stability, run 1 against run 2 (texts with a proposal in both):",
      `- texts compared: ${pairs.length} of ${texts.length};`,
      `- criteria with the same level: ${all.filter((g) => g === 0).length} of ${all.length};`,
      `- gap of 1: ${all.filter((g) => g === 1).length}; gap of 2 or more: ${all.filter((g) => g >= 2).length};`,
      `- texts with a different level on at least one criterion: ${pairs.filter((p) => p.gaps.some((g) => g > 0)).map((p) => p.id).join(", ") || "none"}.`,
    );
  }

  const adversarial = texts.filter((t) => t.baseId);
  if (adversarial.length > 0) {
    lines.push(
      "",
      `Adversarial set (EVL-03 CA3): largest gap on any criterion with the base text, in the same run; allowed: ${maxGap} (provisional).`,
      "",
      `| Text | Base | ${Array.from({ length: meta.runs }, (_, i) => `Run ${i + 1}`).join(" | ")} | Flag addressed_to_marker |`,
      `|---|---|${"---|".repeat(meta.runs)}---|`,
      ...adversarial.map((t) => {
        const cells = Array.from({ length: meta.runs }, (_, i) => {
          const [a, b] = [find(i + 1, t.id), find(i + 1, t.baseId!)];
          if (!a?.levels || !b?.levels) return "not comparable";
          const gap = Math.max(...gaps(a.levels, b.levels));
          return `${gap}: ${gap > maxGap ? "CA3 not met" : "CA3 met"}`;
        });
        const flags = Array.from({ length: meta.runs }, (_, i) => {
          const c = find(i + 1, t.id);
          return c?.alerts ? (c.alerts.includes("addressed_to_marker") ? "yes" : "no") : "–";
        });
        return `| ${t.id} | ${t.baseId} | ${cells.join(" | ")} | ${flags.join(" / ")} |`;
      }),
    );
  }
  return lines.join("\n");
}
