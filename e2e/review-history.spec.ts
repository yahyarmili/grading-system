import { expect, test } from "@playwright/test";
import { phone } from "./support/classes";
import { sql } from "./support/helpers";
import { seedTeacher } from "./support/review";

// NFR-DON-04, REV-04 R3 (E7.7), in a real browser: a new teacher reads their
// notice once, in place of the submissions, then sees them; the copy's
// History lists its opening and each change, newest first, read only. The
// guard and the access by direct request: tests/review-notice.int.test.ts.

test.setTimeout(180_000);

const TEXT = "My town is small but it is beatiful.\n\nThere is a market every friday and the peoples are friendly.";

test("DON-04: the teacher notice first, read once; then the submissions", async ({ page }) => {
  const seeder = await seedTeacher(page, ["A"], ["Sarah", "Bennett"], { noticeRead: false });
  let assignmentId: string, studentId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    const submissionId = await seeder.submit(assignmentId, studentId, "received", { text: TEXT });
    await seeder.evaluate(assignmentId, submissionId, [3, 2, 2, 2, 1]);
  } finally {
    await seeder.close();
  }
  // The copy, asked directly: the notice, not the copy.
  await page.goto(`/teacher/assignments/${assignmentId}/students/${studentId}`);
  await expect(page.getByRole("heading", { name: /what the review log records/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Lena");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);

  await page.goto(`/teacher/assignments/${assignmentId}`);
  const notice = page.getByRole("region", { name: /what the review log records/ });
  await expect(notice).toContainText("Your review time");
  await expect(notice).toContainText("does not tell whether you agreed because the AI was right");
  await expect(page.getByRole("table", { name: "Submissions" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/don04-1-teacher-notice-desktop.png", fullPage: true });

  await notice.getByRole("button", { name: "I have read this notice" }).click();
  await expect(page.getByRole("table", { name: "Submissions" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Submissions" })).toContainText("Bauer");
  expect(await sql(`SELECT notice, version FROM notice_acknowledgements n JOIN users u ON u.id = n.user_id WHERE u.role = 'teacher' AND u.first_name = 'Sarah' AND n.user_id IN (SELECT teacher_id FROM assignments WHERE id = $1)`, [assignmentId])).toEqual([
    { notice: "teacher_review", version: 2 },
  ]);

  // Once: the notice is not shown again.
  await page.reload();
  await expect(page.getByRole("table", { name: "Submissions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "I have read this notice" })).toHaveCount(0);
});

test("REV-04 R3: the copy's History, newest first, with author, date, old and new values; nothing to change", async ({ page, browser }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, studentId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    const submissionId = await seeder.submit(assignmentId, studentId, "received", { text: TEXT });
    await seeder.evaluate(assignmentId, submissionId, [3, 2, 2, 2, 1]);
  } finally {
    await seeder.close();
  }
  const url = `/teacher/assignments/${assignmentId}/students/${studentId}`;
  await page.goto(url);
  const history = page.getByRole("region", { name: "History" });
  // Its own opening is logged once shown: the next showing lists it.
  await expect(history).toBeVisible();

  await page.getByRole("region", { name: /^1/ }).getByRole("radio", { name: /^4 –/ }).check({ force: true });
  await page.getByRole("textbox", { name: "General comment", exact: true }).fill("Good work.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("form > div.sticky").getByRole("status")).toHaveText("Saved");

  // C6: the save renders the page again, its History with it: no reload.
  const items = history.getByRole("listitem");
  await expect(items.first()).toContainText("Started their evaluation from the AI proposal");
  await expect(items.first()).toContainText("Sarah Bennett");
  await expect(items.first()).toContainText("Casablanca time");
  const changes = items.first().getByRole("table", { name: /Changes/ });
  await expect(changes.getByRole("row", { name: /Task Achievement \/ Content: level/ })).toContainText("3 – Good");
  await expect(changes.getByRole("row", { name: /Task Achievement \/ Content: level/ })).toContainText("4 – Excellent");
  await expect(changes.getByRole("row", { name: /General comment/ })).toContainText("A clear and simple text.");
  await expect(changes.getByRole("row", { name: /General comment/ })).toContainText("Good work.");
  await expect(changes.getByRole("row", { name: /Final grade/ })).toContainText("10 / 20");
  await expect(items.last()).toContainText("Opened the copy");
  // Read only: no action in the History.
  await expect(history.getByRole("button")).toHaveCount(0);
  // The AI proposal stays readable beside the evaluation.
  await expect(page.getByRole("region", { name: /^1/ })).toContainText("Level 3");
  await history.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/rev04-1-history-desktop.png", fullPage: true });

  const narrow = await (await browser.newContext({ ...phone, storageState: await page.context().storageState() })).newPage();
  await narrow.goto(url);
  await expect(narrow.getByRole("region", { name: "History" })).toBeVisible();
  expect(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await narrow.getByRole("region", { name: "History" }).scrollIntoViewIfNeeded();
  await narrow.screenshot({ path: "test-results/rev04-2-history-phone.png", fullPage: true });
});
