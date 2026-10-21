import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { createClass, phone } from "./support/classes";
import { createStudent, createTeacher, expectNotFound, signIn, sql } from "./support/helpers";
import { testDatabaseUrl } from "./support/env";

// REV-01 (E7.2), in a real browser: the list of an assignment's submissions, opened from the
// assignments list (ASG-02 CA2), sorted and filtered on the whole list, its
// state kept in the URL. The rules: src/lib/review-list.test.ts and
// tests/review-list.int.test.ts. States, proposals and the teacher's grade
// are written in the test database: their journeys are E6's and E7.4's.

test.setTimeout(180_000);

type Seeded = { assignmentId: string; teacherEmail: string };

/** One proposal in force, its levels summing to `grade`; optionally the teacher's evaluation with a fixed grade. */
async function evaluate(client: Client, submissionId: string, levels: number[], teacher?: { id: string; grade: number; assignmentId: string }) {
  const [run] = (
    await client.query<{ id: string }>(
      `INSERT INTO evaluation_runs (submission_id, version_number, outcome, provider, model_requested, model_answered, prompt_version, rubric_version, attempts, duration_ms)
       VALUES ($1, 1, 'proposed', 'simulator', 'simulator', 'simulator', 'evaluation-2', 'en-1', 1, 10) RETURNING id`,
      [submissionId],
    )
  ).rows;
  const [proposal] = (
    await client.query<{ id: string }>(
      `INSERT INTO ai_proposals (run_id, submission_id, version_number,
         level_task, level_organization, level_vocabulary, level_grammar, level_mechanics,
         justification_task, justification_organization, justification_vocabulary, justification_grammar, justification_mechanics,
         quotes_task, quotes_organization, quotes_vocabulary, quotes_grammar, quotes_mechanics,
         general_comment, next_steps, proposed_grade)
       VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'J.', 'J.', 'J.', 'J.', 'J.', '{q}', '{q}', '{q}', '{q}', '{q}', 'Clear.', '{Read more.}', $8)
       RETURNING id`,
      [run.id, submissionId, ...levels, levels.reduce((a, b) => a + b, 0)],
    )
  ).rows;
  await client.query(`UPDATE submissions SET status = 'to_review', current_proposal_id = $2 WHERE id = $1`, [submissionId, proposal.id]);
  if (!teacher) return;
  await client.query("BEGIN");
  await client.query(`UPDATE submissions SET teacher_started_at = now() WHERE id = $1`, [submissionId]);
  await client.query(
    `INSERT INTO teacher_evaluations (submission_id, version_number, origin, proposal_id, rubric_version,
       level_task, level_organization, level_vocabulary, level_grammar, level_mechanics, final_grade, grade_fixed, created_by)
     VALUES ($1, 1, 'proposal', $2, 'en-1', $3, $4, $5, $6, $7, $8, true, $9)`,
    [submissionId, proposal.id, ...levels, teacher.grade, teacher.id],
  );
  await client.query(
    `INSERT INTO review_journal_entries (assignment_id, submission_id, actor_id, event, evaluation_revision, version_number)
     VALUES ($1, $2, $3, 'evaluation_created', 1, 1)`,
    [teacher.assignmentId, submissionId, teacher.id],
  );
  await client.query("COMMIT");
}

/**
 * Classes A and B; seven students: Bauer (A and B, late, graded 15.5 by the
 * teacher), d'Aubigné (proposal 12), Émile (not assessable), Eric (received),
 * Martin (not submitted), Okafor (removed from A, evaluation failed), Silva
 * (removed from A, nothing submitted: absent).
 */
