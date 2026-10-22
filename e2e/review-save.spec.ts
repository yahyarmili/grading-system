import { expect, test } from "@playwright/test";
import { phone } from "./support/classes";
import { sql } from "./support/helpers";
import { seedTeacher } from "./support/review";

// REV-03, REV-04 (E7.4), in a real browser: the teacher changes a level, a
// remark and the grade of a copy and saves; the screen recalculates, marks,
// signals the gap, and the server logs each change. The rules and the
// refusals: tests/review-save.int.test.ts.

test.setTimeout(180_000);

const TEXT = "My town is small but it is beatiful.\n\nThere is a market every friday and the peoples are friendly.";

test("REV-03: change a level, a remark and the grade, then save; each change is logged", async ({ page, browser }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, studentId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    submissionId = await seeder.submit(assignmentId, studentId, "received", { text: TEXT });
    // Levels 3, 2, 2, 2, 1: proposed grade 10.
    await seeder.evaluate(assignmentId, submissionId, [3, 2, 2, 2, 1], { quote: "beatiful" });
  } finally {
    await seeder.close();
  }
  await page.goto(`/teacher/assignments/${assignmentId}/students/${studentId}`);
  const task = page.getByRole("region", { name: /^1/ });
  const bar = page.locator("form > div.sticky");
  await expect(bar).toContainText("Grade 10 / 20 · calculated");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  // CA1: a level changed, the grade not fixed: recalculated, "Modified", "To re-read".
  await task.getByRole("radio", { name: /^4 –/ }).check({ force: true });
  await expect(task.getByText("Modified")).toBeVisible();
  await expect(task.getByText("To re-read")).toBeVisible();
  await expect(bar).toContainText("Grade 11 / 20 · calculated");
  await expect(bar).toContainText("Unsaved changes");

  // A remark rewritten, in the assignment's language: its "to re-read" is gone.
  const remark = task.getByRole("textbox", { name: "Remark" });
  await expect(remark).toHaveAttribute("lang", "en");
  await remark.fill("Fully answers the task, with examples.");
  await expect(task.getByText("To re-read")).toBeHidden();

  // CA2: a grade typed: fixed, the gap with the calculated grade said in words and signs.
  await page.getByLabel(/^Final grade/).fill("14,5");
  await expect(page.getByText("Final grade differs from the calculated grade")).toBeVisible();
  await expect(page.getByText("Final 14.5 / 20, calculated 11 / 20 (+3.5).")).toBeVisible();
  await expect(bar).toContainText("Grade 14.5 / 20 · fixed by you");
  await page.screenshot({ path: "test-results/rev03-1-changed-desktop.png", fullPage: true });

  // CA2: the grade fixed, then a level changed: the grade stays, the gap follows the calculated grade.
  await page.getByRole("region", { name: /^2/ }).getByRole("radio", { name: /^3 –/ }).check({ force: true });
  await expect(bar).toContainText("Grade 14.5 / 20 · fixed by you");
  await expect(page.getByText("Final 14.5 / 20, calculated 12 / 20 (+2.5).")).toBeVisible();
  // Put back: what follows checks the log of the changes above only.
  await page.getByRole("region", { name: /^2/ }).getByRole("radio", { name: /^2 –/ }).check({ force: true });
  await expect(page.getByText("Final 14.5 / 20, calculated 11 / 20 (+3.5).")).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  // REV-04 CA1: old and new values, author, date; the proposal unchanged.
  const journal = await sql<{ field: string; old_value: unknown; new_value: unknown; actor: boolean; dated: boolean }>(
    `SELECT field, old_value, new_value, actor_id IS NOT NULL AS actor, created_at IS NOT NULL AS dated
     FROM review_journal_entries WHERE submission_id = $1 AND event = 'evaluation_changed' ORDER BY field`,
    [submissionId],
  );
  expect(journal).toEqual([
    { field: "final_grade", old_value: 10, new_value: 14.5, actor: true, dated: true },
    { field: "grade_fixed", old_value: false, new_value: true, actor: true, dated: true },
    { field: "level.task", old_value: 3, new_value: 4, actor: true, dated: true },
    { field: "remark.task", old_value: "Answers the task.", new_value: "Fully answers the task, with examples.", actor: true, dated: true },
  ]);
  expect(await sql(`SELECT level_task, proposed_grade FROM ai_proposals WHERE submission_id = $1`, [submissionId])).toEqual([
    { level_task: 3, proposed_grade: 10 },
  ]);
  expect((await sql<{ started: boolean }>(`SELECT teacher_started_at IS NOT NULL AS started FROM submissions WHERE id = $1`, [submissionId]))[0].started).toBe(true);

  // Reloaded: the saved evaluation, the proposal beside it.
  await page.reload();
  await expect(task.getByRole("radio", { name: /^4 –/ })).toBeChecked();
  await expect(remark).toHaveValue("Fully answers the task, with examples.");
  await expect(task).toContainText("Level 3");
  await expect(page.getByLabel(/^Final grade/)).toHaveValue("14.5");

  // Back to the calculated grade.
  await page.getByRole("button", { name: "Use calculated grade" }).click();
  await expect(page.getByText("Final grade differs from the calculated grade")).toBeHidden();
  await expect(bar).toContainText("Grade 11 / 20 · calculated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");

  // A grade off the step is refused, with its message next to the field; nothing saved.
  await page.getByLabel(/^Final grade/).fill("12.3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Use steps of 0.5.")).toBeVisible();
  await expect(page.getByLabel(/^Final grade/)).toBeFocused();

  const narrow = await (await browser.newContext({ ...phone, storageState: await page.context().storageState() })).newPage();
  await narrow.goto(`/teacher/assignments/${assignmentId}/students/${studentId}`);
  await expect(narrow.getByRole("button", { name: "Save changes" })).toBeVisible();
  expect(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await narrow.screenshot({ path: "test-results/rev03-2-form-phone.png", fullPage: true });
});
