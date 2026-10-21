import { randomUUID } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { phone } from "./support/classes";
import { signIn, sql } from "./support/helpers";
import { journalCount, seedTeacher } from "./support/review";

// PRC-02 from the screen (E7.6), in the real runtime: "Retry" on a failed
// copy and "Relaunch" from the list start the workflow (Local World, the
// simulator), and the copy reaches To review by itself; a double click asks
// once (R4); a refusal warns; a replaced copy is refused clearly; the student
// keeps seeing "Submitted, being marked" (CA4). The rules and the races:
// tests/review-relaunch.int.test.ts.

// One evaluation to wait for, through Workflows' Local World.
test.setTimeout(240_000);

const TEXT = "My town is small but it is beatiful. There is a market every friday and the peoples are friendly.";
const UNAVAILABLE = ["unavailable", "unavailable", "unavailable"];

const copyUrl = (assignmentId: string, studentId: string) => `/teacher/assignments/${assignmentId}/students/${studentId}`;
const stateOf = async (submissionId: string) =>
  (await sql<{ status: string }>(`SELECT status FROM submissions WHERE id = $1`, [submissionId]))[0].status;
const runs = async (submissionId: string) =>
  Number((await sql<{ n: string }>(`SELECT count(*) AS n FROM evaluation_runs WHERE submission_id = $1`, [submissionId]))[0].n);

/** The student's own view: their assignments, signed in a context of their own. */
async function studentSees(browser: Browser, studentId: string) {
  const [{ email }] = await sql<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [studentId]);
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/student\//);
  await page.goto("/student/assignments");
  return page;
}