async function seed(page: Page): Promise<Seeded> {
  const teacherEmail = await createTeacher("Sarah", "Bennett");
  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/classes");
  for (const name of ["A", "B"]) await expect(await createClass(page, name)).toBeHidden();

  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const one = async <Row>(text: string, values: unknown[]) => (await client.query(text, values)).rows[0] as Row;
    const teacher = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [teacherEmail]);
    const classes = (await client.query<{ id: string; name: string }>(`SELECT id, name FROM classes WHERE teacher_id = $1`, [teacher.id])).rows;
    const classId = (name: string) => classes.find((c) => c.name === name)!.id;
    const { id: assignmentId } = await one<{ id: string }>(
      `INSERT INTO assignments (teacher_id, title, subject, level, language, deadline, locked_at)
       VALUES ($1, 'My town', 'Describe your town.', 'B1', 'en', now() + interval '7 days', now()) RETURNING id`,
      [teacher.id],
    );
    await client.query(
      `INSERT INTO assignment_classes (assignment_id, class_id, teacher_id) VALUES ($1, $2, $4), ($1, $3, $4)`,
      [assignmentId, classId("A"), classId("B"), teacher.id],
    );

    const student = async (first: string, last: string, classNames: string[], removed = false) => {
      const { id } = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [await createStudent(first, last)]);
      for (const name of classNames) {
        await client.query(
          `INSERT INTO class_memberships (class_id, student_id, status, removed_at) VALUES ($1, $2, $3, $4)`,
          [classId(name), id, removed ? "removed" : "active", removed ? new Date() : null],
        );
      }
      return id;
    };
    const submit = async (studentId: string, status: string, { late = false, cause = null as string | null } = {}) => {
      const { id } = await one<{ id: string }>(
        `INSERT INTO submissions (assignment_id, teacher_id, student_id, status, late, content_version, not_assessable_cause)
         VALUES ($1, $2, $3, $4, $5, 1, $6) RETURNING id`,
        [assignmentId, teacher.id, studentId, status, late, cause],
      );
      await client.query(
        `INSERT INTO submission_versions (submission_id, number, mode, text, request_id) VALUES ($1, 1, 'text', 'My town is small.', $2)`,
        [id, randomUUID()],
      );
      return id;
    };

    const bauer = await submit(await student("Lena", "Bauer", ["A", "B"]), "received", { late: true });
    await evaluate(client, bauer, [3, 3, 3, 3, 3], { id: teacher.id, grade: 15.5, assignmentId });
    await evaluate(client, await submit(await student("Agrippa", "d'Aubigné", ["A"]), "received"), [3, 3, 2, 2, 2]);
    await submit(await student("Zoé", "Émile", ["A"]), "not_assessable", { cause: "ai_unavailable" });
    await submit(await student("Paul", "Eric", ["B"]), "received");
    await student("Tom", "Martin", ["A"]);
    await submit(await student("Ada", "Okafor", ["A"], true), "evaluation_failed");
    await student("Rui", "Silva", ["A"], true);
    return { assignmentId, teacherEmail };
  } finally {
    await client.end();
  }
}

const listOpened = async (assignmentId: string) =>
  Number(
    (
      await sql<{ n: string }>(
        `SELECT count(*) AS n FROM review_journal_entries WHERE assignment_id = $1 AND event = 'list_opened'`,
        [assignmentId],
      )
    )[0].n,
  );

const table = (page: Page) => page.getByRole("table", { name: "Submissions" });
const studentNames = async (page: Page) =>
  (await table(page).locator("tbody tr td:first-child").allInnerTexts()).map((name) => name.split(" ")[0]);

