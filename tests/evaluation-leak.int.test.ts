import { randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishedRubric } from "@/lib/rubric";
import { STUDENT_NOTICE } from "@/lib/texts";
import type { Actor } from "@/server/access/actor";
import { createMistralEvaluator } from "@/server/ai/mistral";
import { buildEvaluationRequest, OUTPUT_SCHEMA } from "@/server/ai/request";
import { EvaluatorError } from "@/server/ai/types";
import { createAssignment } from "@/server/data/assignments/assignments";
import { createClass } from "@/server/data/classes/classes";
import { readEvaluationInput } from "@/server/data/evaluation/system";
import { acknowledgeNotice } from "@/server/data/notices/notices";
import { db } from "@/server/db/client";
import {
  assignments,
  classMemberships,
  securityEvents,
  submissions,
  submissionVersions,
  users,
} from "@/server/db/schema";
import { replaceStudentText, submitStudentText } from "@/server/submissions/submissions";

// EVL-02 CA1 and CA2, SUB-04 CA3: what leaves for the AI, read from the
// database by the real path (submission → whitelist → builder → the real
// Mistral adapter), captured at the HTTP layer (the final Request the SDK
// would send), with the real security log. Runs at each npm test (NFR-EXP-04).

const KEY = `test-key-${randomBytes(6).toString("hex")}`;
const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";
/** The first text, replaced (SUB-05) before the evaluation: never sent. */
const FIRST_TEXT = "My first draft about my town, replaced before marking.";

/** Identifiers and dates in any usual form: the fixed content sent contains none. */
const ANY_ID_OR_DATE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|\b20\d\d-\d\d-\d\d|\b\d{1,2}\/\d{1,2}\/20\d\d|\b1[6-9]\d{11}\b|\b1[6-9]\d{8}\b/i;
const SUBJECT = "Describe your town.";
const INSTRUCTIONS = "Use the present simple.";
const DEADLINE = new Date("2030-06-14T18:00:00Z");

type Captured = { method: string; url: string; headers: [string, string][]; body: string };

/** Lowercase markers, unique to this run: anything identifying that must never leave. */
type Marked = Record<string, string>;

let tag: string;
let captured: Captured[];
let printed: string[];

