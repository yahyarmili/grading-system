import { expect, test, type Page } from "@playwright/test";
import { sql } from "./support/helpers";
import { journalCount, seedTeacher } from "./support/review";

// REV-06 (E8.2), in a real browser: a copy refused by the AI, then a French
// copy without a validated French rubric (Q6), evaluated by hand with the
// same form, without a proposal; the first save starts the copy, then it is
// validated and published as any other. Rules and refusals:
// tests/review-manual.int.test.ts.

test.setTimeout(180_000);

const events = async (submissionId: string) =>
  (
    await sql<{ event: string }>(
      `SELECT event FROM review_journal_entries WHERE submission_id = $1 AND event NOT IN ('copy_opened', 'list_opened') ORDER BY created_at, id`,
      [submissionId],
    )
  ).map((e) => e.event);

/** Opens the copy and waits for its opening to be logged: the page is hydrated (E7.9). */
async function openCopy(page: Page, url: string, assignmentId: string) {
  const before = await journalCount(assignmentId, "copy_opened");
  await page.goto(url);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBeGreaterThan(before);
}

/** Chooses a level for each of the five criteria. */
async function chooseLevels(page: Page, levels: number[]) {
  for (const [i, level] of levels.entries()) {
    await page.getByRole("region", { name: new RegExp(`^${i + 1}`) }).getByRole("radio", { name: new RegExp(`^${level} –`) }).check({ force: true });
  }
}

test("REV-06 CA1: a refused copy evaluated by hand, then validated and published; out of the relaunches", async ({ page }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, studentId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    submissionId = await seeder.submit(assignmentId, studentId, "evaluation_failed", { text: "My town is small but it is beatiful." });
    await seeder.fail(submissionId, ["refused"]);
  } finally {
    await seeder.close();
  }
  const url = `/teacher/assignments/${assignmentId}/students/${studentId}`;
  await openCopy(page, url, assignmentId);
  await expect(page.getByText("A refusal usually repeats")).toBeVisible();

  await page.getByRole("link", { name: "Evaluate manually" }).click();
  await expect(page).toHaveURL(/manual=1/);
  await expect(page.getByText("Manual evaluation, without an AI proposal.")).toBeVisible();
  // No proposal beside the form: no AI column, no alert, no proposed grade.
  await expect(page.getByText("AI proposal", { exact: true })).toHaveCount(0);
  const bar = page.locator("form > div.sticky");
  await expect(bar).toContainText("Grade — · calculated");

  // Validated before every level is chosen: refused level by level, nothing written.
  await chooseLevels(page, [3, 3, 2, 2]);
  await bar.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByText("Choose a level for this criterion.")).toBeVisible();
  expect(await events(submissionId)).toEqual([]);

  // The first save starts the copy (transition 6) and the evaluation "manual".
  await chooseLevels(page, [3, 3, 2, 2, 2]);
  await page.getByRole("textbox", { name: "General comment" }).fill("A clear, short text.");
  await expect(bar).toContainText("Grade 12 / 20");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  await expect(page.locator("header").filter({ has: page.getByRole("heading", { name: "Lena Bauer" }) })).toContainText("To review");
  const logged = await events(submissionId);
  expect(logged.slice(0, 2)).toEqual(["manual_started", "evaluation_created"]);
  expect(new Set(logged.slice(2))).toEqual(new Set(["evaluation_changed"]));
  const history = page.getByRole("region", { name: "History" });
  await expect(history).toContainText("Entered manually, without AI proposal");
  await page.screenshot({ path: "test-results/rev06-1-manual-desktop.png", fullPage: true });

  // Then as any copy: validated and published (E8.1).
  await bar.getByRole("button", { name: "Validate and publish" }).click();
  const dialog = page.getByRole("dialog", { name: "Validate and publish this evaluation?" });
  await dialog.getByRole("button", { name: "Validate and publish" }).click();
  await expect(page.locator("header").filter({ has: page.getByRole("heading", { name: "Lena Bauer" }) })).toContainText("Published by Sarah Bennett");
  await expect(history).toContainText("Validated (entered manually)");
  expect(await sql(`SELECT origin, rubric_version, final_grade FROM teacher_evaluations WHERE submission_id = $1`, [submissionId])).toEqual([
    { origin: "manual", rubric_version: "en-1", final_grade: "12.00" },
  ]);

  // PRC-02 R4: no Retry or Relaunch for it in the list any more.
  await page.goto(`/teacher/assignments/${assignmentId}`);
  const row = page.getByRole("table", { name: "Submissions" }).getByRole("row", { name: /Bauer/ });
  await expect(row).toContainText("Published");
  await expect(row.getByRole("button", { name: /Retry|Relaunch/ })).toHaveCount(0);
});

test("REV-06 CA2: a French assignment without a French rubric: the same form, on the English rubric, said so (Q6)", async ({ page }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, studentId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"], "Ma ville", "fr");
    studentId = await seeder.student("Lina", "Amrani", ["A"]);
    submissionId = await seeder.submit(assignmentId, studentId, "not_assessable", {
      cause: "rubric_unavailable",
      text: "Ma ville est petite mais elle est belle.",
    });
  } finally {
    await seeder.close();
  }
  await openCopy(page, `/teacher/assignments/${assignmentId}/students/${studentId}`, assignmentId);
  await page.getByRole("link", { name: "Evaluate manually" }).click();
  await expect(page.getByText("these are the criteria of the English rubric (en-1)")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "General comment" })).toHaveAttribute("lang", "fr");

  await chooseLevels(page, [2, 2, 2, 2, 2]);
  await page.locator("form > div.sticky").getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("form > div.sticky").getByRole("status")).toHaveText("Saved");
  expect(await sql(`SELECT origin, rubric_version FROM teacher_evaluations WHERE submission_id = $1`, [submissionId])).toEqual([
    { origin: "manual", rubric_version: "en-1" },
  ]);
  expect((await events(submissionId))[0]).toBe("manual_started");
  await page.screenshot({ path: "test-results/rev06-2-french-desktop.png", fullPage: true });
});
