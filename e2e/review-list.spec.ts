import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { phone } from "./support/classes";
import { createTeacher, expectNotFound, signIn } from "./support/helpers";
import { journalCount, seedTeacher } from "./support/review";

// REV-01 (E7.2), in a real browser: the list of an assignment's submissions, opened from the
// assignments list (ASG-02 CA2), sorted and filtered on the whole list, its
// state kept in the URL. The rules: src/lib/review-list.test.ts and
// tests/review-list.int.test.ts. States, proposals and the teacher's grade
// are written in the test database: their journeys are E6's and E7.4's.

test.setTimeout(180_000);

/**
 * Classes A and B; seven students: Bauer (A and B, late, graded 15.5 by the
 * teacher), d'Aubigné (proposal 12), Émile (not assessable), Eric (received),
 * Martin (not submitted), Okafor (removed from A, evaluation failed), Silva
 * (removed from A, nothing submitted: absent).
 */
async function seed(page: Page) {
  const seeder = await seedTeacher(page, ["A", "B"]);
  try {
    const assignmentId = await seeder.assignment(["A", "B"]);
    const submit = async (first: string, last: string, classNames: string[], status: string, options = {}) =>
      seeder.submit(assignmentId, await seeder.student(first, last, classNames), status, options);
    await seeder.evaluate(assignmentId, await submit("Lena", "Bauer", ["A", "B"], "received", { late: true }), [3, 3, 3, 3, 3], { teacherGrade: 15.5 });
    await seeder.evaluate(assignmentId, await submit("Agrippa", "d'Aubigné", ["A"], "received"), [3, 3, 2, 2, 2]);
    await submit("Zoé", "Émile", ["A"], "not_assessable", { cause: "ai_unavailable" });
    await submit("Paul", "Eric", ["B"], "received");
    await seeder.student("Tom", "Martin", ["A"]);
    await seeder.submit(assignmentId, await seeder.student("Ada", "Okafor", ["A"], true), "evaluation_failed");
    await seeder.student("Rui", "Silva", ["A"], true);
    return { assignmentId };
  } finally {
    await seeder.close();
  }
}

const listOpened = (assignmentId: string) => journalCount(assignmentId, "list_opened");

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
