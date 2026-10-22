import { expect, test, type Page } from "@playwright/test";
import { sql } from "./support/helpers";
import { journalCount, seedReviewCopy } from "./support/review";

// REV-05, PUB-01, REV-03 R5 (E8.1), in a real browser: the teacher
// validates, publishes, changes a published copy (back To review), uses the
// shortcut, withdraws; each act is logged with its author and date, and the
// list shows the state. Rules, refusals and the shortcut's failure:
// tests/review-publication.int.test.ts.

test.setTimeout(180_000);

const events = async (submissionId: string) =>
  (
    await sql<{ event: string; nature: string | null; actor: boolean }>(
      `SELECT event, new_value->>'nature' AS nature, actor_id IS NOT NULL AS actor FROM review_journal_entries
       WHERE submission_id = $1 AND event NOT IN ('copy_opened', 'list_opened') ORDER BY created_at, id`,
      [submissionId],
    )
  ).map((e) => (e.nature ? `${e.event}:${e.nature}` : e.event));

const statusOf = async (submissionId: string) =>
  (await sql<{ status: string }>(`SELECT status FROM submissions WHERE id = $1`, [submissionId]))[0].status;

/** Opens the copy and waits for its opening to be logged: the page is hydrated (E7.9). */
async function openCopy(page: Page, url: string, assignmentId: string) {
  const before = await journalCount(assignmentId, "copy_opened");
  await page.goto(url);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBeGreaterThan(before);
}

/** Confirms the dialog of that title by its button. */
async function confirm(page: Page, title: string, button: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden();
}

test("REV-05, PUB-01: validate, publish, change back to review, validate and publish, withdraw; every act logged", async ({ page }) => {
  const { url, assignmentId, submissionId } = await seedReviewCopy(page);
  await openCopy(page, url, assignmentId);
  const bar = page.locator("form > div.sticky");
  const header = page.locator("header").filter({ has: page.getByRole("heading", { name: "Lena Bauer" }) });

  // PUB-01 CA1, on the screen: a copy To review offers no "Publish" of its own.
  await expect(bar.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Withdraw publication" })).toHaveCount(0);

  // REV-05 CA1: validated without changes; the student still sees nothing (R1).
  await bar.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(bar.getByRole("status")).toHaveText("Validated. The student sees nothing until you publish it.");
  await expect(header).toContainText("Validated");
  await expect(header).toContainText("Validated by Sarah Bennett");
  await expect(page.getByText("Validated, not published")).toBeVisible();
  expect(await events(submissionId)).toEqual(["evaluation_created", "validated:unchanged"]);
  await page.screenshot({ path: "test-results/rev05-1-validated-desktop.png", fullPage: true });

  // PUB-01: published after a confirmation.
  await bar.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page, "Publish this evaluation?", "Publish");
  await expect(header).toContainText("Published by Sarah Bennett");
  await expect(bar.getByRole("button", { name: "Withdraw publication" })).toBeVisible();
  expect(await statusOf(submissionId)).toBe("published");

  // REV-03 R5, Q8: a change of the published copy, confirmed, sends it back To review.
  await page.getByRole("textbox", { name: "General comment" }).fill("A clear text, with a lively ending.");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await confirm(page, "Save and send back to review?", "Save");
  await expect(page.getByText("Your change was saved. The copy is To review again")).toBeVisible();
  await expect(header).toContainText("To review");
  expect(await statusOf(submissionId)).toBe("to_review");

  // D6: the shortcut, confirmed: two acts, logged apart.
  await bar.getByRole("button", { name: "Validate and publish" }).click();
  await confirm(page, "Validate and publish this evaluation?", "Validate and publish");
  await expect(header).toContainText("Published by Sarah Bennett");

  // PUB-01 R2: withdrawn after a confirmation: Validated again.
  await bar.getByRole("button", { name: "Withdraw publication" }).click();
  await confirm(page, "Withdraw the publication?", "Withdraw");
  await expect(header).toContainText("Validated by Sarah Bennett");
  await expect(bar.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

  expect(await events(submissionId)).toEqual([
    "evaluation_created",
    "validated:unchanged",
    "published",
    "sent_back_to_review",
    "evaluation_changed",
    "validated:changed",
    "published",
    "unpublished",
  ]);
  expect((await sql<{ unsigned: string }>(`SELECT count(*) AS unsigned FROM review_journal_entries WHERE submission_id = $1 AND actor_id IS NULL`, [submissionId]))[0].unsigned).toBe("0");

  // REV-04 R3: the history says each act and its nature.
  const history = page.getByRole("region", { name: "History" });
  await expect(history).toContainText("Withdrew the publication");
  await expect(history).toContainText("Validated after changes");
  await expect(history).toContainText("Sent back to review by a change");
  await expect(history).toContainText("Validated without changes");

  // The list: the copy's state, and the counter of what is left to publish.
  await page.goto(`/teacher/assignments/${assignmentId}`);
  const table = page.getByRole("table", { name: "Submissions" });
  await expect(table.getByRole("row", { name: /Bauer/ })).toContainText("Validated");
  await expect(page.getByRole("button", { name: /^Validated\s*1$/ })).toBeVisible();
  await page.screenshot({ path: "test-results/pub01-1-list-validated-desktop.png", fullPage: true });
});
