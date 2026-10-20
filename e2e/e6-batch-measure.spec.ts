import { randomUUID } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_BASE_URL, E2E_CRON_SECRET, E2E_WORKFLOW_DIR } from "./support/env";
import { sql } from "./support/helpers";

// E6.4 (EXP-01, plan of E6 §8): a measured batch, not a check of behaviour.
// BATCH copies of fictitious texts are received at once, aged past
// TRIGGER_GRACE_MS, then started together by the sweep's own route (the cron
// of production), as many runs as copies, in Workflows' Local World and on
// the simulator. Measured: Workflows events and bytes written per copy (one
// JSON file per event, under the Local World's directory), the delay of the
// batch and of each copy. The simulator answers at once: the AI's own latency
// (E5.16: median 7.4 s) is not in these figures. Opt-in, alone:
//   docker compose run --rm e2e sh -c "npm install --no-audit --no-fund && E2E_MEASURE=1 npx playwright test e2e/e6-batch-measure.spec.ts"
// The figures go to the console and to test-results/e6-batch-measure.json.

const BATCH = 20; // SWEEP_RESTART_LIMIT: one sweep starts them all.

test.skip(process.env.E2E_MEASURE !== "1", "a measurement, run on demand (E2E_MEASURE=1)");
test.setTimeout(15 * 60_000);

const TEXT =
  "my town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park near the river.";

test("E6.4: a batch of copies started together, measured", async () => {
  const assignmentId = await receivedBatch(BATCH);

  const started = Date.now();
  const response = await fetch(`${E2E_BASE_URL}/api/cron/evaluation-sweep`, {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ released: 0, restarted: BATCH });

  await expect
    .poll(async () => (await states(assignmentId)).filter((s) => s !== "received" && s !== "evaluating").length, {
      timeout: 12 * 60_000,
      intervals: [2_000],
    })
    .toBe(BATCH);
  const batchMs = Date.now() - started;
  const final = await states(assignmentId);

  const delays = await sql<{ ms: number }>(
    `SELECT (extract(epoch from r.created_at) * 1000 - $2::double precision)::int AS ms
     FROM evaluation_runs r JOIN submissions s ON s.id = r.submission_id
     WHERE s.assignment_id = $1 AND r.outcome = 'proposed' ORDER BY ms`,
    [assignmentId, started],
  );
  const runs = await workflowRuns(started);
  const result = {
    measuredOn: new Date().toISOString(),
    batch: BATCH,
    world: "local",
    evaluator: "simulator",
    states: tally(final),
    batchMs,
    copyMs: spread(delays.map((d) => d.ms)),
    workflowRuns: runs.length,
    eventsPerRun: spread(runs.map((r) => r.events)),
    eventsTotal: runs.reduce((a, r) => a + r.events, 0),
    eventTypes: tally(runs.flatMap((r) => r.types)),
    bytesPerRun: spread(runs.map((r) => r.bytes)),
  };
  console.log(`[measure] ${JSON.stringify(result, null, 2)}`);
  await writeFile(path.join("test-results", "e6-batch-measure.json"), JSON.stringify(result, null, 2));
  expect(runs).toHaveLength(BATCH);
});

/** A teacher's assignment, a class, `size` students and their received text submissions, aged past the grace. */
async function receivedBatch(size: number): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const [teacher] = await sql<{ id: string }>(
    `INSERT INTO users (email, email_verified, name, first_name, last_name, role)
     VALUES ($1, true, 'Batch Teacher', 'Batch', 'Teacher', 'teacher') RETURNING id`,
    [`batch-teacher-${tag}@example.test`],
  );
  const [klass] = await sql<{ id: string }>(
    `INSERT INTO classes (teacher_id, name, invite_nonce, invite_link_digest, invite_code_digest)
     VALUES ($1, 'Batch class', $2, $3, $4) RETURNING id`,
    [teacher.id, `n-${tag}`, `l-${tag}`, `c-${tag}`],
  );
  const [assignment] = await sql<{ id: string }>(
    `INSERT INTO assignments (teacher_id, title, subject, level, language, deadline, locked_at)
     VALUES ($1, 'My town', 'Describe your town.', 'B1', 'en', now() + interval '7 days', now()) RETURNING id`,
    [teacher.id],
  );
  await sql(`INSERT INTO assignment_classes (assignment_id, class_id, teacher_id) VALUES ($1, $2, $3)`, [
    assignment.id, klass.id, teacher.id,
  ]);
  for (let i = 0; i < size; i++) {
    const [student] = await sql<{ id: string }>(
      `INSERT INTO users (email, email_verified, name, first_name, last_name, role)
       VALUES ($1, true, 'Batch Student', 'Batch', 'Student', 'student') RETURNING id`,
      [`batch-student-${i}-${tag}@example.test`],
    );
    await sql(`INSERT INTO class_memberships (class_id, student_id) VALUES ($1, $2)`, [klass.id, student.id]);
    const [submission] = await sql<{ id: string }>(
      `INSERT INTO submissions (assignment_id, teacher_id, student_id, status, late, content_version, updated_at)
       VALUES ($1, $2, $3, 'received', false, 1, now() - interval '11 minutes') RETURNING id`,
      [assignment.id, teacher.id, student.id],
    );
    await sql(
      `INSERT INTO submission_versions (submission_id, number, mode, text, request_id) VALUES ($1, 1, 'text', $2, $3)`,
      [submission.id, `MARK${i} ${TEXT}`, randomUUID()],
    );
  }
  return assignment.id;
}

const states = async (assignmentId: string) =>
  (await sql<{ status: string }>(`SELECT status FROM submissions WHERE assignment_id = $1`, [assignmentId])).map((r) => r.status);

/** The Local World's runs created since `since`: events (one file each) by type, and bytes written. */
async function workflowRuns(since: number) {
  const runsDir = path.join(E2E_WORKFLOW_DIR, "runs");
  const files = (await readdir(runsDir)).filter((f) => f.endsWith(".json"));
  const runs = [];
  for (const file of files) {
    const run = JSON.parse(await readFile(path.join(runsDir, file), "utf8")) as { runId?: string; createdAt?: string };
    const runId = run.runId ?? file.replace(/\.json$/, "");
    if (run.createdAt && new Date(run.createdAt).getTime() < since - 1_000) continue;
    const eventsDir = path.join(E2E_WORKFLOW_DIR, "events", runId);
    const eventFiles = (await readdir(eventsDir).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
    const types: string[] = [];
    let bytes = (await stat(path.join(runsDir, file))).size;
    for (const eventFile of eventFiles) {
      const full = path.join(eventsDir, eventFile);
      bytes += (await stat(full)).size;
      types.push((JSON.parse(await readFile(full, "utf8")) as { eventType?: string }).eventType ?? "unknown");
    }
    const stepsDir = path.join(E2E_WORKFLOW_DIR, "steps", runId);
    for (const stepFile of await readdir(stepsDir).catch(() => [] as string[])) bytes += (await stat(path.join(stepsDir, stepFile))).size;
    runs.push({ runId, events: eventFiles.length, types, bytes });
  }
  return runs;
}

function spread(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] };
}

const tally = (values: string[]) => values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