test("REV-01: the list of an assignment's submissions, sorted and filtered, opened from the assignments list", async ({ page, browser }) => {
  const { assignmentId } = await seed(page);

  // ASG-02 R1: the real counts. Nothing is logged before the click (next dev does not prefetch:
  // the prefetch case is replayed on the preview, E7.8).
  await page.goto("/teacher/assignments");
  const line = page.getByRole("row").filter({ hasText: "My town" });
  await expect(line.getByRole("cell").nth(5)).toHaveText("5");
  await expect(line.getByRole("cell").nth(6)).toHaveText("2");
  await page.waitForTimeout(1_500);
  expect(await listOpened(assignmentId)).toBe(0);

  // ASG-02 CA2: a click on the assignment opens its submissions.
  await line.getByRole("link", { name: "My town" }).click();
  await expect(page.getByRole("heading", { name: /Submissions · 5 of 6 submitted/ })).toBeVisible();
  await expect.poll(() => listOpened(assignmentId)).toBe(1);

  // R2, CA4, CLS-04 CA3: Silva (removed, nothing submitted) absent; Okafor marked; Martin not submitted.
  expect(await studentNames(page)).toEqual(["Bauer", "d'Aubigné", "Émile", "Eric", "Martin", "Okafor"]);
  const row = (name: string) => table(page).getByRole("row").filter({ hasText: name });
  await expect(row("Okafor")).toContainText("Removed from class");
  await expect(row("Okafor")).toContainText("Evaluation failed");
  await expect(row("Martin")).toContainText("Not submitted");
  await expect(row("Bauer")).toContainText("A,B");
  await expect(row("Émile")).toContainText("AI unavailable");
  // SUB-04 CA3: "Late" in the teacher's list.
  await expect(row("Bauer")).toContainText("Late");
  await expect(row("Eric")).not.toContainText("Late");
  // R4: the teacher's grade; otherwise the proposed one, provisional.
  await expect(row("Bauer").getByRole("cell").last()).toHaveText("15.5");
  await expect(row("d'Aubigné").getByRole("cell").last()).toHaveText("provisional12");
  await page.screenshot({ path: "test-results/rev01-1-list-desktop.png", fullPage: true });

  // CA2: by grade, both directions; the copies without a grade stay last.
  await table(page).getByRole("button", { name: /^Grade/ }).click();
  await expect(page).toHaveURL(/sort=grade/);
  await expect.poll(() => studentNames(page)).toEqual(["d'Aubigné", "Bauer", "Émile", "Eric", "Martin", "Okafor"]);
  await table(page).getByRole("button", { name: /^Grade/ }).click();
  await expect(page).toHaveURL(/sort=grade&dir=desc/);
  await expect.poll(() => studentNames(page)).toEqual(["Bauer", "d'Aubigné", "Émile", "Eric", "Martin", "Okafor"]);

  // R5, CA3: counters over the whole list; "To review" with the order by date.
  const counters = page.getByRole("group", { name: "Needs attention" });
  await expect(counters.getByRole("button", { name: /To review/ })).toContainText("2");
  await expect(counters.getByRole("button", { name: /Failed/ })).toContainText("1");
  await expect(counters.getByRole("button", { name: /Not assessable/ })).toContainText("1");
  await counters.getByRole("button", { name: /To review/ }).click();
  await expect(page).toHaveURL(/status=to_review/);
  await table(page).getByRole("button", { name: /^Submitted/ }).click();
  await expect(page).toHaveURL(/sort=date/);
  await expect.poll(() => studentNames(page)).toEqual(["Bauer", "d'Aubigné"]);
  await expect(counters.getByRole("button", { name: /To review/ })).toHaveAttribute("aria-pressed", "true");
  await expect(counters.getByRole("button", { name: /Failed/ })).toContainText("1");

  // Class filter combined with the status; Clear filters gives everything back.
  await page.getByRole("combobox", { name: "Class" }).click();
  await page.getByRole("option", { name: "B" }).click();
  await expect(page).toHaveURL(/class=/);
  await expect.poll(() => studentNames(page)).toEqual(["Bauer"]);
  await page.screenshot({ path: "test-results/rev01-2-filtered-desktop.png", fullPage: true });

  // The name opens the copy (E7.3) with the list's state; the state survives leaving and coming back.
  const href = await table(page).getByRole("link", { name: /Bauer/ }).getAttribute("href");
  expect(href).toMatch(new RegExp(`^/teacher/assignments/${assignmentId}/students/[0-9a-f-]{36}\\?list=`));
  expect(decodeURIComponent(href!.split("?list=")[1])).toMatch(/status=to_review/);
  const filtered = page.url();
  await page.goto("/teacher/assignments");
  await page.goBack();
  await expect(page).toHaveURL(filtered);
  await expect.poll(() => studentNames(page)).toEqual(["Bauer"]);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect.poll(() => studentNames(page)).toHaveLength(6);

  // A narrow window: the table scrolls inside its frame, never the page.
  const narrow = await (await browser.newContext({ ...phone, storageState: await page.context().storageState() })).newPage();
  await narrow.goto(`/teacher/assignments/${assignmentId}`);
  await expect(narrow.getByRole("heading", { name: /Submissions · 5 of 6 submitted/ })).toBeVisible();
  // The capture waits for hydration: the selects show their value once hydrated.
  await expect(narrow.getByRole("combobox", { name: "Class" })).toHaveText("All classes");
  await expect(narrow.getByRole("combobox", { name: "Status" })).toHaveText("All statuses");
  expect(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await narrow.screenshot({ path: "test-results/rev01-3-list-phone.png", fullPage: true });
});

test("another teacher's list, or a missing one, answers a real 404, and logs nothing", async ({ page, browser }) => {
  const { assignmentId } = await seed(page);
  const other = await (await browser.newContext()).newPage();
  await signIn(other, await createTeacher("Omar", "Haddad"));
  await expect(other).toHaveURL(/\/teacher\//);
  await expectNotFound(other, `/teacher/assignments/${assignmentId}`);
  await expectNotFound(other, `/teacher/assignments/${randomUUID()}`);
  expect(await listOpened(assignmentId)).toBe(0);
});