beforeEach(() => {
  tag = randomBytes(5).toString("hex");
  captured = [];
  printed = [];
  const keep = (...args: unknown[]) => {
    printed.push(args.map((a) => (typeof a === "string" ? a : inspect(a, { depth: 6 }))).join(" "));
    return true;
  };
  for (const method of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, method).mockImplementation(keep);
  vi.spyOn(process.stdout, "write").mockImplementation(keep);
  vi.spyOn(process.stderr, "write").mockImplementation(keep);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const completion = () =>
  new Response(
    JSON.stringify({
      id: "cmpl-1",
      object: "chat.completion",
      model: "mistral-medium-3-5",
      created: 1_760_000_000,
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [{ index: 0, message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

/** The real adapter, its HTTP requests captured and answered by `answer`, with the real security log. */
const adapter = (answer: () => Response | Promise<Response> = completion) =>
  createMistralEvaluator({
    apiKey: KEY,
    env: {},
    fetcher: async (input) => {
      const req = input as Request;
      captured.push({ method: req.method, url: req.url, headers: [...req.headers.entries()], body: await req.clone().text() });
      return answer();
    },
  });

/** What one captured request shows, decoded: URL, every header, the body. Lowercase. */
const seen = (request: Captured) =>
  [decodeURIComponent(request.url), ...request.headers.map(([k, v]) => `${k}: ${v}`), request.body].join("\n").toLowerCase();

/** The names of the markers found in the captured requests. */
const leaks = (requests: Captured[], markers: Marked) =>
  Object.entries(markers)
    .filter(([, value]) => requests.some((r) => seen(r).includes(value.toLowerCase())))
    .map(([name]) => name);

async function person(role: "student" | "teacher", label: string, markers: Marked) {
  const first = `${label}first${tag}`;
  const last = `${label}last${tag}`;
  const local = `${label}-${tag}`;
  const domain = `${label}${tag}.example.test`;
  const [row] = await db
    .insert(users)
    .values({ email: `${local}@${domain}`, emailVerified: true, name: `${first} ${last}`, firstName: first, lastName: last, role })
    .returning({ id: users.id });
  Object.assign(markers, {
    [`${label} first name`]: first,
    [`${label} last name`]: last,
    [`${label} email`]: `${local}@${domain}`,
    [`${label} email local part`]: local,
    [`${label} email domain`]: domain,
    [`${label} id`]: row.id,
  });
  return { kind: "user", userId: row.id, role } as Actor & { kind: "user" };
}

/** A teacher, a class with two students who read the notice, everything marked. */
async function world() {
  const markers: Marked = {};
  const teacher = await person("teacher", "teach", markers);
  const students = [await person("student", "stuone", markers), await person("student", "stutwo", markers)];
  const className = `Class ${tag}`;
  const made = await createClass(teacher, { name: className });
  if (!made.ok) throw new Error("Class not created");
  markers["class name"] = className;
  markers["class id"] = made.classId;
  for (const student of students) {
    await db.insert(classMemberships).values({ classId: made.classId, studentId: student.userId });
    await acknowledgeNotice(student, STUDENT_NOTICE.version);
  }
  return { markers, teacher, students, classId: made.classId };
}

async function assignment(
  teacher: Actor,
  classId: string,
  markers: Marked,
  level: "A1" | "C1",
  label: string,
): Promise<string> {
  const title = `Title ${label} ${tag}`;
  const created = await createAssignment(teacher, {
    title, subject: SUBJECT, instructions: INSTRUCTIONS, level, language: "en", deadline: DEADLINE, classIds: [classId],
  });
  if (!created.ok) throw new Error("Assignment not created");
  markers[`${label} title`] = title;
  markers[`${label} assignment id`] = created.assignmentId;
  return created.assignmentId;
}

/** Submits `text`, then each of `replacements` in turn (SUB-05); every version id becomes a marker. */
async function submit(
  student: Actor,
  assignmentId: string,
  markers: Marked,
  label: string,
  text = TEXT,
  replacements: string[] = [],
): Promise<string> {
  const state = await submitStudentText(student, { assignmentId, contentVersion: "1", requestId: randomUUID(), text });
  if (state.status !== "done") throw new Error(`Not submitted: ${state.status}`);
  for (const replacement of replacements) {
    const replaced = await replaceStudentText(student, { assignmentId, requestId: randomUUID(), text: replacement });
    if (replaced.status !== "done") throw new Error(`Not replaced: ${replaced.status}`);
  }
  const rows = await db
    .select({ id: submissions.id, versionId: submissionVersions.id, number: submissionVersions.number, submittedAt: submissions.submittedAt })
    .from(submissions)
    .innerJoin(submissionVersions, eq(submissionVersions.submissionId, submissions.id))
    .where(eq(submissions.assignmentId, assignmentId));
  for (const row of rows) markers[`${label} version ${row.number} id`] = row.versionId;
  markers[`${label} submission id`] = rows[0].id;
  markers[`${label} submission date`] = rows[0].submittedAt.toISOString().slice(0, 19);
  return rows[0].id;
}

/** The real path: the whitelist read from the database, the builder, the adapter. */
async function evaluate(submissionId: string, evaluator = adapter(), signal = new AbortController().signal) {
  const read = await readEvaluationInput(db, submissionId);
  if (!read) throw new Error("No input");
  const request = buildEvaluationRequest(read.input, publishedRubric(read.input.language)!);
  return { read, request, result: evaluator.evaluate(request, { signal, subjectId: submissionId }) };
}

const logLines = () =>
  db.select().from(securityEvents).where(eq(securityEvents.type, "ai_request_sent"));

describe("EVL-02 CA1: nothing identifying leaves, only the whitelist", () => {
  it("sends no account, class, teacher, title, identifier or date; only the text, subject, instructions and language", async () => {
    const { markers, teacher, students, classId } = await world();
    const assignmentId = await assignment(teacher, classId, markers, "C1", "one");
    // A first text, replaced once: only the active version may leave.
    const submissionId = await submit(students[0], assignmentId, markers, "one", FIRST_TEXT, [TEXT]);
    markers["deadline"] = DEADLINE.toISOString().slice(0, 16);
    markers["deadline date"] = "2030-06-14";
    markers["api key"] = KEY.slice("test-key-".length);

    const { read, request, result } = await evaluate(submissionId);
    expect(read.versionNumber).toBe(2);
    // Nothing identifying is in what is built, before anything leaves.
    expect(leaks([{ method: "", url: "", headers: [], body: JSON.stringify(request) }], markers)).toEqual([]);
    await result;

    expect(captured).toHaveLength(1);
    // Only the authorization header carries the key; nothing else does.
    const [sent] = captured;
    const withoutKey = Object.fromEntries(Object.entries(markers).filter(([name]) => name !== "api key"));
    expect(leaks(captured, withoutKey)).toEqual([]);
    expect(sent.headers.filter(([, v]) => v.includes(KEY)).map(([k]) => k)).toEqual(["authorization"]);
    expect(leaks([{ ...sent, headers: sent.headers.filter(([k]) => k !== "authorization") }], markers)).toEqual([]);

    // Exactly the expected fields, at both levels.
    const body = JSON.parse(sent.body);
    expect(Object.keys(body).sort()).toEqual(
      ["max_tokens", "messages", "model", "reasoning_effort", "response_format", "stream", "temperature"].sort(),
    );
    // The messages and the schema are the builder's, untouched: nothing added on the way.
    expect(body.messages).toEqual([
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ]);
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "evaluation", schema: OUTPUT_SCHEMA, strict: true } });
    // No identifier or date in any form, wherever it would hide; never the replaced text.
    const withoutAuthorization = { ...sent, headers: sent.headers.filter(([k]) => k !== "authorization") };
    expect(seen(withoutAuthorization)).not.toMatch(ANY_ID_OR_DATE);
    expect(seen(sent)).not.toContain(FIRST_TEXT.toLowerCase());
    const user = JSON.parse(body.messages[1].content);
    expect(user).toEqual({ task: { subject: SUBJECT, instructions: INSTRUCTIONS }, language: "en", student_text: TEXT });
    // Positive control: the whitelist did leave.
    expect(sent.body).toContain(JSON.stringify(TEXT).slice(1, -1));
    expect(sent.body).toContain(SUBJECT);
    expect(sent.body).toContain(INSTRUCTIONS);

    // The security log: one line for the one request, with the submission and nothing else.
    const lines = await logLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ actorUserId: null, subjectId: submissionId });
    const rest = { ...lines[0], subjectId: null };
    expect(leaks([{ method: "", url: "", headers: [], body: JSON.stringify(rest) }], markers)).toEqual([]);

    // Nothing printed anywhere.
    expect(printed.filter((line) => [TEXT, KEY, ...Object.values(markers)].some((m) => line.includes(m)))).toEqual([]);
  });

  it("would see a leak: the detector finds an identifier in a header, an encoded URL and a body field", async () => {
    const { markers, teacher, students, classId } = await world();
    const assignmentId = await assignment(teacher, classId, markers, "C1", "one");
    await submit(students[0], assignmentId, markers, "one");
    const sent = { method: "POST", url: "https://api.mistral.ai/v1/chat/completions", headers: [] as [string, string][], body: "{}" };
    expect(leaks([{ ...sent, headers: [["x-trace", markers["one submission id"]]] }], markers)).toEqual(["one submission id"]);
    expect(leaks([{ ...sent, url: `${sent.url}?who=${encodeURIComponent(markers["stuone email"])}` }], markers)).toEqual(
      expect.arrayContaining(["stuone email", "stuone email local part", "stuone email domain"]),
    );
    expect(leaks([{ ...sent, body: JSON.stringify({ metadata: { student: markers["stuone id"] } }) }], markers)).toEqual(["stuone id"]);
    expect(leaks([{ ...sent, body: `{"title":"${markers["one title"].toUpperCase()}"}` }], markers)).toEqual(["one title"]);
    // And the shape check sees an identifier or a date the markers did not name.
    for (const hidden of [randomUUID(), "2030-06-14", "14/06/2030", String(Date.now()), String(Math.floor(Date.now() / 1000))]) {
      expect(seen({ ...sent, body: JSON.stringify({ x: hidden }) }), hidden).toMatch(ANY_ID_OR_DATE);
    }
  });

  it("leaks nothing either when the call fails, whatever Mistral answers", async () => {
    const { markers, teacher, students, classId } = await world();
    const assignmentId = await assignment(teacher, classId, markers, "C1", "one");
    const submissionId = await submit(students[0], assignmentId, markers, "one");
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    const answers: [string, () => Response | Promise<Response>][] = [
      ["500", () => json(500, { message: TEXT })],
      ["429", () => json(429, { message: TEXT }, { "retry-after": "3" })],
      ["422 echoing the input", () => json(422, { detail: [{ loc: ["body"], msg: TEXT, type: "value_error", input: TEXT }] })],
      ["not JSON", () => new Response(TEXT, { status: 200, headers: { "content-type": "text/plain" } })],
      ["network down", () => Promise.reject(new TypeError(`fetch failed ${TEXT}`))],
    ];
    for (const [label, answer] of answers) {
      const { result } = await evaluate(submissionId, adapter(answer));
      const error = await result.catch((e: unknown) => e);
      expect(error, label).toBeInstanceOf(EvaluatorError);
      const shown = [String(error), inspect(error, { depth: 10, showHidden: true }), JSON.stringify(error)].join("\n");
      for (const secret of [TEXT, KEY, ...Object.values(markers)]) expect(shown, label).not.toContain(secret);
    }
    // Aborted by the caller while waiting for the answer (once the request has left).
    const controller = new AbortController();
    const before = captured.length;
    const { result } = await evaluate(submissionId, adapter(() => new Promise<Response>(() => {})), controller.signal);
    await vi.waitFor(() => expect(captured).toHaveLength(before + 1), { timeout: 10_000 });
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: "timeout" });

    // Each request that left has its line; nothing was printed.
    expect(await logLines()).toHaveLength(captured.length);
    expect(captured).toHaveLength(answers.length + 1);
    expect(printed.filter((line) => [TEXT, KEY, ...Object.values(markers)].some((m) => line.includes(m)))).toEqual([]);
  });
});