test("CA1, CA2, R4, CA4: a failed copy, Retry double-clicked: one request, one evaluation, To review; the student sees being marked", async ({ page, browser }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, studentId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    submissionId = await seeder.submit(assignmentId, studentId, "evaluation_failed", { text: TEXT });
    await seeder.fail(submissionId, UNAVAILABLE);
  } finally {
    await seeder.close();
  }
  const student = await studentSees(browser, studentId);
  await expect(student.getByText("Submitted, being marked").first()).toBeVisible();
  await expect(student.locator("main")).not.toContainText("Evaluation failed");

  // CA1: the failure, visible to the teacher.
  await page.goto(copyUrl(assignmentId, studentId));
  await expect(page.getByText("Evaluation failed", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("The AI could not be reached.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Evaluate manually" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/prc02-1-failed-desktop.png", fullPage: true });

  // R4: a double click asks once.
  await page.getByRole("button", { name: "Retry" }).dblclick();
  // CA2: the run evaluates it; the page shows the form without a reload.
  await expect.poll(() => stateOf(submissionId), { timeout: 90_000 }).toBe("to_review");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible({ timeout: 30_000 });
  expect(await runs(submissionId)).toBe(2);
  expect(await journalCount(assignmentId, "retry_requested")).toBe(1);
  await page.screenshot({ path: "test-results/prc02-2-retried-desktop.png", fullPage: true });

  // CA4: nothing changed for the student.
  await student.reload();
  await expect(student.getByText("Submitted, being marked").first()).toBeVisible();
});

test("CA3 from the list: Relaunch on the 'AI unavailable' copy only; it reaches To review", async ({ page }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, unavailable: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    const [lena, sam, noor] = [
      await seeder.student("Lena", "Bauer", ["A"]),
      await seeder.student("Sam", "Lee", ["A"]),
      await seeder.student("Noor", "Haddad", ["A"]),
    ];
    unavailable = await seeder.submit(assignmentId, lena, "not_assessable", { cause: "ai_unavailable", text: TEXT });
    await seeder.submit(assignmentId, sam, "not_assessable", { cause: "no_content", text: "..." });
    await seeder.fail(await seeder.submit(assignmentId, noor, "evaluation_failed", { text: TEXT }), UNAVAILABLE);
  } finally {
    await seeder.close();
  }
  await page.goto(`/teacher/assignments/${assignmentId}`);
  const table = page.getByRole("table", { name: "Submissions" });
  await expect(table.getByRole("button", { name: /^Relaunch/ })).toHaveCount(1);
  const row = table.getByRole("row").filter({ hasText: "Bauer" });
  await expect(row.getByRole("button", { name: "Relaunch Lena Bauer" })).toBeVisible();
  await page.screenshot({ path: "test-results/prc02-3-relaunch-list-desktop.png", fullPage: true });

  await row.getByRole("button", { name: "Relaunch Lena Bauer" }).click();
  await expect.poll(() => stateOf(unavailable), { timeout: 90_000 }).toBe("to_review");
  await expect(row.getByText("To review", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await journalCount(assignmentId, "relaunch_requested")).toBe(1);

  // "No content" is never offered, from the copy either.
  await table.getByRole("link", { name: /Lee/ }).click();
  await expect(page.getByText("The text has nothing the rubric can assess. It cannot be relaunched.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Relaunch/ })).toHaveCount(0);
});

test("a refusal: the copy says so, warns that it usually repeats, and lets the teacher retry anyway", async ({ page, browser }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, studentId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    await seeder.fail(await seeder.submit(assignmentId, studentId, "evaluation_failed", { text: TEXT }), ["refused"]);
  } finally {
    await seeder.close();
  }
  await page.goto(copyUrl(assignmentId, studentId));
  await expect(page.getByText("The AI declined to assess this text.")).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry anyway" });
  await expect(retry).toHaveAccessibleDescription(/Asked again, it will most likely decline again/);
  await expect(page.getByRole("button", { name: "Evaluate manually" })).toHaveCount(0);
  await retry.focus();
  await page.screenshot({ path: "test-results/prc02-4-refused-desktop.png", fullPage: true });

  const narrow = await (await browser.newContext({ ...phone, storageState: await page.context().storageState() })).newPage();
  await narrow.goto(copyUrl(assignmentId, studentId));
  await expect(narrow.getByRole("button", { name: "Retry anyway" })).toBeVisible();
  expect(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await narrow.screenshot({ path: "test-results/prc02-5-refused-phone.png", fullPage: true });
});

test("replaced while open: Retry is refused clearly, the copy reloaded on the new version; a dropped request is said", async ({ page }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, studentId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    submissionId = await seeder.submit(assignmentId, studentId, "evaluation_failed", { text: TEXT });
    await seeder.fail(submissionId, UNAVAILABLE);
  } finally {
    await seeder.close();
  }
  // A request dropped for want of a place (plan of E7 §1.11), as the workflow logs it.
  await sql(
    `INSERT INTO review_journal_entries (assignment_id, submission_id, actor_id, event, version_number, new_value)
     VALUES ($1, $2, NULL, 'retry_abandoned', 1, '{"origin":"retry"}')`,
    [assignmentId, submissionId],
  );
  await page.goto(copyUrl(assignmentId, studentId));
  await expect(page.getByText("Retry not started")).toBeVisible();
  await expect(page.getByText(/No evaluation slot was freed within 5 minutes/)).toBeVisible();
  await page.screenshot({ path: "test-results/prc02-6-abandoned-desktop.png", fullPage: true });

  // The student replaces the text meanwhile (the replacement's own journey: E4).
  await sql(`INSERT INTO submission_versions (submission_id, number, mode, text, request_id) VALUES ($1, 2, 'text', 'My new text about my village.', $2)`, [
    submissionId, randomUUID(),
  ]);
  await sql(`UPDATE submissions SET current_version = 2, status = 'received' WHERE id = $1`, [submissionId]);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("This submission was replaced by the student. The page has been reloaded. Nothing was requested.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Student text" })).toContainText("My new text about my village.");
  await expect(page.getByText("Being evaluated", { exact: true })).toBeVisible();
  expect(await journalCount(assignmentId, "retry_requested")).toBe(0);
});
