import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_ONLINE_URL, testDatabaseUrl } from "./support/env";
import { seedTeacher } from "./support/review";

// E7.8 (NFR-TRT-03, plan of E7 §6): the review screens' response times on
// an assignment of COPIES fictitious copies, each To review with a proposal
// (four classes of 30, written straight to the test database). A
// measurement, not a check of behaviour: the threshold is "à définir", the
// figures are reported as they are. Measured RUNS times each, after one
// warm-up visit (next dev compiles a page on its first visit):
//   - the list: from the navigation to the table shown (first page, 50 rows);
//   - opening a copy: from the click on a name in the list to the form shown;
//   - saving a change: from the click on "Save changes" to "Saved".
// Each also gives the document's own time (Navigation Timing: request sent
// to response ended) where there is a document. Local: the E2E server
// (next dev, in Docker on this machine) and Neon in us-east-2. Opt-in, alone:
//   docker compose run --rm e2e sh -c "npm install --no-audit --no-fund && E2E_MEASURE=1 npx playwright test e2e/e7-review-measure.spec.ts"
// The figures go to the console and to test-results/e7-review-measure.json.

const COPIES = 120;
const CLASSES = ["A", "B", "C", "D"];
const RUNS = 5;

test.skip(process.env.E2E_MEASURE !== "1", "a measurement, run on demand (E2E_MEASURE=1)");
test.setTimeout(15 * 60_000);

const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park near the river. " +
  "On sunday we visit my grandparents, they live in a village with many trees and a old mosque.";

test("E7.8: list, copy and save on an assignment of 120 copies, measured", async ({ page }) => {
  const seeder = await seedTeacher(page, CLASSES);
  let assignmentId: string;
  try {
    assignmentId = await seeder.assignment(CLASSES);
  } finally {
    await seeder.close();
  }
  await seedCopies(assignmentId, seeder.teacherId, CLASSES.map((name) => seeder.classId(name)));
  const listUrl = `/teacher/assignments/${assignmentId}`;

  // Warm-up: each page compiled once, its first save included.
  await showList(page, listUrl);
  await openCopy(page, 0);
  await saveOneLevel(page);

  const list: Sample[] = [];
  for (let i = 0; i < RUNS; i++) list.push(await showList(page, listUrl));

  const copy: Sample[] = [];
  const save: Sample[] = [];
  for (let i = 1; i <= RUNS; i++) {
    await showList(page, listUrl);
    copy.push(await openCopy(page, i));
    save.push(await saveOneLevel(page));
  }
  const result = {
    measuredOn: new Date().toISOString(),
    where: E2E_ONLINE_URL
      ? `online: ${E2E_ONLINE_URL} (Vercel cle1, production build), Neon us-east-2, simulator; browser on this machine`
      : "local: E2E server (next dev, Docker) on this machine, Neon us-east-2, simulator",
    copies: COPIES,
    pageSize: 50,
    runs: RUNS,
    list: summary(list),
    openCopy: summary(copy),
    save: summary(save),
    samples: { list, openCopy: copy, save },
  };
  console.log(JSON.stringify(result, null, 2));
  // MEASURE_LABEL names a run, so that runs compared the same day do not overwrite each other (E8.6).
  const label = process.env.MEASURE_LABEL ? `-${process.env.MEASURE_LABEL}` : "";
  await writeFile(`test-results/e7-review-measure${E2E_ONLINE_URL ? "-online" : ""}${label}.json`, JSON.stringify(result, null, 2));
});

/** TEMPORARY (E8.6): the proxy's Server-Timing on the page's own GET, in ms; null when not sent. */
type ProxyTiming = Record<string, number> | null;
type Sample = { shownMs: number; documentMs: number | null; proxy: ProxyTiming };

/** TEMPORARY (E8.6): runs `act` and gives the Server-Timing of the first GET of `pathname` it caused. */
async function withProxyTiming<T>(page: Page, pathname: string, act: () => Promise<T>): Promise<[T, ProxyTiming]> {
  const timings: ProxyTiming[] = [];
  const listen = (response: import("@playwright/test").Response) => {
    if (response.request().method() !== "GET" || new URL(response.url()).pathname !== pathname) return;
    const header = response.headers()["server-timing"];
    timings.push(header ? Object.fromEntries(header.split(",").map((part) => {
      const [name, dur] = part.trim().split(";dur=");
      return [name, Number(dur)];
    })) : null);
  };
  page.on("response", listen);
  try {
    return [await act(), timings[0] ?? null];
  } finally {
    page.off("response", listen);
  }
}

/** From the navigation to the first page of the table, 50 rows. */
async function showList(page: Page, url: string): Promise<Sample> {
  const started = Date.now();
  const [, proxy] = await withProxyTiming(page, url, async () => {
    await page.goto(url);
    await expect(page.getByRole("table", { name: "Submissions" }).getByRole("row")).toHaveCount(51, { timeout: 60_000 });
  });
  const shownMs = Date.now() - started;
  return { shownMs, documentMs: await documentMs(page), proxy };
}

/** From the click on the n-th name of the list to the form. */
async function openCopy(page: Page, n: number): Promise<Sample> {
  const link = page.getByRole("table", { name: "Submissions" }).getByRole("link").nth(n);
  const copyPath = (await link.getAttribute("href"))!.split("?")[0];
  const started = Date.now();
  const [, proxy] = await withProxyTiming(page, copyPath, async () => {
    await link.click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible({ timeout: 60_000 });
  });
  // A client navigation: no new document.
  return { shownMs: Date.now() - started, documentMs: null, proxy };
}

