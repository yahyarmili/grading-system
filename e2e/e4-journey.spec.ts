import { expect, test, type Page } from "@playwright/test";
import { phone, rosterSection, teacherWithClass } from "./support/classes";
import { createStudent, signIn, sql } from "./support/helpers";

// E4 (fonctionnalites.md §8.3): the journey of the step. A submission before
// the deadline with a double click, one after it, a replacement with a double
// click; the teacher's assignment locked by a real submission (ASG-03 CA2);
// the removed student's assignment read only (SUB-01 CA3, CLS-04 CA3); no
// earlier text or internal state in the student's pages (SUB-01 R2, R3). The detailed
// tests are in submit-text.spec.ts and the integration tests.

// About fifty actions of 2 to 6 s each on Neon: past the default 120 s near its
// end (seen 2026-10-20, no step stuck in the trace).
test.setTimeout(240_000);

const LINA_TEXT ="My town is smal but it have a big market.\nI like it vey much.";
const LINA_NEW_TEXT = "My town is small, and it has a big market.\nI like it very much.";

test("E4 journey: on time, late, replaced, then read only; the assignment locked", async ({ browser }) => {
  const sarah = await teacherWithClass(browser, "C1");
  const teacher = sarah.page;
  const { page: lina, email: linaEmail } = await studentInClass(browser, "Lina", "Amrani", sarah.code);
  const { page: omar, email: omarEmail } = await studentInClass(browser, "Omar", "Idrissi", sarah.code);

  // The teacher creates the assignment and opens Delete, then waits.
  await teacher.goto("/teacher/assignments/new");
  await teacher.getByLabel(/^Title/).fill("My town");
  await teacher.getByLabel(/^Subject/).fill("Describe your town.");
  await teacher.getByLabel(/^Level/).selectOption("B1");
  await teacher.getByRole("radio", { name: "English" }).check();
  await teacher.getByLabel(/^Deadline/).fill("2030-06-14T18:00");
  await teacher.getByRole("checkbox", { name: "C1" }).check();
  await teacher.getByRole("button", { name: "Create assignment" }).click();
  await teacher.getByRole("link", { name: "Open the assignment" }).click();
  await expect(teacher.getByRole("heading", { name: "My town", level: 1 })).toBeVisible();
  const assignmentId = new URL(teacher.url()).pathname.split("/").pop();
  await teacher.getByRole("button", { name: "Delete" }).filter({ visible: true }).click();
  const confirmDelete = teacher.getByRole("dialog", { name: "Delete “My town”?" });
  await expect(confirmDelete).toBeVisible();

  // 1. Lina submits before the deadline, with a double click: one submission, not late.
  await openAssignment(lina, "My town");
  await lina.getByRole("button", { name: "I have read this notice" }).click();
  await lina.getByRole("textbox", { name: /^Your text/ }).fill(LINA_TEXT);
  await lina.getByRole("button", { name: "Submit my text" }).dblclick();
  const linaSubmitted = submittedCard(lina);
  await expect(linaSubmitted.getByText("Submitted, being marked")).toBeVisible();
  await expect(linaSubmitted.getByText("Late", { exact: true })).toHaveCount(0);
  expect(await submissionOf(linaEmail)).toEqual([{ late: false, versions: 1 }]);
  await lina.waitForLoadState("networkidle");
  await lina.screenshot({ path: "test-results/e4-1-on-time-phone.png", fullPage: true });

  // ASG-03 CA2: the deletion confirmed after the submission is refused; the task is locked.
  await confirmDelete.getByRole("button", { name: "Delete" }).click();
  await expect(teacher.getByText("An assignment with submissions can't be deleted. Nothing was deleted.")).toBeVisible();
  // Without reloading, the page shows the lock and no longer offers Delete.
  await expect(teacher.getByText("Locked by submissions").filter({ visible: true })).toBeVisible();
  await expect(teacher.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(teacher.getByText("An assignment with submissions can't be deleted. Nothing was deleted.")).toBeVisible();
  await teacher.waitForLoadState("networkidle");
  await teacher.screenshot({ path: "test-results/e4-2-delete-refused-desktop.png", fullPage: true });
  await teacher.getByRole("link", { name: "Edit" }).filter({ visible: true }).click();
  await expect(teacher.getByRole("heading", { name: "Edit assignment", level: 1 })).toBeVisible();
  await expect(teacher.getByLabel(/^Subject/)).toHaveCount(0);
  await expect(teacher.getByLabel(/^Deadline/)).toHaveCount(0);

  // 2. The deadline passes, as time will make it; Omar submits after it: late.
  await sql("UPDATE assignments SET deadline = now() - interval '1 minute' WHERE id = $1", [assignmentId]);
  await openAssignment(omar, "My town");
  await omar.getByRole("button", { name: "I have read this notice" }).click();
  await omar.getByRole("textbox", { name: /^Your text/ }).fill("My town is old and beautiful.");
  await omar.getByRole("button", { name: "Submit my text" }).click();
  await expect(submittedCard(omar).getByText("Late", { exact: true })).toBeVisible();
  expect(await submissionOf(omarEmail)).toEqual([{ late: true, versions: 1 }]);
  await omar.screenshot({ path: "test-results/e4-3-late-phone.png", fullPage: true });

  // 3. Lina replaces her text after the deadline, with a double click: one
  // replacement, still not late (SUB-04 CA2).
  await lina.reload();
  const replaceSection = lina.getByRole("region", { name: "Replace my submission" });
  await expect(replaceSection.getByText(/replace your text 2 more times/)).toBeVisible();
  await replaceSection.getByRole("button", { name: "Replace my submission" }).click();
  await replaceSection.getByRole("textbox", { name: /^Your new text/ }).fill(LINA_NEW_TEXT);
  await replaceSection.getByRole("button", { name: "Submit the new text" }).dblclick();
  await expect(replaceSection.getByText(/Your new text was submitted on /)).toBeVisible();
  await expect(replaceSection.getByText(/replace your text once more/)).toBeVisible();
  await expect(submittedCard(lina).getByText(/Last replaced on /)).toBeVisible();
  await expect(submittedCard(lina).getByText("Late", { exact: true })).toHaveCount(0);
  expect(await submissionOf(linaEmail)).toEqual([{ late: false, versions: 2 }]);
  await lina.waitForLoadState("networkidle");
  await lina.screenshot({ path: "test-results/e4-4-replaced-phone.png", fullPage: true });

  // 4. The teacher removes Omar: his assignment stays, read only (SUB-01 CA3, CLS-04 CA3).
  await teacher.goto(sarah.url);
  const roster = rosterSection(teacher);
  await roster.getByRole("button", { name: "Remove Omar Idrissi" }).filter({ visible: true }).click();
  await teacher.getByRole("dialog", { name: "Remove Omar Idrissi from the class?" })
    .getByRole("button", { name: "Remove", exact: true }).click();
  await expect(roster.getByText(/Student removed/)).toBeVisible();

  await omar.goto("/student/assignments");
  const card = omar.getByRole("listitem").filter({ hasText: "My town" });
  await expect(card.getByText("Submitted, being marked")).toBeVisible();
  await expect(card.getByText("Late", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "Open the assignment" }).click();
  await expect(submittedCard(omar).getByText("Submitted, being marked")).toBeVisible();
  const omarReplace = omar.getByRole("region", { name: "Replace my submission" });
  await expect(omarReplace.getByText("This submission can no longer be replaced.")).toBeVisible();
  await expect(omarReplace.getByRole("button", { name: "Replace my submission" })).toHaveCount(0);
  await expect(omar.getByRole("textbox")).toHaveCount(0);
  expect(await submissionOf(omarEmail)).toEqual([{ late: true, versions: 1 }]);
  await omar.waitForLoadState("networkidle");
  await omar.screenshot({ path: "test-results/e4-5-removed-read-only-phone.png", fullPage: true });

  // 5. No earlier text and no internal state reach the student, whatever the state (SUB-01 R2, R3).
  // Since E6 her replacement is evaluated by itself: wait for it, then set each state by hand.
  await expect
    .poll(async () => (await sql<{ status: string }>(
      "SELECT s.status FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1", [linaEmail],
    ))[0].status, { timeout: 60_000 })
    .toBe("to_review");
  for (const status of ["evaluation_failed", "not_assessable", "to_review"]) {
    await sql(
      // Not assessable carries its cause, and no other state one; a proposal is current
      // in to_review only (check constraints, E5.5).
      `UPDATE submissions SET status = $1::submission_status,
         not_assessable_cause = CASE WHEN $1::submission_status = 'not_assessable' THEN 'no_content'::not_assessable_cause END,
         current_proposal_id = CASE WHEN $1::submission_status = 'to_review' THEN current_proposal_id END
       FROM users u WHERE u.id = submissions.student_id AND u.email = $2`,
      [status, linaEmail],
    );
    for (const path of ["/student/assignments", new URL(lina.url()).pathname]) {
      await lina.goto(path);
      await expect(lina.getByText("Submitted, being marked").first()).toBeVisible();
      const html = await lina.content();
      // Her active text is read back on the assignment (SUB-01 R2, E8.3); the first one, replaced, never.
      for (const hidden of [status, "Evaluation failed", "Not assessable", "To review", "smal but"]) {
        expect(html, `${hidden} on ${path}`).not.toContain(hidden);
      }
    }
  }
  await lina.screenshot({ path: "test-results/e4-6-to-review-seen-as-being-marked-phone.png", fullPage: true });
});

/** A student on a phone, signed in, who joined the class with its code. */
async function studentInClass(browser: Parameters<typeof teacherWithClass>[0], first: string, last: string, code: string) {
  const page = await (await browser.newContext(phone)).newPage();
  const email = await createStudent(first, last);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/student\//);
  await page.goto("/student/classes");
  await page.getByLabel("Class code").fill(code);
  await page.getByRole("button", { name: "Join the class" }).click();
  await expect(page.getByText("You joined the class")).toBeVisible();
  return { page, email };
}

async function openAssignment(page: Page, title: string) {
  await page.goto("/student/assignments");
  await page.getByRole("listitem").filter({ hasText: title }).getByRole("link", { name: "Write my text" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

const submittedCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Text submitted" }) });

/** The student's submission as stored: its late mark and how many versions. */
const submissionOf = (email: string) =>
  sql<{ late: boolean; versions: number }>(
    `SELECT s.late, (SELECT count(*)::int FROM submission_versions v WHERE v.submission_id = s.id) AS versions
     FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1`,
    [email],
  );
