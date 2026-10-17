// E5.8, OUT OF THE PRODUCT: an exploratory trial of handwriting reading by
// free vision models of OpenRouter. Nothing here is imported by the
// application, nothing is stored in a database, and no security log line is
// written: the product's reading of images is E9. Fictitious texts handwritten
// by adult volunteers, without names (DON-02); never a student's copy.
//
// Input, in explorations/handwriting/photos/ (not committed):
//   <name>.jpg|.jpeg|.png  the photo;
//   <name>.txt             what was really written, faults included, each
//                          deliberately unreadable spot written [illegible];
//   <name>.json            optional: { "faults": [{ "written": "beatifull", "correct": "beautiful" }] }.
// Run inside the container, after the day's other requests (the 50 free
// requests a day are per account, and these are not in the security log):
//   docker compose exec web npx tsx explorations/handwriting/read-photos.ts --dry-run
//   docker compose exec web npx tsx explorations/handwriting/read-photos.ts --send [--max-requests 10]
// Writes explorations/handwriting/results/read-<time>.{md,json}.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

/** Two free models that accept images (OpenRouter /models, read 2026-10-17), from two families. */
export const MODELS = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-super-vl:free"] as const;

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const CALL_TIMEOUT_MS = 120_000;
const PAUSE_MS = 4_000;
export const ILLEGIBLE = "[illegible]";

const INSTRUCTIONS = [
  "You transcribe a photo of a handwritten text, exactly as it is written.",
  "- Copy every word as written, spelling, grammar and punctuation mistakes included. Never correct anything.",
  "- Keep the order of the text and its line breaks.",
  `- Write ${ILLEGIBLE} for each word you cannot read. Never guess a word you cannot read.`,
  "- Answer with the transcription only, without any comment.",
].join("\n");

const DIR = path.join(process.cwd(), "explorations/handwriting");

type Photo = { name: string; file: string; reference: string; faults: { written: string; correct: string }[] };

function loadPhotos(): Photo[] {
  const dir = path.join(DIR, "photos");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()
    .map((file) => {
      const name = file.replace(/\.[^.]+$/, "");
      const base = path.join(dir, name);
      if (!existsSync(`${base}.txt`)) throw new Error(`${file}: ${name}.txt, the text really written, is missing`);
      const meta = existsSync(`${base}.json`) ? JSON.parse(readFileSync(`${base}.json`, "utf8")) : {};
      return { name, file: path.join(dir, file), reference: readFileSync(`${base}.txt`, "utf8"), faults: meta.faults ?? [] };
    });
}

// ---------------------------------------------------------------------------
// Comparison: words as written (case and punctuation kept), lines for the order.

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

/** Reference lines found out of order in the output: n minus the longest increasing run of their positions. */
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
    const k = lis.findIndex((x) => x >= p);
    if (k === -1) lis.push(p);
    else lis[k] = p;
  }
  return { lines: refLines.length, matched: positions.length, outOfOrder: positions.length - lis.length };
}

export function compare(photo: Pick<Photo, "reference" | "faults">, output: string) {
  const edits = alignWords(tokens(photo.reference), tokens(output));
  const outWords = new Set(tokens(output).map(bare));
  const faults = photo.faults.map((f) => ({
    ...f,
    result: outWords.has(bare(f.written)) ? "kept" : outWords.has(bare(f.correct)) ? "corrected" : "other",
  }));
  const atIllegible = edits.filter((e) => e.ref !== undefined && bare(e.ref) === ILLEGIBLE);
  return {
    words: tokens(photo.reference).length,
    same: edits.filter((e) => e.kind === "same").length,
    substituted: edits.filter((e) => e.kind === "sub").length,
    missing: edits.filter((e) => e.kind === "del").length,
    added: edits.filter((e) => e.kind === "ins").length,
    faults,
    illegible: {
      inReference: atIllegible.length,
      marked: atIllegible.filter((e) => e.kind === "same").length,
      guessed: atIllegible.filter((e) => e.kind === "sub").map((e) => e.out!),
      markersInOutput: tokens(output).filter((w) => bare(w) === ILLEGIBLE).length,
    },
    order: linesOutOfOrder(photo.reference, output),
    differences: edits.filter((e) => e.kind !== "same").map((e) => `${e.ref ?? "∅"} → ${e.out ?? "∅"}`),
  };
}

// ---------------------------------------------------------------------------
// One request: two headers only, no attribution header, no user field.

type Call = { photo: string; model: string; ok: boolean; status?: number; code?: string; durationMs: number; modelAnswered?: string; providerAnswered?: string; content?: string };

