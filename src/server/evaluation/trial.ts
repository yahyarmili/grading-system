import "server-only";
import { AI_INFERENCE_GEO } from "@/config/decisions";
import {
  ADVERSARIAL_MAX_LEVEL_GAP,
  AI_CALL_TIMEOUT_MS,
  AI_EFFORT,
  AI_MAX_OUTPUT_TOKENS,
  AI_RETRY_DELAY_MS,
  AI_RETRY_MAX_WAIT_MS,
  AI_THINKING,
} from "@/config/provisional";
import type { EvaluationError, ProposalAlert } from "@/lib/evaluation";
import { criterionIds, publishedRubric, type CriterionId } from "@/lib/rubric";
import { EvaluatorError, type Evaluator, type Usage } from "@/server/ai";
import { parseProposalOutput } from "@/server/ai/output";
import { buildEvaluationRequest, PROMPT_VERSION } from "@/server/ai/request";
import { isVeryShort } from "@/server/evaluation/alerts";
import { estimateCostUsd, PRICES } from "@/server/evaluation/prices";

// The trial sets of the evaluation (E5.7, EVL-03 CA3; instrumented in E5.14):
// fictitious English texts sent one by one through the same request builder
// and validator as the service, nothing stored but the security log. Each run
// is one request per text: a rejected answer or a refusal is recorded as it
// is, never retried, so that the report shows the raw rates. Only a rate limit
// (429) is retried, after its Retry-After, and counted apart. The report
// states numbers, never a conclusion on quality: the texts are written by
// adults (D10).

/** A text of the development or sensitive set: what it is meant to exercise, in `kinds`. */
export type DevText = { id: string; kinds: string[]; subject: string; instructions: string | null; text: string };

/** A text of the adversarial set: its base text with an instruction to the marker injected. */
export type AdversarialText = { id: string; baseId: string; attack: string; text: string };

export type TrialText = { id: string; subject: string; instructions: string | null; text: string; baseId?: string };

export type TrialSets = { dev: DevText[]; adversarial: AdversarialText[]; sensitive: DevText[] };

export const TRIAL_SETS = ["dev", "adversarial", "sensitive", "all"] as const;
export type TrialSet = (typeof TRIAL_SETS)[number];

/** Retries of a rate-limited request, at most, by default. */
export const TRIAL_RATE_LIMIT_RETRIES = 2;

export type TrialCall = {
  run: number;
  id: string;
  outcome: "proposed" | "rejected" | "error" | "not_sent";
  /** The validator's code (rejected), the error kind (error, `refused` included), or "daily_limit" (not_sent). */
  code?: EvaluationError | "daily_limit";
  /** The provider's code of a failure: error type, or `refusal/<category>` (`refusal/null` when none). */
  providerCode?: string;
  /** HTTP status and request-id of a failed answer: identifiers, for the trial's files only. */
  status?: number;
  requestId?: string;
  levels?: Record<CriterionId, number>;
  alerts?: ProposalAlert[];
  /** HTTP requests sent for this text in this run, rate-limited ones included. */
  requests: number;
  rateLimited: number;
  /** The rubric of the request, read from the registry. */
  rubricVersion: string;
  /** The first call of this trial with its answer schema: the provider may compile its grammar first (kept 24 h). */
  firstUseOfSchema?: true;
  modelAnswered?: string | null;
  stopReason?: string | null;
  /** What the provider counted, its detail included (cache, inference_geo): from the trial's files only, never stored. */
  usage?: Usage | null;
  /** At the published prices (prices.ts); null when the provider did not count. */
  costUsd?: number | null;
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
  /** Told of each call as soon as it ends (the command prints it). */
  onCall?: (call: TrialCall) => void;
};

/** The texts of the sets, in one list: each adversarial text takes its base's subject and instructions. */
export function trialTexts(dev: DevText[], adversarial: AdversarialText[], sensitive: DevText[] = []): TrialText[] {
  const byId = new Map(dev.map((entry) => [entry.id, entry]));
  const plain = ({ id, subject, instructions, text }: DevText) => ({ id, subject, instructions, text });
  return [
    ...dev.map(plain),
    ...adversarial.map(({ id, baseId, text }) => {
      const base = byId.get(baseId);
      if (!base) throw new Error(`${id}: unknown base text ${baseId}`);
      return { id, baseId, subject: base.subject, instructions: base.instructions, text };
    }),
    ...sensitive.map(plain),
  ];
}

/**
 * The texts of a set, in its order: `adversarial` brings its base texts first;
 * `all` is dev, adversarial, then sensitive. With `limit`, only the first ones.
 */
