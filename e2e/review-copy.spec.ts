import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { phone } from "./support/classes";
import { createTeacher, expectNotFound, signIn, sql } from "./support/helpers";
import { journalCount, seedTeacher } from "./support/review";

// REV-02 (E7.3), in a real browser: a student's copy, opened by a click on
// their name; its status page when there is no proposal to review; a real
// 404 for another teacher's copy or a student who did not receive the
// assignment. The rules: tests/review-copy.int.test.ts.

test.setTimeout(180_000);

const FIRST_TEXT = "First text: my town is small but it is beatiful.\n\nThere is a market every friday.";
const SECOND_TEXT = "Second text: my village has a river and an old bridge.";

/**
 * Classes A, B and C; "My town" sent to A and B. Two students named Sam Lee:
 * the first in A, proposal only; the second in A, B and C, graded 13.5 by
 * the teacher, and graded 17.5 on an earlier assignment. Other students in
 * each state without a proposal; one in C only, who did not receive it.
 */
async function seed(page: Page) {
  const seeder = await seedTeacher(page, ["A", "B", "C"]);
  try {
    const earlier = await seeder.assignment(["C"], "Last week");
    const assignmentId = await seeder.assignment(["A", "B"]);
    const first = await seeder.student("Sam", "Lee", ["A"]);
    const second = await seeder.student("Sam", "Lee", ["A", "B", "C"]);
    await seeder.evaluate(assignmentId, await seeder.submit(assignmentId, first, "received", { text: FIRST_TEXT }), [3, 2, 2, 2, 1], { quote: "beatiful" });
    await seeder.evaluate(assignmentId, await seeder.submit(assignmentId, second, "received", { text: SECOND_TEXT, late: true }), [3, 3, 3, 2, 2], {
      teacherGrade: 13.5, quote: "old bridge",
    });
    await seeder.evaluate(earlier, await seeder.submit(earlier, second, "received"), [4, 4, 4, 3, 3], { teacherGrade: 17.5 });

    const states = {
      notSubmitted: await seeder.student("Tom", "Martin", ["A"]),
      evaluating: await seeder.student("Paul", "Eric", ["A"]),
      refused: await seeder.student("Ada", "Okafor", ["A"]),
      unavailable: await seeder.student("Zoé", "Émile", ["B"]),
      outsider: await seeder.student("Rui", "Silva", ["C"]),
    };
    await seeder.submit(assignmentId, states.evaluating, "received");
    const refusedId = await seeder.submit(assignmentId, states.refused, "evaluation_failed");
    await sql(
      `INSERT INTO evaluation_runs (submission_id, version_number, outcome, provider, model_requested, prompt_version, rubric_version, attempts, attempt_errors, duration_ms)
       VALUES ($1, 1, 'failed', 'simulator', 'simulator', 'evaluation-2', 'en-1', 1, '{refused}', 10)`,
      [refusedId],
    );
    await seeder.submit(assignmentId, states.unavailable, "not_assessable", { cause: "ai_unavailable" });
    return { assignmentId, earlier, first, second, states };
  } finally {
    await seeder.close();
  }
}

const copyUrl = (assignmentId: string, studentId: string) => `/teacher/assignments/${assignmentId}/students/${studentId}`;

