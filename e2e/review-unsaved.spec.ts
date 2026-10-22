import { expect, test } from "@playwright/test";
import { sql } from "./support/helpers";
import { journalCount, leaveCopyAnyway, seedReviewCopy } from "./support/review";

// REV-03 CA4 (C1), in a real browser: changes typed and not saved are never
// lost without a word. A link of the page asks first, the mobile drawer's
// too, and only once (the browser's own question covers closing the tab:
// beforeunload); the router keeps the page left (<Activity>), and the copy
// shown again after a save never replaces what was typed; a page rendered
// fresh gets the changes back from the tab, and says so. Two tabs:
// review-conflict.spec.ts.

test.setTimeout(180_000);

const comment = (page: Parameters<typeof seedReviewCopy>[0]) => page.getByRole("textbox", { name: "General comment", exact: true });

test("C1: a link of the page asks before leaving changes not saved; staying keeps them", async ({ page }) => {
  const { url, assignmentId } = await seedReviewCopy(page);
  await page.goto(url);
  // Hydrated (the opening is logged from an effect): typing before would race React taking the form over.
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(1);
  const bar = page.locator("form > div.sticky");
  await comment(page).fill("Saved first.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  await comment(page).fill("Typed after the save.");
  await expect(bar.getByRole("status")).toHaveText("Unsaved changes");

  // The back link: the page asks; staying keeps the page and the typing.
  await page.getByRole("link", { name: "My town: submissions" }).click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "test-results/rev03-5-leave-unsaved-desktop.png" });
  await dialog.getByRole("button", { name: "Stay on this page" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${url}$`));
  await expect(comment(page)).toHaveValue("Typed after the save.");

  // The header's navigation too; Escape stays.
  await page.getByRole("link", { name: "Rubric" }).first().click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${url}$`));
  await expect(comment(page)).toHaveValue("Typed after the save.");
  expect(await sql(`SELECT general_comment FROM teacher_evaluations WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id = $1)`, [assignmentId])).toEqual([
    { general_comment: "Saved first." },
  ]);

  // Saved: nothing to ask, the link leaves at once.
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  await page.getByRole("link", { name: "My town: submissions" }).click();
  await expect(page.getByRole("table", { name: "Submissions" })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test("C1: saved, changed, left anyway, then back: what was typed is still there, not replaced in silence", async ({ page }) => {
  const { url, assignmentId } = await seedReviewCopy(page);
  await page.goto(url);
  // Hydrated (the opening is logged from an effect): typing before would race React taking the form over.
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(1);
  const bar = page.locator("form > div.sticky");
  await comment(page).fill("Saved first.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  await comment(page).fill("Typed after the save.");

  await leaveCopyAnyway(page);
  const opened = await journalCount(assignmentId, "copy_opened");

  // The browser's back button (not held: Next 16 offers no hook for it). The
  // router shows the page it kept, with its form as it was left.
  await page.goBack();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  // The copy shown again is an opening: logged, then compared with what the
  // page knows (its own save included). Nothing changed elsewhere: no refresh
  // replaces the typing, no conflict is announced.
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBeGreaterThan(opened);
  // What did not happen is checked after the time a refresh would have taken
  // (a client navigation: no load state to wait for).
  await page.waitForTimeout(3_000);
  await expect(comment(page)).toHaveValue("Typed after the save.");
  await expect(bar.getByRole("status")).toHaveText("Unsaved changes");
  await expect(page.getByRole("status").filter({ hasText: "Changed in another tab or window" })).toHaveCount(0);

  // Saved from there: it goes over the first save, as an ordinary change.
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  expect(
    await sql(
      `SELECT old_value, new_value FROM review_journal_entries WHERE assignment_id = $1 AND field = 'general_comment' ORDER BY evaluation_revision`,
      [assignmentId],
    ),
  ).toEqual([
    { old_value: "A clear and simple text.", new_value: "Saved first." },
    { old_value: "Saved first.", new_value: "Typed after the save." },
  ]);
});

test("C1, phone: a link of the drawer asks first; staying keeps the drawer and the typing, leaving closes it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { url, assignmentId } = await seedReviewCopy(page);
  await page.goto(url);
  // Hydrated (the opening is logged from an effect): typing before would race React taking the form over.
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(1);
  await comment(page).fill("Typed on a phone.");

  const menu = page.getByRole("dialog", { name: "Menu" });
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("link", { name: "Rubric" }).click();
  // Held before the drawer's own handler: the drawer stays open under the question.
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "test-results/rev03-5-leave-unsaved-mobile.png" });
  await dialog.getByRole("button", { name: "Stay on this page" }).click();
  await expect(dialog).toBeHidden();
  await expect(menu).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${url}$`));
  await menu.getByRole("button", { name: "Close menu" }).click();
  await expect(menu).toBeHidden();
  await expect(comment(page)).toHaveValue("Typed on a phone.");

  // Leaving clicks the link again: the drawer closes and the app navigates.
  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("link", { name: "Rubric" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(/\/teacher\/rubric$/);
  await expect(menu).toBeHidden();
  await expect(dialog).toBeHidden();
});

test("C1: leaving by a link that loads a whole page asks once, never the browser's question after", async ({ page }) => {
  const { url, assignmentId } = await seedReviewCopy(page);
  await page.goto(url);
  // Hydrated (the opening is logged from an effect): typing before would race React taking the form over.
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(1);
  await comment(page).fill("Typed, then left by a plain link.");

  // A link that is not Next's <Link>: followed, it unloads the page (beforeunload).
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/teacher/rubric";
    link.textContent = "Plain rubric link";
    link.style.cssText = "position:fixed;top:0;left:0;z-index:9999;background:white;padding:8px";
    document.body.append(link);
  });
  // Any question of the browser is noted, and answered "stay": a second question would keep the page.
  const asked: string[] = [];
  page.on("dialog", (d) => {
    asked.push(d.type());
    void d.dismiss();
  });
  await page.getByRole("link", { name: "Plain rubric link" }).click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(/\/teacher\/rubric$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Rubric", level: 1 })).toBeVisible();
  expect(asked).toEqual([]);
});

test("C1: a page rendered fresh gets back the changes not saved, and says so; saved or discarded, the tab keeps nothing", async ({ page }) => {
  const { url, assignmentId } = await seedReviewCopy(page);
  await page.goto(url);
  // Hydrated (the opening is logged from an effect): typing before would race React taking the form over.
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(1);
  const bar = page.locator("form > div.sticky");
  const restored = page.getByRole("status").filter({ hasText: "Unsaved changes restored" });
  const kept = () => page.evaluate(() => window.sessionStorage.length);
  // The browser's own question (beforeunload), if it asks: the teacher leaves.
  page.on("dialog", (d) => void d.accept());

  await comment(page).fill("Typed, then the page was left.");
  await expect(bar.getByRole("status")).toHaveText("Unsaved changes");
  // Another page, then the copy, each loaded whole: nothing of the router's
  // pages (<Activity>) is left, as for a page it evicted; only the tab's storage.
  await page.goto("/teacher/rubric");
  await page.goto(url);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(2);
  await expect(restored).toBeVisible();
  await expect(comment(page)).toHaveValue("Typed, then the page was left.");
  await expect(bar.getByRole("status")).toHaveText("Unsaved changes");
  await page.screenshot({ path: "test-results/rev03-5-unsaved-restored.png" });

  // Discarded: the form as saved (the proposal), nothing kept, nothing said.
  await restored.getByRole("button", { name: "Discard changes" }).click();
  await expect(comment(page)).toHaveValue("A clear and simple text.");
  await expect(restored).toHaveCount(0);
  await expect.poll(kept).toBe(0);

  // Typed again, the page reloaded: given back again; saved, the tab keeps nothing.
  await comment(page).fill("Typed again.");
  await expect.poll(kept).toBe(1);
  await page.reload();
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(3);
  await expect(restored).toBeVisible();
  await expect(comment(page)).toHaveValue("Typed again.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  await expect(restored).toHaveCount(0);
  await expect.poll(kept).toBe(0);
  await page.reload();
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(4);
  await expect(comment(page)).toHaveValue("Typed again.");
  await expect(bar.getByRole("status")).toHaveText("");
  await expect(restored).toHaveCount(0);
});

test("C1: changes typed over a revision saved since in another tab are given back with the choice, never dropped", async ({ page }) => {
  const { url, assignmentId, submissionId } = await seedReviewCopy(page);
  await page.goto(url);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(1);
  const changed = page.getByRole("status").filter({ hasText: "Changed in another tab or window" });
  page.on("dialog", (d) => void d.accept());

  // Typed here (on the proposal, revision 0), then the page left whole.
  await comment(page).fill("Typed in this tab.");
  await page.goto("/teacher/rubric");

  // Meanwhile another tab saves (revision 1).
  const other = await page.context().newPage();
  await other.goto(url);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(2);
  await comment(other).fill("From the other tab.");
  await other.getByRole("button", { name: "Save changes" }).click();
  await expect(other.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await other.close();

  // Back on the copy, rendered fresh: the typing is given back, and the teacher chooses.
  await page.goto(url);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBe(3);
  await expect(changed).toBeVisible();
  await expect(comment(page)).toHaveValue("Typed in this tab.");
  expect(await sql(`SELECT general_comment FROM teacher_evaluations WHERE submission_id = $1`, [submissionId])).toEqual([
    { general_comment: "From the other tab." },
  ]);

  // Knowingly saved over: logged after the other tab's save.
  await changed.getByRole("button", { name: "Save mine over it" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  expect(
    await sql(
      `SELECT old_value, new_value FROM review_journal_entries WHERE submission_id = $1 AND field = 'general_comment' ORDER BY evaluation_revision`,
      [submissionId],
    ),
  ).toEqual([
    { old_value: "A clear and simple text.", new_value: "From the other tab." },
    { old_value: "From the other tab.", new_value: "Typed in this tab." },
  ]);
});