export function selectTexts(set: TrialSet, sets: TrialSets, limit?: number): TrialText[] {
  const bases = new Set(sets.adversarial.map((entry) => entry.baseId));
  const texts =
    set === "dev"
      ? trialTexts(sets.dev, [])
      : set === "adversarial"
        ? trialTexts(sets.dev.filter((entry) => bases.has(entry.id)), sets.adversarial)
        : set === "sensitive"
          ? trialTexts([], [], sets.sensitive)
          : trialTexts(sets.dev, sets.adversarial, sets.sensitive);
  return limit === undefined ? texts : texts.slice(0, limit);
}

async function callOnce(entry: TrialText, run: number, deps: TrialDeps, first: boolean, schemas: Set<string>): Promise<TrialCall> {
  const rubric = publishedRubric("en")!;
  const request = buildEvaluationRequest(
    { text: entry.text, subject: entry.subject, instructions: entry.instructions, language: "en" },
    rubric,
  );
  const call: TrialCall = { run, id: entry.id, outcome: "error", requests: 0, rateLimited: 0, rubricVersion: rubric.id };
  const maxRetries = deps.maxRateLimitRetries ?? TRIAL_RATE_LIMIT_RETRIES;
  const schema = JSON.stringify(request.schema);
  let wait = first ? 0 : deps.pauseMs;
  for (;;) {
    if (wait > 0) await deps.sleep(wait);
    if ((await deps.remaining()) <= 0) {
      return call.requests === 0 ? { ...call, outcome: "not_sent", code: "daily_limit" } : { ...call, code: "rate_limited" };
    }
    call.requests++;
    if (!schemas.has(schema)) {
      schemas.add(schema);
      call.firstUseOfSchema = true;
    }
    const started = performance.now();
    try {
      const response = await deps.evaluator.evaluate(request, {
        signal: AbortSignal.timeout(deps.callTimeoutMs ?? AI_CALL_TIMEOUT_MS),
        subjectId: null,
      });
      call.durationMs = Math.round(performance.now() - started);
      call.modelAnswered = response.modelAnswered;
      call.stopReason = response.stopReason;
      call.usage = response.usage;
      call.costUsd = estimateCostUsd(response.usage);
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
      const billed = error.usage ? { usage: error.usage, costUsd: estimateCostUsd(error.usage) } : {};
      return {
        ...call,
        code: error.kind,
        ...(error.providerCode === undefined ? {} : { providerCode: error.providerCode }),
        ...(error.stopReason === undefined ? {} : { stopReason: error.stopReason }),
        ...(error.status === undefined ? {} : { status: error.status }),
        ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
        ...billed,
      };
    }
  }
}

/** `runs` runs over the texts, one after the other; a run never stops on a failure, only on the daily limit. */
export async function runTrial(texts: TrialText[], runs: number, deps: TrialDeps): Promise<TrialCall[]> {
  const calls: TrialCall[] = [];
  const schemas = new Set<string>();
  for (let run = 1; run <= runs; run++) {
    for (const entry of texts) {
      const call = await callOnce(entry, run, deps, calls.length === 0, schemas);
      calls.push(call);
      deps.onCall?.(call);
    }
  }
  return calls;
}

type Levels = Record<CriterionId, number>;
const levelsText = (levels?: Levels) => (levels ? criterionIds.map((id) => levels[id]).join(" ") : "–");
const said = (value: string | null | undefined) => value ?? "(not said)";
const usd = (cost: number | null | undefined) => (cost === null || cost === undefined ? "–" : `$${cost.toFixed(6)}`);
const isRefusal = (c: TrialCall) => c.outcome === "error" && c.code === "refused";
/** A refusal's category, as the provider said it: "null" when it gave none. */
export const refusalCategory = (c: TrialCall) => c.providerCode?.replace(/^refusal\//, "") ?? "null";

function tokens(usage: Usage | null | undefined) {
  const d = usage?.detail;
  return {
    input: d ? d.inputTokens : (usage?.promptTokens ?? null),
    output: d ? d.outputTokens : (usage?.completionTokens ?? null),
    cacheRead: d?.cacheReadTokens ?? null,
    cacheWrite: d?.cacheCreationTokens ?? null,
    geo: d?.inferenceGeo ?? null,
  };
}
const n = (value: number | null) => (value === null ? "?" : String(value));

/** One line per call, as the command prints it while the trial runs. */
export function formatCallLine(c: TrialCall): string {
  const failure = [
    c.status === undefined ? "" : ` [status ${c.status}]`,
    c.requestId ? ` [request-id ${c.requestId}]` : "",
    c.providerCode ? ` [${c.providerCode}]` : "",
  ].join("");
  const result = c.outcome === "proposed" ? `proposed ${levelsText(c.levels)}` : `${c.outcome}: ${c.code}${failure}`;
  if (c.outcome === "not_sent") return `run ${c.run} ${c.id}: ${result}`;
  const t = tokens(c.usage);
  const usage = c.usage ? `${n(t.input)} in / ${n(t.output)} out, cache ${n(t.cacheRead)} read / ${n(t.cacheWrite)} written, geo ${said(t.geo)}` : "usage (not said)";
  const parts = [
    `run ${c.run} ${c.id}: ${result}`,
    `model ${said(c.modelAnswered)}`,
    `stop_reason ${said(c.stopReason)}`,
    usage,
    `cost ${usd(c.costUsd)}`,
    `${c.durationMs ?? "?"} ms`,
  ];
  if (c.firstUseOfSchema) parts.push("first use of the schema (grammar compiled?)");
  return parts.join(" · ");
}

const tally = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => `${value} × ${count}`).join(", ") || "none";
};

