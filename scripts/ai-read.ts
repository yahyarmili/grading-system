// The handwriting trial (E9.0, then the final fidelity trial of E9; spec
// 0011, AC-19): fictitious photos read through the product's Reader, prompt
// transcription-1, each compared with what was really written. Fictitious
// texts handwritten by adult volunteers, without names (DON-02); never a
// student's copy. Nothing is stored but the security log line of each real
// sending (DON-05). Run inside the container; the simulator by default,
// Anthropic only with --provider anthropic and GRADING_ANTHROPIC_API_KEY
// (AI_PROVIDER in the environment is ignored).
//
// Input, in explorations/handwriting/photos/ (or --photos; not committed):
//   <name>.jpg|.jpeg|.png|.webp|.heic  the photo, prepared as the product
//                          prepares a page (upright, shrunk, JPEG without metadata);
//   <name>.txt             what was really written, faults included, each
//                          deliberately unreadable spot written [illisible];
//   <name>.json            optional: { "faults": [{ "written": "beatifull", "correct": "beautiful" }] }.
//
//   docker compose exec -T web npm run ai:read
//   docker compose exec -T web npm run ai:read -- --provider anthropic [--runs 2] [--limit 3]
//   …and, to compare settings for the READER_* values: --effort low|medium|high --thinking adaptive|disabled --max-tokens <n>
//
// Prints each call as it ends, then writes the report (Markdown, no text read)
// and every call, raw answers included (JSON), to --out (trial-results/ by
// default, not committed). The report is copied as is into conception/ by
// hand. With Anthropic, it stops before going over the daily guard
// (AI_DAILY_REQUEST_LIMIT, counted on the security log).
// Runs with --conditions=react-server so "server-only" modules load outside Next.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { AI_DAILY_REQUEST_LIMIT, AI_TRIAL_PAUSE_MS, READ_REQUEST_MAX_MS } from "@/config/provisional";
import { AiConfigurationError, EvaluatorError, readerForCommand, type Generation, type Reader } from "@/server/ai";
import { buildReadingRequest, parseReading, PROMPT_VERSION } from "@/server/ai/reading";
import { countAiRequestsToday } from "@/server/data/auth/security-events";
import { closeDatabase } from "@/server/data/lifecycle";
import { estimateCostUsd, PRICES } from "@/server/evaluation/prices";
import { compare, formatReadingReport, type ReadingTrialCall, type TrialPhoto } from "@/server/evaluation/reading-trial";
import { requestsLeftToday } from "@/server/evaluation/trial";
import { PageImageError, preparePage, type PreparedPage } from "@/server/submissions/page-image";

const PHOTO = /\.(jpe?g|png|webp|heic|heif)$/i;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const THINKING = ["adaptive", "disabled"] as const;

type LoadedPhoto = TrialPhoto & { file: string };

function loadPhotos(dir: string): LoadedPhoto[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => PHOTO.test(f))
    .sort()
    .map((file) => {
      const name = file.replace(/\.[^.]+$/, "");
      const base = path.join(dir, name);
      if (!existsSync(`${base}.txt`)) throw new Error(`${file}: ${name}.txt, the text really written, is missing`);
      const meta = existsSync(`${base}.json`) ? JSON.parse(readFileSync(`${base}.json`, "utf8")) : {};
      return { name, file: path.join(dir, file), reference: readFileSync(`${base}.txt`, "utf8"), faults: meta.faults ?? [] };
    });
}