test("REV-02: a click on a name opens that student's copy, with the proposal beside the evaluation and no earlier result", async ({ page, browser }) => {
  const { assignmentId, first, second } = await seed(page);
  await page.goto(`/teacher/assignments/${assignmentId}?sort=grade`);
  const lee = page.getByRole("table", { name: "Submissions" }).getByRole("link", { name: "Lee Sam" });
  await expect(lee).toHaveCount(2);
  expect(await journalCount(assignmentId, "copy_opened")).toBe(0);

  // CA1: two namesakes, each click opens the right copy. By grade: the first (10) before the second (13.5).
  await lee.first().click();
  await expect(page).toHaveURL(new RegExp(`${copyUrl(assignmentId, first)}\\?list=sort%3Dgrade$`));
  await expect(page.getByRole("heading", { name: "Sam Lee", level: 1 })).toBeVisible();
  const text = page.getByRole("region", { name: "Student text" });
  // Exactly as submitted, in the assignment's language (USA-03).
  await expect(text.locator("[lang=en]")).toHaveText(FIRST_TEXT, { useInnerText: true });
  const classes = page.getByRole("list", { name: "Classes" }).getByRole("listitem");
  await expect(classes).toHaveText(["A"]);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(1);

  // The proposal: levels, justification, quote, comment, next steps, proposed grade, alert.
  const task = page.getByRole("region", { name: /^1/ });
  await expect(task).toContainText("Level 3");
  await expect(task).toContainText("Answers the task.");
  await expect(task.locator("q[lang=en]")).toHaveText("beatiful");
  await expect(page.getByText("Very short text")).toBeVisible();
  await expect(page.getByText("A clear and simple text.").first()).toBeVisible();
  await expect(page.getByText("Proposed grade 10 / 20")).toBeVisible();
  // The teacher's evaluation starts from the proposal, nothing to save yet (REV-03 R1, E7.4).
  await expect(page.getByRole("textbox", { name: "General comment", exact: true })).toHaveValue("A clear and simple text.");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await page.screenshot({ path: "test-results/rev02-1-copy-desktop.png", fullPage: true });

  // Back to the list with its sort, then the namesake's copy.
  await page.getByRole("link", { name: "My town: submissions" }).click();
  await expect(page).toHaveURL(new RegExp(`/teacher/assignments/${assignmentId}\\?sort=grade$`));
  await lee.nth(1).click();
  await expect(page).toHaveURL(new RegExp(copyUrl(assignmentId, second)));
  await expect(page.getByRole("region", { name: "Student text" })).toContainText("Second text");
  // CA2: the recipient classes only, A and B, not C.
  await expect(classes).toHaveText(["A,", "B"]);
  const header = page.locator("header", { has: page.getByRole("heading", { name: "Sam Lee", level: 1 }) });
  await expect(header.getByText("Late", { exact: true })).toBeVisible();
  await expect(page.getByText("Final grade differs from the calculated grade")).toBeVisible();
  // CA3: no earlier result of the student (17.5 on "Last week").
  await expect(page.locator("main")).not.toContainText("17.5");
  await expect(page.locator("main")).not.toContainText("Last week");
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(2);

  const narrow = await (await browser.newContext({ ...phone, storageState: await page.context().storageState() })).newPage();
  await narrow.goto(copyUrl(assignmentId, second));
  await expect(narrow.getByRole("heading", { name: "Sam Lee", level: 1 })).toBeVisible();
  expect(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await narrow.screenshot({ path: "test-results/rev02-2-copy-phone.png", fullPage: true });
});

test("REV-02 R4: without a proposal to review, a status page with the cause and no form", async ({ page }) => {
  const { assignmentId, states } = await seed(page);
  for (const [student, title, cause] of [
    [states.notSubmitted, "Not submitted", "has not submitted anything"],
    [states.evaluating, "Being evaluated", "once the evaluation ends"],
    [states.refused, "Evaluation failed", "The AI declined to assess this text."],
    [states.unavailable, "Not assessable", "AI unavailable"],
  ] as const) {
    await page.goto(copyUrl(assignmentId, student));
    await expect(page.getByText(title, { exact: true }).last()).toBeVisible();
    await expect(page.getByText(cause)).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  }
  await page.screenshot({ path: "test-results/rev02-3-not-assessable-desktop.png", fullPage: true });
  // Not submitted: nothing logged; the three others: one entry each.
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(3);
});

test("another teacher's copy, a student who did not receive the assignment, or a missing one: a real 404", async ({ page, browser }) => {
  const { assignmentId, first, states } = await seed(page);
  await expectNotFound(page, copyUrl(assignmentId, states.outsider));
  await expectNotFound(page, copyUrl(assignmentId, randomUUID()));
  await expectNotFound(page, copyUrl(randomUUID(), first));
  await expectNotFound(page, `/teacher/assignments/${assignmentId}/students/not-an-id`);

  const other = await (await browser.newContext()).newPage();
  await signIn(other, await createTeacher("Omar", "Haddad"));
  await expect(other).toHaveURL(/\/teacher\//);
  await expectNotFound(other, copyUrl(assignmentId, first));
  expect(await journalCount(assignmentId, "copy_opened")).toBe(0);
});
