import { expect, test, type Page } from "@playwright/test";
import { beingMarked, studentInClass, teacherWithClass } from "./support/classes";
import { E2E_ONLINE_URL } from "./support/env";
import { sql } from "./support/helpers";

// E7 (fonctionnalites.md §8): the journey of the step, in the real runtime,
// every act on its screen. A text reaches To review by itself (Workflows,
// simulator); the teacher opens the assignment, reads their notice, opens
// the list, clicks the name. The student replaces the text while the copy is
// open: the teacher's save is refused, the copy reloaded. Then a level
// changed, then the grade alone; the History shows both. The replacement is
// tried again: refused, the teacher has started (SUB-05 CA3). Two tabs: a
// conflict, the typing kept. The student sees "Submitted, being marked" and
// nothing of the review. The order differs from the prompt's on one point:
// a replacement after the teacher's first change is refused (SUB-05 R3), so
// it comes before. A prefetch logs nothing: checked for real on the preview,
// where links prefetch (playwright.online.config.ts). Each piece in depth:
// e2e/review-*.spec.ts.

// Two evaluations to wait for and some sixty actions on Neon.
test.setTimeout(300_000);

const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park.";
const NEW_TEXT =
  "My town has a river and an old bridge. On sunday we walk along the river with my grandparents, " +
  "and there is a small library where I borrow books every week.";