/** The generation of the prompt version, or the one the command line asks for, to compare settings. */
function generationOf(values: { effort?: string; thinking?: string; "max-tokens"?: string }, base: Generation): Generation | null {
  const effort = values.effort ?? base.effort;
  const thinking = values.thinking ?? base.thinking;
  const maxOutputTokens = values["max-tokens"] === undefined ? base.maxOutputTokens : Number(values["max-tokens"]);
  if (!(EFFORTS as readonly string[]).includes(effort) || !(THINKING as readonly string[]).includes(thinking)) return null;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) return null;
  return { effort: effort as Generation["effort"], thinking: thinking as Generation["thinking"], maxOutputTokens };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      provider: { type: "string" },
      photos: { type: "string", default: "explorations/handwriting/photos" },
      runs: { type: "string", default: "1" },
      limit: { type: "string" },
      effort: { type: "string" },
      thinking: { type: "string" },
      "max-tokens": { type: "string" },
      out: { type: "string", default: "trial-results" },
    },
  });
  const runs = Number(values.runs);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  const generation = generationOf(values, buildReadingRequest(new Uint8Array()).generation);
  if (!Number.isInteger(runs) || runs < 1 || (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) || generation === null) {
    console.error(
      "Usage: npm run ai:read -- [--provider simulator|anthropic] [--photos <dir>] [--runs <n>] [--limit <n>] [--effort low|medium|high|xhigh|max] [--thinking adaptive|disabled] [--max-tokens <n>] [--out <dir>]",
    );
    return 2;
  }
  const reader = readerForCommand(values.provider);
  console.log(`Provider: ${reader.provider}; model requested: ${reader.model}; prompt ${PROMPT_VERSION}`);
  console.log(`Generation: effort ${generation.effort}, thinking ${generation.thinking}, max_tokens ${generation.maxOutputTokens}`);

  const photos = loadPhotos(path.resolve(values.photos!)).slice(0, limit);
  if (photos.length === 0) {
    console.log(`No photo in ${values.photos}: add <name>.jpg and <name>.txt there (see the head of scripts/ai-read.ts).`);
    return 1;
  }
  // Each page prepared once, as the product prepares it, before anything is sent.
  const pages = new Map<string, PreparedPage>();
  for (const photo of photos) {
    try {
      pages.set(photo.name, await preparePage(readFileSync(photo.file), { formats: ["jpeg", "png", "webp", "heif"] }));
    } catch (error) {
      if (!(error instanceof PageImageError)) throw error;
      console.error(`${photo.name}: ${error.message} Nothing sent.`);
      return 2;
    }
  }

  const remaining = () => requestsLeftToday(reader.provider, countAiRequestsToday);
  const left = await remaining();
  console.log(`${photos.length} photo(s) × ${runs} run(s) = ${photos.length * runs} request(s); left today: ${left}.`);
  if (left < photos.length * runs) console.log("Not enough for all of them today: the trial stops at the limit.");

  const calls: ReadingTrialCall[] = [];
  outer: for (let run = 1; run <= runs; run++) {
    for (const photo of photos) {
      if ((await remaining()) <= 0) {
        console.log(`Stopped: the daily limit of ${AI_DAILY_REQUEST_LIMIT} requests is reached.`);
        break outer;
      }
      if (calls.length > 0 && reader.provider !== "simulator") await new Promise((resolve) => setTimeout(resolve, AI_TRIAL_PAUSE_MS));
      const call = await readOne(reader, photo, pages.get(photo.name)!, run, generation);
      console.log(formatLine(call));
      calls.push(call);
    }
  }

  const date = new Date().toISOString();
  const report = formatReadingReport(calls, {
    date,
    provider: reader.provider,
    model: reader.model,
    promptVersion: PROMPT_VERSION,
    generation,
    readMaxMs: READ_REQUEST_MAX_MS,
  });
  const stamp = date.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  mkdirSync(values.out!, { recursive: true });
  const base = path.join(values.out!, `read-${reader.provider}-${stamp}`);
  writeFileSync(`${base}.md`, `${report}\n`);
  writeFileSync(
    `${base}.json`,
    `${JSON.stringify({ date, provider: reader.provider, model: reader.model, promptVersion: PROMPT_VERSION, generation, runs, prices: PRICES, calls }, null, 2)}\n`,
  );
  console.log(`\n${report}`);
  console.log(`\nWritten: ${base}.md and ${base}.json`);
  return 0;
}

/** One call, never retried: the trial measures each call as it ends. */
async function readOne(reader: Reader, photo: LoadedPhoto, page: PreparedPage, run: number, generation: Generation): Promise<ReadingTrialCall> {
  const request = { ...buildReadingRequest(page.bytes), generation };
  const started = performance.now();
  const sent = { width: page.width, height: page.height, bytes: page.bytes.length };
  try {
    const response = await reader.read(request, { signal: new AbortController().signal, subjectId: null });
    const durationMs = Math.round(performance.now() - started);
    const reading = parseReading(response.content);
    return {
      photo: photo.name,
      run,
      page: sent,
      durationMs,
      modelAnswered: response.modelAnswered,
      stopReason: response.stopReason,
      usage: response.usage,
      failure: null,
      content: response.content,
      reading,
      comparison: reading ? compare(photo, reading.text) : null,
    };
  } catch (error) {
    if (error instanceof AiConfigurationError) throw error;
    return {
      photo: photo.name,
      run,
      page: sent,
      durationMs: Math.round(performance.now() - started),
      modelAnswered: null,
      stopReason: error instanceof EvaluatorError ? (error.stopReason ?? null) : null,
      usage: error instanceof EvaluatorError ? (error.usage ?? null) : null,
      failure: describeFailure(error),
      content: null,
      reading: null,
      comparison: null,
    };
  }
}

function formatLine(c: ReadingTrialCall): string {
  const head = `${c.photo} (run ${c.run}, ${c.page.width}×${c.page.height}): ${c.durationMs} ms`;
  if (c.failure) return `${head}, failed: ${c.failure}`;
  if (!c.reading) return `${head}, answer off the schema`;
  const cost = estimateCostUsd(c.usage);
  const r = c.comparison!;
  return `${head}, ${c.reading.hasWriting ? "read" : "no writing"}, ${r.same}/${r.words} words same, ${r.illegible.guessed.length} guessed${cost === null ? "" : `, $${cost.toFixed(5)}`}`;
}

/** What a failure says: its kind, HTTP status and request-id (and the provider code), or its class; never a message or a body. */
function describeFailure(error: unknown): string {
  if (error instanceof EvaluatorError) {
    const code = error.providerCode ? ` [code: ${error.providerCode}]` : "";
    const id = error.requestId ? ` [request-id: ${error.requestId}]` : "";
    const status = error.status === undefined ? "" : ` [status ${error.status}]`;
    return `${error.kind}${status}${id}${code}`;
  }
  if (error instanceof AiConfigurationError) return error.message;
  return error instanceof Error ? error.name : "unknown error";
}

main()
  .then(async (code) => {
    await closeDatabase();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(`Trial failed: ${describeFailure(error)}`);
    await closeDatabase();
    process.exit(1);
  });
