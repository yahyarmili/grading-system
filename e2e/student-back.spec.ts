import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn, sql } from "./support/helpers";
import { seedTeacher } from "./support/review";

// PUB-01 CA3, PUB-02 R2 (E8.7, review M1): withdrawn while the student is
// away, the result is gone at the next access, back button included, however
// many pages the student went through: the router keeps a few pages hidden
// and may rebuild older ones from memory, without asking the server.

test.setTimeout(180_000);

const emailOf = async (userId: string) => (await sql<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]))[0].email;

async function signedInStudent(browser: Browser, userId: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, await emailOf(userId));
  await expect(page).toHaveURL(/\/student\//);
  return page;
}

/** One assignment, Lena's copy evaluated and published (15 / 20, fixed by the teacher). */
async function published(page: Page) {
  const seeder = await seedTeacher(page, ["A"]);
  try {
    const assignmentId = await seeder.assignment(["A"]);
    const lenaId = await seeder.student("Lena", "Bauer", ["A"]);
    const submissionId = await seeder.submit(assignmentId, lenaId, "received", { text: "My town is small but it is beatiful." });
    await seeder.evaluate(assignmentId, submissionId, [3, 3, 3, 2, 2], { teacherGrade: 15 });
    await sql(`UPDATE submissions SET status = 'published' WHERE id = $1`, [submissionId]);
    return { assignmentId, lenaId, submissionId };
  } finally {
    await seeder.close();
  }
}

const nav = (page: Page, name: string) => page.getByRole("navigation").getByRole("link", { name, exact: true }).first().click();

test("PUB-01 CA3: withdrawn, the result is gone after four pages and four steps back", async ({ page, browser }) => {
  const { assignmentId, lenaId, submissionId } = await published(page);
  const resultUrl = `/student/assignments/${assignmentId}/result`;

  const lena = await signedInStudent(browser, lenaId);
  await lena.goto(resultUrl);
  await expect(lena.getByText("15 / 20")).toBeVisible();

  // Four client navigations: the assignment, My assignments, Rubric, My classes.
  await lena.getByRole("link", { name: "My town", exact: true }).click();
  await expect(lena.getByRole("region", { name: "Your submission" })).toBeVisible();
  await nav(lena, "My assignments");
  await expect(lena.getByRole("heading", { name: "My assignments", level: 1 })).toBeVisible();
  await nav(lena, "Rubric");
  await expect(lena).toHaveURL(/\/student\/rubric/);
  await nav(lena, "My classes");
  await expect(lena).toHaveURL(/\/student\/classes$/);

  // The teacher withdraws (transition 10a); the student steps back four times.
  await sql(`UPDATE submissions SET status = 'validated' WHERE id = $1`, [submissionId]);
  await lena.waitForTimeout(1_200); // beyond FRESHNESS_GRACE_MS [P]
  for (const url of [/\/student\/rubric/, /\/student\/assignments$/, new RegExp(`/student/assignments/${assignmentId}$`)]) {
    await lena.goBack();
    await expect(lena).toHaveURL(url);
  }
  await lena.goBack();
  await expect(lena).toHaveURL(new RegExp(`${resultUrl}$`));
  // Either the withdrawn result or the not-found page settles; only the second may.
  await expect(lena.getByText(/15 \/ 20|could not be found/).first()).toBeVisible({ timeout: 15_000 });
  await lena.waitForTimeout(1_000);
  await expect(lena.getByText("15 / 20")).toHaveCount(0);
  await expect(lena.getByText("could not be found")).toBeVisible();
});

test("PUB-01 CA3: withdrawn, My assignments and the assignment no longer say Marked after back, router or browser", async ({ page, browser }) => {
  const { assignmentId, lenaId, submissionId } = await published(page);
  const lena = await signedInStudent(browser, lenaId);
  const marked = () => lena.getByRole("link", { name: "See your result" });

  // The router: My assignments, then the assignment, then Rubric; withdrawn; back twice.
  await lena.goto("/student/assignments");
  await expect(marked()).toBeVisible();
  await lena.getByRole("link", { name: "Open the assignment" }).click();
  await expect(lena.getByRole("region", { name: "Your submission" })).toBeVisible();
  await expect(marked()).toBeVisible();
  await nav(lena, "Rubric");
  await expect(lena).toHaveURL(/\/student\/rubric/);
  await sql(`UPDATE submissions SET status = 'validated' WHERE id = $1`, [submissionId]);
  await lena.waitForTimeout(1_200); // beyond FRESHNESS_GRACE_MS [P]
  await lena.goBack();
  await expect(lena).toHaveURL(new RegExp(`/student/assignments/${assignmentId}$`));
  await expect(lena.getByText("Submitted, being marked").first()).toBeVisible({ timeout: 15_000 });
  await expect(marked()).toHaveCount(0);
  await lena.goBack();
  await expect(lena).toHaveURL(/\/student\/assignments$/);
  await expect(lena.getByText("Submitted, being marked").first()).toBeVisible({ timeout: 15_000 });
  await expect(marked()).toHaveCount(0);

  // The browser: published again, My assignments loaded, another document, withdrawn, back.
  await sql(`UPDATE submissions SET status = 'published' WHERE id = $1`, [submissionId]);
  await lena.goto("/student/assignments");
  await expect(marked()).toBeVisible();
  await lena.goto("/student/rubric");
  await sql(`UPDATE submissions SET status = 'validated' WHERE id = $1`, [submissionId]);
  await lena.goBack();
  await expect(lena).toHaveURL(/\/student\/assignments$/);
  await expect(lena.getByText("Submitted, being marked").first()).toBeVisible({ timeout: 15_000 });
  await expect(marked()).toHaveCount(0);
});

test("PUB-01 CA3 (E8.7, M1): withdrawn, a result left before its page ran, shown again later, is checked", async ({ page, browser }) => {
  const { assignmentId, lenaId, submissionId } = await published(page);
  const resultUrl = `/student/assignments/${assignmentId}/result`;
  const lena = await signedInStudent(browser, lenaId);
  // The result as the server sent it, left at once: the router renders its page later, hidden, without effects.
  await lena.goto(resultUrl);
  await expect(lena.getByText("15 / 20")).toBeVisible();
  for (const n of [1, 2, 3]) {
    await lena.evaluate((url) => (window as unknown as { next: { router: { push(u: string): void } } }).next.router.push(url), `/student/assignments?visit=${n}`);
    await expect(lena).toHaveURL(new RegExp(`visit=${n}$`));
    await expect(lena.getByRole("heading", { name: "My assignments", level: 1 })).toBeVisible();
  }

  // Withdrawn; one jump back to the result, past the lists (none of them shown again): its first effect ever.
  await sql(`UPDATE submissions SET status = 'validated' WHERE id = $1`, [submissionId]);
  await lena.waitForTimeout(1_200); // beyond FRESHNESS_GRACE_MS [P]
  await lena.evaluate(() => history.go(-3));
  await expect(lena).toHaveURL(new RegExp(`${resultUrl}$`));
  await expect(lena.getByText(/15 \/ 20|could not be found/).first()).toBeVisible({ timeout: 15_000 });
  await lena.waitForTimeout(1_000);
  await expect(lena.getByText("15 / 20")).toHaveCount(0);
  await expect(lena.getByText("could not be found")).toBeVisible();
});