function durations(values: number[]): string {
  if (values.length === 0) return "–";
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return `min ${sorted[0]} ms, median ${median} ms, max ${sorted[sorted.length - 1]} ms (${values.length} calls)`;
}

/** The report, in Markdown: counts, usage and cost, refusals, each call, dispersion over the runs, adversarial gaps. Numbers only. */
export function formatTrialReport(
  texts: TrialText[],
  calls: TrialCall[],
  meta: { date: string; model: string; provider: string; runs: number; maxGap?: number },
): string {
  const maxGap = meta.maxGap ?? ADVERSARIAL_MAX_LEVEL_GAP;
  const find = (run: number, id: string) => calls.find((c) => c.run === run && c.id === id);
  const count = (predicate: (c: TrialCall) => boolean) => calls.filter(predicate).length;
  const codes = (predicate: (c: TrialCall) => boolean) => tally(calls.filter((c) => predicate(c) && c.code).map((c) => c.code!));
  const sent = calls.filter((c) => c.outcome !== "not_sent");
  const answered = [...new Set(sent.filter((c) => c.modelAnswered !== undefined).map((c) => said(c.modelAnswered)))];
  const geos = [...new Set(sent.filter((c) => c.usage).map((c) => said(tokens(c.usage).geo)))];
  const rubrics = [...new Set(calls.map((c) => c.rubricVersion))];
  const runsHeader = Array.from({ length: meta.runs }, (_, i) => `Run ${i + 1}`).join(" | ");

  const lines = [
    `Date: ${meta.date}. Provider: ${meta.provider}. Model requested: ${meta.model}. Prompt: ${PROMPT_VERSION}. Rubric: ${rubrics.join(", ") || "–"}. Runs: ${meta.runs}.`,
    `Generation: effort ${AI_EFFORT}, thinking ${AI_THINKING}, max_tokens ${AI_MAX_OUTPUT_TOKENS}; inference_geo requested: ${AI_INFERENCE_GEO}.`,
    `Model that answered: ${answered.join("; ") || "–"}. inference_geo that answered: ${geos.join("; ") || "–"}.`,
    "",
    "| Count | Value |",
    "|---|---|",
    `| Texts × runs | ${calls.length} |`,
    `| Requests sent (429 included) | ${calls.reduce((sum, c) => sum + c.requests, 0)} |`,
    `| Rate-limited answers (429), retried | ${calls.reduce((sum, c) => sum + c.rateLimited, 0)} |`,
    `| Conform proposals | ${count((c) => c.outcome === "proposed")} |`,
    `| Answers rejected by the validator | ${count((c) => c.outcome === "rejected")} (${codes((c) => c.outcome === "rejected")}) |`,
    `| Refusals of the model (stop_reason refusal) | ${count(isRefusal)} |`,
    `| Failed calls | ${count((c) => c.outcome === "error" && !isRefusal(c))} (${codes((c) => c.outcome === "error" && !isRefusal(c))}) |`,
    `| Not sent (daily limit) | ${count((c) => c.outcome === "not_sent")} |`,
    "",
    `Stop reasons: ${tally(sent.map((c) => said(c.stopReason)))}.`,
  ];

  const refusals = calls.filter(isRefusal);
  if (refusals.length === 0) lines.push("", "Refusals by category: none.");
  else {
    const categories = [...new Set(refusals.map(refusalCategory))];
    lines.push(
      "",
      "Refusals by category (null: the provider gave none):",
      "",
      "| Category | Count | Texts | Tokens in / out | Estimated cost |",
      "|---|---|---|---|---|",
      ...categories.map((category) => {
        const these = refusals.filter((c) => refusalCategory(c) === category);
        const sum = (key: "input" | "output") => these.reduce((total, c) => total + (tokens(c.usage)[key] ?? 0), 0);
        const cost = these.some((c) => typeof c.costUsd === "number") ? these.reduce((total, c) => total + (c.costUsd ?? 0), 0) : null;
        return `| ${category} | ${these.length} | ${[...new Set(these.map((c) => c.id))].join(", ")} | ${sum("input")} / ${sum("output")} | ${usd(cost)} |`;
      }),
    );
  }

  const counted = sent.filter((c) => c.usage);
  const total = (key: "input" | "output" | "cacheRead" | "cacheWrite") => counted.reduce((sum, c) => sum + (tokens(c.usage)[key] ?? 0), 0);
  const priced = sent.filter((c) => typeof c.costUsd === "number");
  lines.push(
    "",
    `Usage (${counted.length} of ${sent.length} calls counted): ${total("input")} input, ${total("output")} output (thinking included), cache ${total("cacheRead")} read / ${total("cacheWrite")} written.`,
    `Estimated cost (${priced.length} calls priced): ${usd(priced.length ? priced.reduce((sum, c) => sum + c.costUsd!, 0) : null)}, at the published prices of ${PRICES.model} read on ${PRICES.readOn} (${PRICES.sources.join(", ")}).`,
    `Durations, first use of the schema apart: ${durations(sent.filter((c) => !c.firstUseOfSchema && c.durationMs !== undefined).map((c) => c.durationMs!))}; first use: ${sent.filter((c) => c.firstUseOfSchema).map((c) => `${c.id} ${c.durationMs ?? "?"} ms`).join(", ") || "–"}.`,
    "",
    `Levels in the order ${criterionIds.join(", ")}.`,
    "",
    `| Text | ${runsHeader} | Alerts (run 1) |`,
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
    "",
    "Each call:",
    "",
    "| Run | Text | Outcome | Model answered | stop_reason | Tokens in / out | Cache read / written | inference_geo | Estimated cost | Duration | Note |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...calls.map((c) => {
      const t = tokens(c.usage);
      const outcome = c.outcome === "proposed" ? "proposed" : `${c.outcome}: ${c.code}${c.providerCode ? ` (${c.providerCode})` : ""}`;
      const note = c.firstUseOfSchema ? "first use of the schema" : "";
      if (c.outcome === "not_sent") return `| ${c.run} | ${c.id} | ${outcome} | – | – | – | – | – | – | – | |`;
      return `| ${c.run} | ${c.id} | ${outcome} | ${said(c.modelAnswered)} | ${said(c.stopReason)} | ${c.usage ? `${n(t.input)} / ${n(t.output)}` : "–"} | ${c.usage ? `${n(t.cacheRead)} / ${n(t.cacheWrite)}` : "–"} | ${c.usage ? said(t.geo) : "–"} | ${usd(c.costUsd)} | ${c.durationMs ?? "?"} ms | ${note} |`;
    }),
  );

  if (meta.runs >= 2) {
    const complete = texts.flatMap((t) => {
      const levels = Array.from({ length: meta.runs }, (_, i) => find(i + 1, t.id)?.levels);
      return levels.every(Boolean) ? [{ id: t.id, levels: levels as Levels[] }] : [];
    });
    const spread = (levels: Levels[], id: CriterionId) => Math.max(...levels.map((l) => l[id])) - Math.min(...levels.map((l) => l[id]));
    lines.push(
      "",
      `Dispersion over the ${meta.runs} runs, per criterion: largest level minus smallest, for each text with a proposal in every run (${complete.length} of ${texts.length}).`,
      "",
      "| Criterion | Same level in every run | Spread 1 | Spread 2 or more | Largest spread |",
      "|---|---|---|---|---|",
      ...criterionIds.map((id) => {
        const spreads = complete.map((t) => spread(t.levels, id));
        return `| ${id} | ${spreads.filter((s) => s === 0).length} | ${spreads.filter((s) => s === 1).length} | ${spreads.filter((s) => s >= 2).length} | ${spreads.length ? Math.max(...spreads) : "–"} |`;
      }),
      "",
      `Texts with a different level on at least one criterion: ${complete.filter((t) => criterionIds.some((id) => spread(t.levels, id) > 0)).map((t) => t.id).join(", ") || "none"}.`,
    );
  }

  const adversarial = texts.filter((t) => t.baseId);
  if (adversarial.length > 0) {
    lines.push(
      "",
      `Adversarial set (EVL-03 CA3): largest gap on any criterion with the base text, in the same run; allowed: ${maxGap} (provisional).`,
      "",
      `| Text | Base | ${runsHeader} | Flag addressed_to_marker |`,
      `|---|---|${"---|".repeat(meta.runs)}---|`,
      ...adversarial.map((t) => {
        const cells = Array.from({ length: meta.runs }, (_, i) => {
          const [a, b] = [find(i + 1, t.id), find(i + 1, t.baseId!)];
          if (!a?.levels || !b?.levels) return "not comparable";
          const gap = Math.max(...criterionIds.map((id) => Math.abs(a.levels![id] - b.levels![id])));
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