async function read(photo: Photo, model: string, apiKey: string): Promise<Call> {
  const mime = photo.file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const image = `data:${mime};base64,${readFileSync(photo.file).toString("base64")}`;
  const started = performance.now();
  const done = (rest: Partial<Call>): Call => ({ photo: photo.name, model, ok: false, durationMs: Math.round(performance.now() - started), ...rest });
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: INSTRUCTIONS },
          { role: "user", content: [{ type: "text", text: "Transcribe this text." }, { type: "image_url", image_url: { url: image } }] },
        ],
        temperature: 0,
        max_tokens: 2_000,
        // Only endpoints that neither keep nor train on the data, as OpenRouter lists them.
        provider: { data_collection: "deny" },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: unknown };
      model?: string;
      provider?: string;
      choices?: { message?: { content?: string } }[];
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (!response.ok || body?.error || typeof content !== "string") {
      // The status and the code only: an error message may echo the request.
      return done({ status: response.status, code: String(body?.error?.code ?? "no_content").slice(0, 40) });
    }
    return done({ ok: true, status: response.status, modelAnswered: body?.model, providerAnswered: body?.provider, content });
  } catch (error) {
    return done({ code: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network" });
  }
}

function report(photos: Photo[], calls: Call[], date: string): string {
  const lines = [
    `Date: ${date}. Models requested: ${MODELS.join(", ")}. Temperature 0, data_collection "deny".`,
    `Answered by: ${[...new Set(calls.filter((c) => c.ok).map((c) => `${c.modelAnswered} / ${c.providerAnswered ?? "(not said)"}`))].join("; ") || "–"}.`,
    "",
    "| Photo | Model | Result | Words same / ref | Substituted | Missing | Added | Faults kept / corrected / other | Illegible marked / guessed | Lines out of order |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const c of calls) {
    const photo = photos.find((p) => p.name === c.photo)!;
    if (!c.ok) {
      lines.push(`| ${c.photo} | ${c.model} | error: ${c.code} (HTTP ${c.status ?? "–"}) | | | | | | | |`);
      continue;
    }
    const r = compare(photo, c.content!);
    const tally = (k: string) => r.faults.filter((f) => f.result === k).length;
    lines.push(
      `| ${c.photo} | ${c.model} | ${c.durationMs} ms | ${r.same} / ${r.words} | ${r.substituted} | ${r.missing} | ${r.added} | ${tally("kept")} / ${tally("corrected")} / ${tally("other")} | ${r.illegible.marked} / ${r.illegible.guessed.length} of ${r.illegible.inReference} | ${r.order.outOfOrder} of ${r.order.matched} matched (${r.order.lines} lines) |`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { send: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false }, "max-requests": { type: "string", default: "10" } },
  });
  const photos = loadPhotos();
  const planned = photos.length * MODELS.length;
  console.log(`${photos.length} photo(s) × ${MODELS.length} model(s) = ${planned} request(s).`);
  if (!values.send) {
    for (const p of photos) console.log(`- ${p.name}: ${tokens(p.reference).length} words, ${p.faults.length} listed fault(s)`);
    console.log("Nothing sent. Add --send to send.");
    return 0;
  }
  const max = Number(values["max-requests"]);
  if (planned > max) {
    console.error(`${planned} requests planned, over --max-requests ${max}: nothing sent.`);
    return 2;
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is missing.");
    return 2;
  }
  const calls: Call[] = [];
  for (const photo of photos) {
    for (const model of MODELS) {
      if (calls.length > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      const call = await read(photo, model, apiKey);
      console.log(`${photo.name} / ${model}: ${call.ok ? `${call.durationMs} ms` : `error ${call.code} (HTTP ${call.status ?? "–"})`}`);
      calls.push(call);
    }
  }
  const date = new Date().toISOString();
  const out = path.join(DIR, "results");
  mkdirSync(out, { recursive: true });
  const base = path.join(out, `read-${date.slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}`);
  const text = report(photos, calls, date);
  writeFileSync(`${base}.md`, `${text}\n`);
  writeFileSync(
    `${base}.json`,
    `${JSON.stringify({ date, models: MODELS, calls: calls.map((c) => ({ ...c, comparison: c.ok ? compare(photos.find((p) => p.name === c.photo)!, c.content!) : null })) }, null, 2)}\n`,
  );
  console.log(`\n${text}\n\nWritten: ${base}.md and ${base}.json`);
  return 0;
}

if (process.argv[1]?.endsWith("read-photos.ts")) {
  main().then((code) => process.exit(code), (error: unknown) => {
    console.error(`Failed: ${error instanceof Error ? error.name : "unknown"}`);
    process.exit(1);
  });
}
