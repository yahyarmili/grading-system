import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { beingMarked, studentInClass, teacherWithClass } from "./support/classes";
import { expectNotFound, sql } from "./support/helpers";

// E8.6: the first complete cycle, in the real runtime, every act on its
// screen. The teacher creates a class and an assignment; the student joins,
// reads the notice, submits; the copy reaches To review by itself
// (Workflows, simulator; Anthropic during a demonstration). The teacher opens
// the copy, changes a level, validates (the student still sees nothing),
// publishes; the student reads the result. The teacher withdraws it: the
// student sees nothing any more, the router's back button included. A second
// copy, failed, is evaluated by hand and published; its student reads it,
// without an AI mention. The failure is set in the database: the simulator's
// faults stay in the server's memory (as in e6-journey.spec.ts). Replayed on
// the preview by playwright.online.config.ts. Each piece in depth:
// review-publication, review-manual, student-result, student-leak.

// Workflows, two students, some eighty actions on Neon.
test.setTimeout(420_000);

const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park.";

test("E8 journey: class, assignment, submission, To review; a level changed, validated, published, read; withdrawn, gone after back; a failed copy evaluated by hand and published", async ({ browser }) => {
  // 1. The teacher's class and assignment, on their screens.
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

  // 2. The students join with the code; Lina reads the notice and submits; To review with no one acting.
  const lina = await studentInClass(browser, sarah.code);
  const omar = await studentInClass(browser, sarah.code, ["Omar", "Haddad"]);
  await lina.page.goto("/student/assignments");
  await lina.page.getByRole("listitem").filter({ hasText: "My town" }).getByRole("link", { name: "Write my text" }).click();
  await lina.page.getByRole("button", { name: "I have read this notice" }).click();
  await lina.page.getByRole("textbox", { name: /^Your text/ }).fill(TEXT);
  await lina.page.getByRole("button", { name: "Submit my text" }).click();
  await expect(beingMarked(lina.page)).toBeVisible();
  await expect.poll(() => statusOf(lina.email), { timeout: 90_000 }).toBe("to_review");
  const { assignmentId, linaId, omarId } = await idsOf(lina.email, omar.email);

  // Omar's copy: submitted, then failed at every attempt (set in the database, see above).
  await failedCopy(assignmentId, omarId, "My town is quiet. We have a park and a river, and my friends live near my house.");

  // 3. The teacher: the assignment, the notice, the list, the copy by its name.
  await teacher.goto("/teacher/assignments");
  await teacher.getByRole("row").filter({ hasText: "My town" }).getByRole("link", { name: "My town" }).click();
  const notice = teacher.getByRole("region", { name: /what the review log records/ });
  await notice.getByRole("button", { name: "I have read this notice" }).click();
  const list = teacher.getByRole("table", { name: "Submissions" });
  await expect(list.getByRole("row").filter({ hasText: "Amrani" })).toContainText("To review");
  await openByName(teacher, list, "Amrani", assignmentId);
  await expect(teacher.getByRole("heading", { name: /Lina Amrani/ })).toBeVisible();

  // 4. A level changed: the grade follows; validated, the student still sees nothing (REV-05 R1).
  const bar = teacher.locator("form > div.sticky");
  const header = teacher.locator("header").filter({ has: teacher.getByRole("heading", { name: "Lina Amrani" }) });
  const { level, grade } = await proposalOf(lina.email);
  const newLevel = level === 4 ? 3 : level + 1;
  const newGrade = grade - level + newLevel;
  await teacher.getByRole("region", { name: /^1/ }).getByRole("radio", { name: new RegExp(`^${newLevel} –`) }).check({ force: true });
  await expect(bar).toContainText(`Grade ${newGrade} / 20 · calculated`);
  await bar.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(bar.getByRole("status")).toHaveText("Validated. The student sees nothing until you publish it.");
  await expect(header).toContainText("Validated by Sarah Bennett");
  await lina.page.goto("/student/assignments");
  await expect(lina.page.getByText("Submitted, being marked").first()).toBeVisible();
  await expect(lina.page.getByRole("link", { name: "See your result" })).toHaveCount(0);

  // 5. Published after its confirmation.
  await bar.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(teacher, "Publish this evaluation?", "Publish");
  await expect(header).toContainText("Published by Sarah Bennett");
  await teacher.screenshot({ path: "test-results/e8-1-copy-published-desktop.png", fullPage: true });

  // 6. PUB-02: the student reads the result from My assignments, on a phone.
  const resultUrl = `/student/assignments/${assignmentId}/result`;
  await lina.page.goto("/student/assignments");
  const marked = lina.page.getByRole("region", { name: /Marked, result available \(1\)/ });
  await marked.getByRole("link", { name: "See your result" }).click();
  await expect(lina.page).toHaveURL(new RegExp(`${resultUrl}$`));
  const yourGrade = lina.page.getByRole("region", { name: "Your grade" });
  await expect(yourGrade).toContainText(`${newGrade} / 20`);
  await expect(yourGrade).toContainText("with the help of an AI tool");
  await expect(lina.page.getByRole("region", { name: /^1. Task Achievement/ })).toContainText(`Level ${newLevel}:`);
  const html = await lina.page.content();
  for (const hidden of ["AI proposal", "To re-read", "very_short", "Validated", "Published"]) expect(html, hidden).not.toContain(hidden);
  expect(await lina.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await lina.page.screenshot({ path: "test-results/e8-2-result-phone.png", fullPage: true });

  // 7. PUB-01 CA3: withdrawn while the student is on the assignment; back to the result kept by the router: checked, gone.
  await lina.page.getByRole("link", { name: "My town", exact: true }).click();
  await expect(lina.page.getByRole("region", { name: "Your submission" })).toContainText("beatiful");
  await bar.getByRole("button", { name: "Withdraw publication" }).click();
  await confirm(teacher, "Withdraw the publication?", "Withdraw");
  await expect(header).toContainText("Validated by Sarah Bennett");
  await lina.page.waitForTimeout(1_200); // FRESHNESS_GRACE_MS [P]
  await lina.page.goBack();
  await expect(lina.page.getByRole("heading", { name: "Your result" })).toHaveCount(0);
  await expect(lina.page.getByText(`${newGrade} / 20`)).toHaveCount(0);
  await lina.page.screenshot({ path: "test-results/e8-3-withdrawn-back-phone.png", fullPage: true });
  await expectNotFound(lina.page, resultUrl);
  await lina.page.goto("/student/assignments");
  await expect(lina.page.getByRole("link", { name: "See your result" })).toHaveCount(0);
  await expect(lina.page.getByText("Submitted, being marked").first()).toBeVisible();

  // 8. REV-06: the failed copy, evaluated by hand, then validated and published with the shortcut.
  await teacher.goto(`/teacher/assignments/${assignmentId}`);
  await expect(list.getByRole("row").filter({ hasText: "Haddad" })).toContainText("Evaluation failed");
  await openByName(teacher, list, "Haddad", assignmentId);
  await teacher.getByRole("link", { name: "Evaluate manually" }).click();
  await expect(teacher.getByText("Manual evaluation, without an AI proposal.")).toBeVisible();
  for (const [i, chosen] of [3, 3, 2, 2, 2].entries()) {
    await teacher.getByRole("region", { name: new RegExp(`^${i + 1}`) }).getByRole("radio", { name: new RegExp(`^${chosen} –`) }).check({ force: true });
  }
  await teacher.getByRole("textbox", { name: "General comment" }).fill("A calm, clear description.");
  await expect(bar).toContainText("Grade 12 / 20");
  await bar.getByRole("button", { name: "Validate and publish" }).click();
  await confirm(teacher, "Validate and publish this evaluation?", "Validate and publish");
  const omarHeader = teacher.locator("header").filter({ has: teacher.getByRole("heading", { name: "Omar Haddad" }) });
  await expect(omarHeader).toContainText("Published by Sarah Bennett");
  await expect(teacher.getByRole("region", { name: "History" })).toContainText("Entered manually, without AI proposal");

  // Omar reads it: marked by the teacher, no AI mention.
  await omar.page.goto(`/student/assignments/${assignmentId}/result`);
  const omarGrade = omar.page.getByRole("region", { name: "Your grade" });
  await expect(omarGrade).toContainText("12 / 20");
  await expect(omarGrade).toContainText("Marked and published by your teacher.");
  await expect(omarGrade).not.toContainText("AI tool");
  await expect(omar.page.getByRole("region", { name: "General comment" })).toContainText("A calm, clear description.");
  await omar.page.screenshot({ path: "test-results/e8-4-manual-result-phone.png", fullPage: true });

  // The log of the cycle, in order (one "evaluation_changed" per field changed: the level, the grade, "to re-read").
  expect(await eventsOf(linaId)).toEqual(["evaluation_created", "evaluation_changed", "validated:changed", "published", "unpublished"]);
  // By hand: born empty, then each field typed (as in review-manual.spec.ts).
  expect(await eventsOf(omarId)).toEqual(["manual_started", "evaluation_created", "evaluation_changed", "validated:manual", "published"]);
});

/** Confirms the dialog of that title by its button. */
async function confirm(page: Page, title: string, button: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden();
}

/** Clicks the student's name in the list and waits for the copy's opening to be logged: the page is hydrated (E7.9). */
async function openByName(page: Page, list: ReturnType<Page["getByRole"]>, lastName: string, assignmentId: string) {
  const before = await countOf(assignmentId, "copy_opened");
  await list.getByRole("row").filter({ hasText: lastName }).getByRole("link", { name: new RegExp(lastName) }).click();
  await expect.poll(() => countOf(assignmentId, "copy_opened"), { timeout: 30_000 }).toBeGreaterThan(before);
}

async function countOf(assignmentId: string, event: string) {
  const [row] = await sql<{ n: number }>(
    `SELECT count(*)::int AS n FROM review_journal_entries WHERE assignment_id = $1 AND event = $2`,
    [assignmentId, event],
  );
  return row.n;
}

async function statusOf(email: string) {
  const [row] = await sql<{ status: string }>(
    `SELECT s.status FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1`,
    [email],
  );
  return row?.status;
}

/** The assignment Lina submitted to, and both students' ids. */
async function idsOf(linaEmail: string, omarEmail: string) {
  const [row] = await sql<{ assignmentId: string; linaId: string; omarId: string }>(
    `SELECT s.assignment_id AS "assignmentId", s.student_id AS "linaId", (SELECT id FROM users WHERE email = $2) AS "omarId"
     FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1`,
    [linaEmail, omarEmail],
  );
  return row;
}

/** A submission of this text, Evaluation failed after three unavailable attempts, as the step would leave it. */
async function failedCopy(assignmentId: string, studentId: string, text: string) {
  const [{ id }] = await sql<{ id: string }>(
    `INSERT INTO submissions (assignment_id, teacher_id, student_id, status, late, content_version)
     SELECT id, teacher_id, $2, 'evaluation_failed', false, content_version FROM assignments WHERE id = $1 RETURNING id`,
    [assignmentId, studentId],
  );
  await sql(`INSERT INTO submission_versions (submission_id, number, mode, text, request_id) VALUES ($1, 1, 'text', $2, $3)`, [id, text, randomUUID()]);
  await sql(
    `INSERT INTO evaluation_runs (submission_id, version_number, outcome, provider, model_requested, prompt_version, rubric_version, attempts, attempt_errors, duration_ms)
     VALUES ($1, 1, 'failed', 'simulator', 'simulator', 'evaluation-2', 'en-1', 3, '{unavailable,unavailable,unavailable}'::evaluation_error[], 10)`,
    [id],
  );
}

/** The proposal in force: its first level and its grade. */
async function proposalOf(email: string) {
  const [row] = await sql<{ level: number; grade: number }>(
    `SELECT p.level_task AS level, p.proposed_grade::float8 AS grade FROM submissions s JOIN users u ON u.id = s.student_id
     JOIN ai_proposals p ON p.id = s.current_proposal_id WHERE u.email = $1`,
    [email],
  );
  return row;
}

/** The student's log, openings aside, with the validation's nature; entries repeated in a row said once. */
async function eventsOf(studentId: string) {
  return (
    await sql<{ event: string; nature: string | null }>(
      `SELECT j.event, j.new_value->>'nature' AS nature FROM review_journal_entries j JOIN submissions s ON s.id = j.submission_id
       WHERE s.student_id = $1 AND j.event NOT IN ('copy_opened', 'list_opened') ORDER BY j.created_at, j.id`,
      [studentId],
    )
  )
    .map((e) => (e.nature ? `${e.event}:${e.nature}` : e.event))
    .filter((event, i, all) => event !== all[i - 1]);
}