describe("EVL-02 CA2, SUB-04 CA3: the level, the deadline and lateness change nothing", () => {
  it("sends the same request for the same text in an A1 assignment on time and a C1 assignment submitted late", async () => {
    const { markers, teacher, students, classId } = await world();
    const a1 = await assignment(teacher, classId, markers, "A1", "a1");
    const c1 = await assignment(teacher, classId, markers, "C1", "c1");
    // The C1 deadline has passed (created in the future, as the form requires, then aged).
    await db.update(assignments).set({ deadline: new Date(Date.now() - 24 * 3600 * 1000) }).where(eq(assignments.id, c1));
    const onTime = await submit(students[0], a1, markers, "a1");
    const late = await submit(students[1], c1, markers, "c1");
    const lateness = await db
      .select({ id: submissions.id, late: submissions.late })
      .from(submissions)
      .where(and(eq(submissions.teacherId, teacher.userId)));
    expect(Object.fromEntries(lateness.map((r) => [r.id, r.late]))).toEqual({ [onTime]: false, [late]: true });

    for (const id of [onTime, late]) await (await evaluate(id)).result;
    expect(captured).toHaveLength(2);
    const [first, second] = captured;
    expect(second.method).toBe(first.method);
    expect(second.url).toBe(first.url);
    expect(second.headers).toEqual(first.headers);
    expect(second.body).toBe(first.body);
    // And neither carries the level.
    for (const r of captured) expect(JSON.parse(r.body).messages[1].content).not.toMatch(/\b[ABC][12]\b/);
  });
});
