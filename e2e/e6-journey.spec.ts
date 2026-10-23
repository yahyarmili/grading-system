import { expect, test } from "@playwright/test";
import { beingMarked, studentInClass, teacherWithClass } from "./support/classes";
import { sql } from "./support/helpers";

// E6 (fonctionnalites.md §8): the journey of the step, in the real runtime.
// Workflows (Local World) evaluates a submitted text without anyone acting, on
// the simulator (PRC-01 CA1); a replacement is evaluated again, the old
// version's proposal kept but not current (SUB-05 CA2); nothing leaves for a
// real AI. The student keeps seeing "Submitted, being marked", whatever the
// state, failures included (SUB-01 CA2). The states are read in the test
// database (the teacher's screen: E7). Batches, failures and relaunch: the
// integration tests (tests/evaluation-*.int.test.ts).

// Two evaluations to wait for and some forty actions on Neon: 1.2 min usually,
// past the default 120 s when Neon is slow (seen 2026-10-20, no step stuck).
test.setTimeout(240_000);

const TEXT =
  "My town is small but it is beatiful. There is a market every friday and the peoples are friendly. " +
  "In the morning I walk to school with my sister, and in the evening we play football in the park.";
const NEW_TEXT =
  "My town has a river and an old bridge. On sunday we walk along the river with my grandparents, " +
  "and there is a small library where I borrow books every week.";

test("E6 journey: a text, then its replacement, reach to_review by themselves; the student sees being marked", async ({ browser }) => {
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

  // 1. No one acts: the workflow claims the version and records its proposal.
  await expect.poll(() => stateOf(lina.email), { timeout: 60_000 }).toEqual({ status: "to_review", version: 1, proposalVersion: 1 });
  await lina.page.reload();
  await expect(beingMarked(lina.page)).toBeVisible();

  // 2. The replacement is evaluated again; the current proposal is the new version's.
  const replaceSection = lina.page.getByRole("region", { name: "Replace my submission" });
  await replaceSection.getByRole("button", { name: "Replace my submission" }).click();
  await replaceSection.getByRole("textbox", { name: /^Your new text/ }).fill(NEW_TEXT);
  await replaceSection.getByRole("button", { name: "Submit the new text" }).click();
  await expect(replaceSection.getByText(/Your new text was submitted on /)).toBeVisible();
  await expect.poll(() => stateOf(lina.email), { timeout: 60_000 }).toEqual({ status: "to_review", version: 2, proposalVersion: 2 });

  // One run and one proposal per version, none twice; the first proposal kept, not current.
  expect(await runsOf(lina.email)).toEqual([
    { version_number: 1, outcome: "proposed", provider: "simulator" },
    { version_number: 2, outcome: "proposed", provider: "simulator" },
  ]);
  expect(await proposalsOf(lina.email)).toEqual([
    { version_number: 1, current: false },
    { version_number: 2, current: true },
  ]);
  // The simulator answered: no request left for a real AI.
  expect(await sentRequestsFor(lina.email)).toBe(0);

  await lina.page.reload();
  await expect(beingMarked(lina.page)).toBeVisible();
  const html = await lina.page.content();
  // The replaced text is never read back (SUB-01 R2, E8.3); nothing of the processing either.
  for (const hidden of ["to_review", "To review", "beatiful"]) expect(html).not.toContain(hidden);

  // 3. SUB-01 CA2: a failure shows the same status. The failed states are set
  // here (the failures of the simulator stay in the server's memory).
  for (const [status, cause, label] of [
    ["evaluation_failed", null, "Evaluation failed"],
    ["not_assessable", "no_content", "No content to assess"],
    ["not_assessable", "rubric_unavailable", "Rubric not validated for this language"],
    ["not_assessable", "ai_unavailable", "AI unavailable"],
  ] as const) {
    await sql(
      `UPDATE submissions SET status = $2, not_assessable_cause = $3, current_proposal_id = NULL
       WHERE student_id = (SELECT id FROM users WHERE email = $1)`,
      [lina.email, status, cause],
    );
    await lina.page.reload();
    await expect(beingMarked(lina.page)).toBeVisible();
    const page = await lina.page.content();
    for (const hidden of [status, label, cause ?? "evaluation_failed"]) expect(page).not.toContain(hidden);
  }
});

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
  sql<{ version_number: number; outcome: string; provider: string }>(
    `SELECT r.version_number, r.outcome, r.provider FROM evaluation_runs r JOIN submissions s ON s.id = r.submission_id
     JOIN users u ON u.id = s.student_id WHERE u.email = $1 ORDER BY r.version_number`,
    [email],
  );

const proposalsOf = (email: string) =>
  sql<{ version_number: number; current: boolean }>(
    `SELECT p.version_number, (p.id = s.current_proposal_id) AS current FROM ai_proposals p
     JOIN submissions s ON s.id = p.submission_id JOIN users u ON u.id = s.student_id
     WHERE u.email = $1 ORDER BY p.version_number`,
    [email],
  );

async function sentRequestsFor(email: string) {
  const [row] = await sql<{ n: number }>(
    `SELECT count(*)::int AS n FROM security_events e JOIN submissions s ON s.id = e.subject_id
     JOIN users u ON u.id = s.student_id WHERE e.type = 'ai_request_sent' AND u.email = $1`,
    [email],
  );
  return row.n;
}
