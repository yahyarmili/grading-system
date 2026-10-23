import { expect, test, type Browser } from "@playwright/test";
import { phone } from "./support/classes";
import { expectNotFound, signIn, sql } from "./support/helpers";
import { seedTeacher } from "./support/review";

// PUB-02 (E8.3), on a phone: the student opens their published result from
// My assignments: the grade as set and "adjusted" (Q5), each criterion's
// level with its label and the teacher's remark, the comment, the next steps,
// the rubric; the AI mentioned (Q5), no alert (EVL-04 CA3). Student B gets a
// real 404 on A's result (CA3). Withdrawn, the result is gone at the next
// access, back button included (PUB-01 CA3). The teacher's version only
// (CA3), field by field: tests/student-result.int.test.ts.

test.setTimeout(180_000);

const emailOf = async (userId: string) => (await sql<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]))[0].email;

async function studentOnPhone(browser: Browser, userId: string) {
  const page = await (await browser.newContext(phone)).newPage();
  await signIn(page, await emailOf(userId));
  await expect(page).toHaveURL(/\/student\//);
  return page;
}

test("PUB-02 CA1, CA3, EVL-04 CA3: the student reads their published result; B gets 404; withdrawn, gone after back", async ({ page, browser }) => {
  const seeder = await seedTeacher(page, ["A"]);
  let assignmentId: string, lenaId: string, omarId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    lenaId = await seeder.student("Lena", "Bauer", ["A"]);
    omarId = await seeder.student("Omar", "Haddad", ["A"]);
    submissionId = await seeder.submit(assignmentId, lenaId, "received", { text: "My town is small but it is beatiful.\n\nThere is a market every friday." });
    // Levels 3 3 3 2 2 (13), the grade fixed at 15 by the teacher; the proposal carries the "very short" alert.
    await seeder.evaluate(assignmentId, submissionId, [3, 3, 3, 2, 2], { teacherGrade: 15 });
  } finally {
    await seeder.close();
  }
  await sql(`UPDATE submissions SET status = 'published' WHERE id = $1`, [submissionId]);
  const resultUrl = `/student/assignments/${assignmentId}/result`;

  // From My assignments, in the "Marked, result available" group.
  const lena = await studentOnPhone(browser, lenaId);
  await lena.goto("/student/assignments");
  const group = lena.getByRole("region", { name: /Marked, result available \(1\)/ });
  await expect(group).toBeVisible();
  await group.getByRole("link", { name: "See your result" }).click();
  await expect(lena).toHaveURL(new RegExp(`${resultUrl}$`));

  await expect(lena.getByRole("heading", { name: "Your result", level: 1 })).toBeVisible();
  const grade = lena.getByRole("region", { name: "Your grade" });
  await expect(grade).toContainText("15 / 20");
  await expect(grade).toContainText("Marked, result available");
  await expect(grade).toContainText("Grade adjusted by your teacher");
  await expect(grade).toContainText("with the help of an AI tool");
  const task = lena.getByRole("region", { name: /^1. Task Achievement/ });
  await expect(task).toContainText("Good");
  await expect(task).toContainText("Answers the task.");
  await expect(lena.getByRole("region", { name: /^5. Mechanics/ })).toContainText("Developing");
  await expect(lena.getByRole("region", { name: "General comment" })).toContainText("A clear and simple text.");
  await expect(lena.getByRole("region", { name: "Next steps" })).toContainText("Check the spelling.");
  await expect(lena.getByRole("link", { name: "See the rubric" })).toHaveAttribute("href", "/student/rubric?version=en-1");
  // EVL-04 CA3: no alert, and nothing of the proposal or the review.
  const html = await lena.content();
  for (const hidden of ["very_short", "Very short", "AI proposal", "To re-read", "Validated", "Published"]) expect(html, hidden).not.toContain(hidden);
  // Nothing scrolls sideways on a phone.
  expect(await lena.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await lena.screenshot({ path: "test-results/pub02-1-result-phone.png", fullPage: true });

  // CA3: student B, same class, opens A's result: a real 404.
  const omar = await studentOnPhone(browser, omarId);
  await expectNotFound(omar, resultUrl);

  // The assignment: the text as sent (SUB-01 R2), the link to the result.
  await lena.getByRole("link", { name: "My town", exact: true }).click();
  await expect(lena.getByRole("region", { name: "Your submission" })).toContainText("beatiful");
  await expect(lena.getByRole("link", { name: "See your result" })).toBeVisible();
  await lena.screenshot({ path: "test-results/pub02-2-assignment-phone.png", fullPage: true });

  // PUB-01 CA3: withdrawn while the student is away; back to the result kept by the router: checked, then 404.
  await sql(`UPDATE submissions SET status = 'validated' WHERE id = $1`, [submissionId]);
  await lena.waitForTimeout(1_200); // FRESHNESS_GRACE_MS [P]
  await lena.goBack();
  await expect(lena.getByRole("heading", { name: "Your result" })).toHaveCount(0);
  await expect(lena.getByText("15 / 20")).toHaveCount(0);
  await expectNotFound(lena, resultUrl);
  await lena.goto("/student/assignments");
  await expect(lena.getByRole("link", { name: "See your result" })).toHaveCount(0);
  await expect(lena.getByText("Submitted, being marked").first()).toBeVisible();
});