test("E7 journey: To review by itself; list, copy, a level then the grade, History; replaced while open; two tabs; the student sees being marked", async ({ browser }) => {
  // 1. A teacher's assignment, a student's text, To review with no one acting.
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
  await expect(beingMarked(lina.page)).toBeVisible();
  await expect.poll(() => stateOf(lina.email), { timeout: 60_000 }).toEqual({ status: "to_review", version: 1 });

  // The router's prefetches, by path: production prefetches the links in view, next dev none.
  const prefetched: string[] = [];
  teacher.on("request", (r) => {
    const h = r.headers();
    if (h["next-router-prefetch"] || h["next-router-segment-prefetch"]) prefetched.push(new URL(r.url()).pathname);
  });

  // 2. ASG-02 CA2: the assignment opens its list, after the teacher notice (DON-04).
  await teacher.goto("/teacher/assignments");
  const line = teacher.getByRole("row").filter({ hasText: "My town" });
  await expect(line.getByRole("cell").nth(6)).toHaveText("1");
  // A prefetch logs nothing (E7 plan §1.6): the assignment's link is prefetched in production (the preview), not by next dev.
  await teacher.waitForTimeout(3_000);
  expect(await logged(lina.email, "list_opened")).toBe(0);
  if (E2E_ONLINE_URL) expect(prefetched.filter((p) => /^\/teacher\/assignments\/[0-9a-f-]+$/.test(p)).length).toBeGreaterThan(0);
  await line.getByRole("link", { name: "My town" }).click();
  const notice = teacher.getByRole("region", { name: /what the review log records/ });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "I have read this notice" }).click();
  const list = teacher.getByRole("table", { name: "Submissions" });
  const row = list.getByRole("row").filter({ hasText: "Amrani" });
  await expect(row).toContainText("To review");
  await expect(row).toContainText(/provisional/i);
  await expect.poll(() => logged(lina.email, "list_opened")).toBe(1);
  // The names are never prefetched; no copy is logged before its click.
  await teacher.waitForTimeout(3_000);
  expect(await logged(lina.email, "copy_opened")).toBe(0);
  await teacher.screenshot({ path: "test-results/e7-1-list-desktop.png", fullPage: true });

  // 3. REV-02: a click on the name opens the copy, the identity and the text beside the proposal.
  await row.getByRole("link", { name: /Amrani/ }).click();
  await expect(teacher.getByRole("heading", { name: /Lina Amrani/ })).toBeVisible();
  await expect(teacher.getByText(lina.email)).toBeVisible();
  await expect(teacher.getByRole("region", { name: "Student text" })).toContainText("beatiful");
  const copyUrl = teacher.url();
  await expect.poll(() => logged(lina.email, "copy_opened")).toBe(1);

  // 4. REV-03 CA3, SUB-05: the student replaces the text while the copy is open: the save is refused, the copy reloaded.
  const firstLevel = await proposedTaskLevel(lina.email);
  await taskRegion(teacher).getByRole("radio", { name: new RegExp(`^${otherLevel(firstLevel)} –`) }).check({ force: true });
  await replace(lina.page, NEW_TEXT);
  await expect(lina.page.getByRole("region", { name: "Replace my submission" }).getByText(/Your new text was submitted on /)).toBeVisible();
  await teacher.getByRole("button", { name: "Save changes" }).click();
  await expect(teacher.getByText("This submission was replaced. The page has been reloaded. Nothing was saved.")).toBeVisible();
  await expect(teacher.getByRole("region", { name: "Student text" })).toContainText("river");
  expect(await sql(`SELECT 1 FROM teacher_evaluations t JOIN submissions s ON s.id = t.submission_id JOIN users u ON u.id = s.student_id WHERE u.email = $1`, [lina.email])).toEqual([]);
  await expect.poll(() => stateOf(lina.email), { timeout: 60_000 }).toEqual({ status: "to_review", version: 2 });

  // 5. REV-03 CA1: a level changed: the grade follows, "To re-read" on its remark.
  await teacher.reload();
  const bar = teacher.locator("form > div.sticky");
  const { level, grade } = await proposalOf(lina.email);
  await expect(bar).toContainText(`Grade ${grade} / 20 · calculated`);
  const newLevel = otherLevel(level);
  const newGrade = grade - level + newLevel;
  await taskRegion(teacher).getByRole("radio", { name: new RegExp(`^${newLevel} –`) }).check({ force: true });
  await expect(taskRegion(teacher).getByText("To re-read")).toBeVisible();
  await expect(bar).toContainText(`Grade ${newGrade} / 20 · calculated`);

  // Meanwhile the student opens the replacement form again; the teacher's save comes first.
  await lina.page.reload();
  const replaceSection = lina.page.getByRole("region", { name: "Replace my submission" });
  await replaceSection.getByRole("button", { name: "Replace my submission" }).click();
  await replaceSection.getByRole("textbox", { name: /^Your new text/ }).fill(`${NEW_TEXT} And a third version.`);

  await teacher.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");

  // SUB-05 CA3: the student's replacement, sent after the change, is refused with its message.
  await replaceSection.getByRole("button", { name: "Submit the new text" }).click();
  await expect(replaceSection.getByText("Your teacher has started marking your submission: it can no longer be replaced.", { exact: false })).toBeVisible();
  await lina.page.reload();
  await expect(lina.page.getByText("This submission can no longer be replaced.")).toBeVisible();
  expect((await stateOf(lina.email)).version).toBe(2);

  // 6. REV-03 CA2: the grade alone, fixed; the gap said.
  const fixed = newGrade + 1.5;
  await teacher.getByLabel(/^Final grade/).fill(String(fixed));
  await expect(teacher.getByText("Final grade differs from the calculated grade")).toBeVisible();
  await teacher.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");

  // 7. REV-04: the History, newest first: the grade, then the level, then the openings.
  await teacher.reload();
  const items = teacher.getByRole("region", { name: "History" }).getByRole("listitem");
  await expect(items.nth(0)).toContainText("Changed the evaluation");
  await expect(items.nth(0).getByRole("row", { name: /Final grade/ })).toContainText(`${fixed} / 20`);
  await expect(items.nth(1)).toContainText("Started their evaluation from the AI proposal");
  await expect(items.nth(1).getByRole("row", { name: /Task Achievement \/ Content: level/ })).toContainText(`${newLevel} –`);
  await expect(items.last()).toContainText("Opened the copy");
  await teacher.getByRole("region", { name: "History" }).scrollIntoViewIfNeeded();
  await teacher.screenshot({ path: "test-results/e7-2-copy-history-desktop.png", fullPage: true });
  // The proposal itself unchanged.
  expect(await proposalOf(lina.email)).toEqual({ level, grade });

  // 8. REV-03 R5: two tabs: the second's save is a conflict; its typing kept; the saved version loaded on demand.
  const second = await teacher.context().newPage();
  await second.goto(copyUrl);
  const comment = (p: Page) => p.getByRole("textbox", { name: "General comment", exact: true });
  await comment(teacher).fill("From the first tab.");
  await teacher.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("status")).toHaveText("Saved");
  await comment(second).fill("From the second tab.");
  await second.getByRole("button", { name: "Save changes" }).click();
  const conflict = second.getByRole("status").filter({ hasText: "Changed in another tab or window" });
  await expect(conflict).toBeVisible();
  await expect(comment(second)).toHaveValue("From the second tab.");
  await second.screenshot({ path: "test-results/e7-3-conflict-desktop.png", fullPage: true });
  await conflict.getByRole("button", { name: "Load saved version" }).click();
  await expect(comment(second)).toHaveValue("From the first tab.");
  expect(await sql(`SELECT general_comment FROM teacher_evaluations t JOIN submissions s ON s.id = t.submission_id JOIN users u ON u.id = s.student_id WHERE u.email = $1`, [lina.email])).toEqual([
    { general_comment: "From the first tab." },
  ]);

  // 9. The student: "Submitted, being marked", nothing of the review.
  await lina.page.reload();
  await expect(beingMarked(lina.page)).toBeVisible();
  const html = await lina.page.content();
  for (const hidden of ["From the first tab", "To review", "to_review", `${fixed} / 20`, "provisional", "To re-read"]) expect(html).not.toContain(hidden);
  await lina.page.screenshot({ path: "test-results/e7-4-student-phone.png", fullPage: true });
});

const taskRegion = (page: Page) => page.getByRole("region", { name: /^1/ });

/** A level other than this one. */
const otherLevel = (level: number) => (level === 4 ? 3 : level + 1);

async function replace(page: Page, text: string) {
  const section = page.getByRole("region", { name: "Replace my submission" });
  await section.getByRole("button", { name: "Replace my submission" }).click();
  await section.getByRole("textbox", { name: /^Your new text/ }).fill(text);
  await section.getByRole("button", { name: "Submit the new text" }).click();
}

async function stateOf(email: string) {
  const [row] = await sql<{ status: string; version: number }>(
    `SELECT s.status, s.current_version AS version FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1`,
    [email],
  );
  return row;
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

const proposedTaskLevel = async (email: string) => (await proposalOf(email)).level;

/** Entries of this event in the log of the student's assignment. */
async function logged(email: string, event: string) {
  const [row] = await sql<{ n: number }>(
    `SELECT count(*)::int AS n FROM review_journal_entries j
     WHERE j.event = $2 AND j.assignment_id = (SELECT s.assignment_id FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1)`,
    [email, event],
  );
  return row.n;
}
