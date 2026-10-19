import { expect, test, type Page } from "@playwright/test";
import { phone, teacherWithClass } from "./support/classes";
import { createStudent, signIn, sql } from "./support/helpers";

// E6.1, PRC-01 CA1 in the real runtime: Workflows (Local World) evaluates a
// submitted text without anyone acting, on the simulator; a replacement is
// evaluated again (SUB-05 CA2). The student keeps seeing "Submitted, being
// marked". The states are read in the test database (the teacher's screen: E7).

const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park.";
const NEW_TEXT =
  "My town has a river and an old bridge. On sunday we walk along the river with my grandparents, " +
  "and there is a small library where I borrow books every week.";

test("E6.1: a submitted text, then its replacement, reach to_review by themselves", async ({ browser }) => {
  const sarah = await teacherWithClass(browser, "C1");
  const teacher = sarah.page;
  await teacher.goto("/teacher/assignments/new");
  await teacher.getByLabel(/^Title/).fill("My town");
  await teacher.getByLabel(/^Subject/).fill("Describe your town.");
  await teacher.getByLabel(/^Level/).selectOption("B1");
  await teacher.getByRole("radio", { name: "English" }).check();
  await teacher.getByLabel(/^Deadline/).fill("2030-06-14T18:00");
  await teacher.getByRole("checkbox", { name: "C1" }).check();
  await teacher.getByRole("button", { name: "Create assignment" }).click();
  await expect(teacher.getByRole("link", { name: "Open the assignment" })).toBeVisible();

  const lina = await studentInClass(browser, sarah.code);
  await lina.page.goto("/student/assignments");
  await lina.page.getByRole("listitem").filter({ hasText: "My town" }).getByRole("link", { name: "Write my text" }).click();
  await lina.page.getByRole("button", { name: "I have read this notice" }).click();
  await lina.page.getByRole("textbox", { name: /^Your text/ }).fill(TEXT);
  await lina.page.getByRole("button", { name: "Submit my text" }).click();
  await expect(submittedCard(lina.page).getByText("Submitted, being marked")).toBeVisible();

  // No one acts: the workflow claims the version and records its proposal.
  await expect.poll(() => stateOf(lina.email), { timeout: 60_000 }).toEqual({ status: "to_review", version: 1, proposalVersion: 1 });
  await lina.page.reload();
  await expect(submittedCard(lina.page).getByText("Submitted, being marked")).toBeVisible();

  // The replacement is evaluated again; the current proposal is the new version's.
  const replaceSection = lina.page.getByRole("region", { name: "Replace my submission" });
  await replaceSection.getByRole("button", { name: "Replace my submission" }).click();
  await replaceSection.getByRole("textbox", { name: /^Your new text/ }).fill(NEW_TEXT);
  await replaceSection.getByRole("button", { name: "Submit the new text" }).click();
  await expect(replaceSection.getByText(/Your new text was submitted on /)).toBeVisible();
  await expect.poll(() => stateOf(lina.email), { timeout: 60_000 }).toEqual({ status: "to_review", version: 2, proposalVersion: 2 });
  expect(await runsOf(lina.email)).toEqual([{ version_number: 1 }, { version_number: 2 }]);
  await lina.page.reload();
  await expect(submittedCard(lina.page).getByText("Submitted, being marked")).toBeVisible();
  const html = await lina.page.content();
  for (const hidden of ["to_review", "To review", "beatiful"]) expect(html).not.toContain(hidden);
});

/** A student on a phone, signed in, who joined the class with its code. */
async function studentInClass(browser: Parameters<typeof teacherWithClass>[0], code: string) {
  const page = await (await browser.newContext(phone)).newPage();
  const email = await createStudent("Lina", "Amrani");
  await signIn(page, email);
  await expect(page).toHaveURL(/\/student\//);
  await page.goto("/student/classes");
  await page.getByLabel("Class code").fill(code);
  await page.getByRole("button", { name: "Join the class" }).click();
  await expect(page.getByText("You joined the class")).toBeVisible();
  return { page, email };
}

const submittedCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Text submitted" }) });

/** The student's submission as stored: its state, active version and the version of its current proposal. */
async function stateOf(email: string) {
  const [row] = await sql<{ status: string; version: number; proposalVersion: number | null }>(
    `SELECT s.status, s.current_version AS version, p.version_number AS "proposalVersion"
     FROM submissions s JOIN users u ON u.id = s.student_id
     LEFT JOIN ai_proposals p ON p.id = s.current_proposal_id WHERE u.email = $1`,
    [email],
  );
  return row;
}

const runsOf = (email: string) =>
  sql<{ version_number: number }>(
    `SELECT r.version_number FROM evaluation_runs r JOIN submissions s ON s.id = r.submission_id
     JOIN users u ON u.id = s.student_id WHERE u.email = $1 ORDER BY r.version_number`,
    [email],
  );