/** The first criterion's level changed, then saved: from the click to "Saved". */
async function saveOneLevel(page: Page): Promise<Sample> {
  const task = page.getByRole("region", { name: /^1/ });
  const four = task.getByRole("radio", { name: /^4 –/ });
  await task.getByRole("radio", { name: (await four.isChecked()) ? /^3 –/ : /^4 –/ }).check({ force: true });
  const started = Date.now();
  // The refresh after the save fetches the copy again: that GET goes through the proxy.
  const [, proxy] = await withProxyTiming(page, new URL(page.url()).pathname, async () => {
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("form > div.sticky").getByRole("status")).toHaveText("Saved", { timeout: 60_000 });
  });
  return { shownMs: Date.now() - started, documentMs: null, proxy };
}

/** The document: request sent to response ended (server and network, streaming included). */
const documentMs = (page: Page) =>
  page.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return nav ? Math.round(nav.responseEnd - nav.requestStart) : null;
  });

function summary(samples: Sample[]) {
  const stat = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1)! };
  };
  const documents = samples.map((s) => s.documentMs).filter((v): v is number => v !== null);
  const timed = samples.map((s) => s.proxy).filter((v): v is Record<string, number> => v !== null);
  const proxy = timed.length
    ? Object.fromEntries(Object.keys(timed[0]).map((name) => [name, stat(timed.map((t) => t[name]))]))
    : null;
  return { shownMs: stat(samples.map((s) => s.shownMs)), documentMs: documents.length ? stat(documents) : null, proxy };
}

/**
 * COPIES students spread over the classes, each with a text submission To
 * review and a proposal in force (levels varying from copy to copy), in a few
 * set-based statements.
 */
async function seedCopies(assignmentId: string, teacherId: string, classIds: string[]) {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    const { rows: students } = await client.query<{ id: string; n: number }>(
      `INSERT INTO users (email, email_verified, name, first_name, last_name, role)
       SELECT 'measure-' || $1::text || '-' || n || '@example.test', true, 'Student ' || n, 'Student', 'Number ' || lpad(n::text, 3, '0'), 'student'
       FROM generate_series(1, $2::int) n
       RETURNING id, substr(last_name, 8)::int AS n`,
      [assignmentId.slice(0, 8), COPIES],
    );
    await client.query(
      `INSERT INTO class_memberships (class_id, student_id, status)
       SELECT ($1::uuid[])[1 + (s.n % cardinality($1::uuid[]))], s.id, 'active'
       FROM unnest($2::uuid[], $3::int[]) AS s(id, n)`,
      [classIds, students.map((s) => s.id), students.map((s) => s.n)],
    );
    await client.query(
      `INSERT INTO submissions (assignment_id, teacher_id, student_id, status, late, content_version)
       SELECT $1, $2, s.id, 'to_review', s.n % 9 = 0, 1 FROM unnest($3::uuid[], $4::int[]) AS s(id, n)`,
      [assignmentId, teacherId, students.map((s) => s.id), students.map((s) => s.n)],
    );
    await client.query(
      `INSERT INTO submission_versions (submission_id, number, mode, text, request_id)
       SELECT id, 1, 'text', $2 || ' (' || student_id || ')', gen_random_uuid() FROM submissions WHERE assignment_id = $1`,
      [assignmentId, TEXT],
    );
    await client.query(
      `INSERT INTO evaluation_runs (submission_id, version_number, outcome, provider, model_requested, model_answered, prompt_version, rubric_version, attempts, duration_ms)
       SELECT id, 1, 'proposed', 'simulator', 'simulator', 'simulator', 'evaluation-2', 'en-1', 1, 10 FROM submissions WHERE assignment_id = $1`,
      [assignmentId],
    );
    await client.query(
      `WITH levels AS (
         SELECT r.id AS run_id, r.submission_id, row_number() OVER (ORDER BY r.submission_id) AS k
         FROM evaluation_runs r JOIN submissions s ON s.id = r.submission_id WHERE s.assignment_id = $1
       ), l AS (
         SELECT run_id, submission_id, (k % 5)::int AS a, ((k / 5) % 5)::int AS b, 2 AS c, ((k + 1) % 5)::int AS d, ((k + 3) % 4)::int AS e FROM levels
       ), inserted AS (
         INSERT INTO ai_proposals (run_id, submission_id, version_number,
           level_task, level_organization, level_vocabulary, level_grammar, level_mechanics,
           justification_task, justification_organization, justification_vocabulary, justification_grammar, justification_mechanics,
           quotes_task, quotes_organization, quotes_vocabulary, quotes_grammar, quotes_mechanics,
           general_comment, next_steps, alerts, proposed_grade)
         SELECT run_id, submission_id, 1, a, b, c, d, e,
           'Answers the task.', 'Clear paragraphs.', 'Simple words.', 'Some errors.', 'A few spelling mistakes.',
           '{small}', '{small}', '{small}', '{small}', '{small}', 'A clear and simple text.', '{Check the spelling.}', '{}', a + b + c + d + e
         FROM l RETURNING id, submission_id
       )
       UPDATE submissions s SET current_proposal_id = inserted.id FROM inserted WHERE s.id = inserted.submission_id`,
      [assignmentId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
