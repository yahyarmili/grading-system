import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sql } from "./support/helpers";
import { leaveCopyAnyway, seedTeacher } from "./support/review";

// REV-03 R5, CA3, CA4 (E7.5), in a real browser: two tabs of the same copy,
// and a replacement while the copy is open. Nothing is overwritten
// silently; the races themselves: tests/review-concurrency.int.test.ts.

test.setTimeout(180_000);

const TEXT = "My town is small but it is beatiful.\n\nThere is a market every friday.";

async function seed(page: Parameters<typeof seedTeacher>[0]) {
  const seeder = await seedTeacher(page, ["A"]);
  try {
    const assignmentId = await seeder.assignment(["A"]);
    const studentId = await seeder.student("Lena", "Bauer", ["A"]);
    const submissionId = await seeder.submit(assignmentId, studentId, "received", { text: TEXT });
    await seeder.evaluate(assignmentId, submissionId, [3, 2, 2, 2, 1], { quote: "beatiful" });
    return { url: `/teacher/assignments/${assignmentId}/students/${studentId}`, submissionId };
  } finally {
    await seeder.close();
  }
}

test("CA4: the same evaluation saved in two tabs: the second gets a conflict, keeps its text, and may save it over", async ({ page }) => {
  const { url, submissionId } = await seed(page);
  const second = await page.context().newPage();
  await page.goto(url);
  await second.goto(url);
  const comment = (p: typeof page) => p.getByRole("textbox", { name: "General comment", exact: true });

  await comment(page).fill("From tab one.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  await comment(second).fill("From tab two.");
  await second.getByRole("button", { name: "Save changes" }).click();
  const conflict = second.getByRole("status").filter({ hasText: "Changed in another tab or window" });
  await expect(conflict).toBeVisible();
  // The typing stays; nothing was overwritten.
  await expect(comment(second)).toHaveValue("From tab two.");
  expect(await sql(`SELECT general_comment FROM teacher_evaluations WHERE submission_id = $1`, [submissionId])).toEqual([
    { general_comment: "From tab one." },
  ]);
  await second.screenshot({ path: "test-results/rev03-3-conflict-desktop.png", fullPage: true });

  // Knowingly saved over: logged like any change.
  await conflict.getByRole("button", { name: "Save mine over it" }).click();
  await expect(second.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  expect(
    await sql(
      `SELECT old_value, new_value FROM review_journal_entries WHERE submission_id = $1 AND field = 'general_comment' ORDER BY evaluation_revision`,
      [submissionId],
    ),
  ).toEqual([
    { old_value: "A clear and simple text.", new_value: "From tab one." },
    { old_value: "From tab one.", new_value: "From tab two." },
  ]);
});

test("CA3: replaced by the student while open: the save is refused, the copy reloaded on the new version", async ({ page }) => {
  const { url, submissionId } = await seed(page);
  await page.goto(url);
  await page.getByRole("region", { name: /^1/ }).getByRole("radio", { name: /^4 –/ }).check({ force: true });

  // The student replaces the text meanwhile (the replacement's own journey: E4).
  await sql(`INSERT INTO submission_versions (submission_id, number, mode, text, request_id) VALUES ($1, 2, 'text', 'My new text about my village.', $2)`, [
    submissionId, randomUUID(),
  ]);
  await sql(`UPDATE submissions SET current_version = 2, current_proposal_id = NULL, status = 'received' WHERE id = $1`, [submissionId]);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("This submission was replaced. The page has been reloaded. Nothing was saved.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Student text" })).toContainText("My new text about my village.");
  await expect(page.getByText("Being evaluated", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  expect(await sql(`SELECT 1 FROM teacher_evaluations WHERE submission_id = $1`, [submissionId])).toEqual([]);
  await page.screenshot({ path: "test-results/rev03-4-replaced-desktop.png", fullPage: true });
});

test("CA4 (C1): saved in another tab while this one has changes typed; shown again, it announces the conflict and keeps the typing", async ({ page }) => {
  const { url, submissionId } = await seed(page);
  const other = await page.context().newPage();
  await page.goto(url);
  await other.goto(url);
  const comment = (p: typeof page) => p.getByRole("textbox", { name: "General comment", exact: true });
  // Both tabs hydrated (their opening is logged from an effect): typing before
  // would race React taking the form over.
  await expect
    .poll(async () => (await sql(`SELECT count(*)::int AS n FROM review_journal_entries WHERE submission_id = $1 AND event = 'copy_opened'`, [submissionId]))[0].n)
    .toBe(2);

  // This tab has changes typed; the other one saves meanwhile.
  await comment(page).fill("From this tab.");
  await comment(other).fill("From the other tab.");
  await other.getByRole("button", { name: "Save changes" }).click();
  await expect(other.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  // Left and shown again (the router keeps the page and its form): the
  // opening finds the copy changed; the form is not replaced, the teacher chooses.
  await leaveCopyAnyway(page);
  await page.goBack();
  const changed = page.getByRole("status").filter({ hasText: "Changed in another tab or window" });
  await expect(changed).toBeVisible();
  await expect(changed).toContainText("Your changes are still in the form");
  await expect(comment(page)).toHaveValue("From this tab.");
  expect(await sql(`SELECT general_comment FROM teacher_evaluations WHERE submission_id = $1`, [submissionId])).toEqual([
    { general_comment: "From the other tab." },
  ]);
  await page.screenshot({ path: "test-results/rev03-6-changed-while-away-desktop.png", fullPage: true });

  // Knowingly saved over: logged like any change, the other tab's save kept in the log.
  await changed.getByRole("button", { name: "Save mine over it" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(changed).toHaveCount(0);
  expect(
    await sql(
      `SELECT old_value, new_value FROM review_journal_entries WHERE submission_id = $1 AND field = 'general_comment' ORDER BY evaluation_revision`,
      [submissionId],
    ),
  ).toEqual([
    { old_value: "A clear and simple text.", new_value: "From the other tab." },
    { old_value: "From the other tab.", new_value: "From this tab." },
  ]);
});
