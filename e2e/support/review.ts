import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { createClass } from "./classes";
import { testDatabaseUrl } from "./env";
import { createStudent, createTeacher, signIn, sql } from "./helpers";

// Review screens (E7): a signed-in teacher with classes, and their
// assignments, students, submissions, proposals and evaluations written
// straight to the test database. The journeys that produce them are E4's,
// E6's and E7.4's; the review specs test the screens.

export type Seeder = Awaited<ReturnType<typeof seedTeacher>>;

/** Signs in a new teacher in `page`, creates their classes on the screen, then opens the test database. */
export async function seedTeacher(
  page: Page,
  classNames: string[],
  teacher: [string, string] = ["Sarah", "Bennett"],
  { noticeRead = true } = {},
) {
  const teacherEmail = await createTeacher(...teacher);
  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/classes");
  for (const name of classNames) await expect(await createClass(page, name)).toBeHidden();

  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  const one = async <Row>(text: string, values: unknown[]) => (await client.query(text, values)).rows[0] as Row;
  const { id: teacherId } = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [teacherEmail]);
  // E7.7: the teacher notice read, unless the test shows it.
  if (noticeRead) {
    await client.query(`INSERT INTO notice_acknowledgements (user_id, notice, version) VALUES ($1, 'teacher_review', 1)`, [teacherId]); // TEACHER_NOTICE.version (src/lib/texts.ts)
  }
  const classes = (await client.query<{ id: string; name: string }>(`SELECT id, name FROM classes WHERE teacher_id = $1`, [teacherId])).rows;
  const classId = (name: string) => classes.find((c) => c.name === name)!.id;

  return {
    teacherEmail,
    teacherId,
    classId,
    close: () => client.end(),

    /** A locked assignment sent to these classes. */
    async assignment(classNames: string[], title = "My town") {
      const { id } = await one<{ id: string }>(
        `INSERT INTO assignments (teacher_id, title, subject, level, language, deadline, locked_at)
         VALUES ($1, $2, 'Describe your town.', 'B1', 'en', now() + interval '7 days', now()) RETURNING id`,
        [teacherId, title],
      );
      for (const name of classNames) {
        await client.query(`INSERT INTO assignment_classes (assignment_id, class_id, teacher_id) VALUES ($1, $2, $3)`, [id, classId(name), teacherId]);
      }
      return id;
    },

    /** A confirmed student, member of these classes (removed from all, if asked). */
    async student(first: string, last: string, classNames: string[], removed = false) {
      const { id } = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [await createStudent(first, last)]);
      for (const name of classNames) {
        await client.query(
          `INSERT INTO class_memberships (class_id, student_id, status, removed_at) VALUES ($1, $2, $3, $4)`,
          [classId(name), id, removed ? "removed" : "active", removed ? new Date() : null],
        );
      }
      return id;
    },

    /** A text submission in this state; returns its id. */
    async submit(
      assignmentId: string,
      studentId: string,
      status: string,
      { late = false, cause = null as string | null, text = "My town is small." } = {},
    ) {
      const { id } = await one<{ id: string }>(
        `INSERT INTO submissions (assignment_id, teacher_id, student_id, status, late, content_version, not_assessable_cause)
         VALUES ($1, $2, $3, $4, $5, 1, $6) RETURNING id`,
        [assignmentId, teacherId, studentId, status, late, cause],
      );
      await client.query(
        `INSERT INTO submission_versions (submission_id, number, mode, text, request_id) VALUES ($1, 1, 'text', $2, $3)`,
        [id, text, randomUUID()],
      );
      return id;
    },

    /** A run of version 1 that failed on these errors, one per attempt (E7.6). */
    async fail(submissionId: string, errors: string[]) {
      await client.query(
        `INSERT INTO evaluation_runs (submission_id, version_number, outcome, provider, model_requested, prompt_version, rubric_version, attempts, attempt_errors, duration_ms)
         VALUES ($1, 1, 'failed', 'simulator', 'simulator', 'evaluation-2', 'en-1', $2, $3::evaluation_error[], 10)`,
        [submissionId, errors.length, errors],
      );
    },

    /**
     * A proposal in force, its grade the sum of `levels`, now To review;
     * with `teacherGrade`, the teacher's evaluation too, its grade fixed.
     */
    async evaluate(assignmentId: string, submissionId: string, levels: number[], { teacherGrade, quote = "small" }: { teacherGrade?: number; quote?: string } = {}) {
      const { id: runId } = await one<{ id: string }>(
        `INSERT INTO evaluation_runs (submission_id, version_number, outcome, provider, model_requested, model_answered, prompt_version, rubric_version, attempts, duration_ms)
         VALUES ($1, 1, 'proposed', 'simulator', 'simulator', 'simulator', 'evaluation-2', 'en-1', 1, 10) RETURNING id`,
        [submissionId],
      );
      const { id: proposalId } = await one<{ id: string }>(
        `INSERT INTO ai_proposals (run_id, submission_id, version_number,
           level_task, level_organization, level_vocabulary, level_grammar, level_mechanics,
           justification_task, justification_organization, justification_vocabulary, justification_grammar, justification_mechanics,
           quotes_task, quotes_organization, quotes_vocabulary, quotes_grammar, quotes_mechanics,
           general_comment, next_steps, alerts, proposed_grade)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7,
           'Answers the task.', 'Clear paragraphs.', 'Simple words.', 'Some errors.', 'A few spelling mistakes.',
           $8, $8, $8, $8, $8, 'A clear and simple text.', '{Check the spelling.}', '{very_short}', $9)
         RETURNING id`,
        [runId, submissionId, ...levels, [quote], levels.reduce((a, b) => a + b, 0)],
      );
      await client.query(`UPDATE submissions SET status = 'to_review', current_proposal_id = $2 WHERE id = $1`, [submissionId, proposalId]);
      if (teacherGrade === undefined) return;
      await client.query("BEGIN");
      await client.query(`UPDATE submissions SET teacher_started_at = now() WHERE id = $1`, [submissionId]);
      await client.query(
        `INSERT INTO teacher_evaluations (submission_id, version_number, origin, proposal_id, rubric_version,
           level_task, level_organization, level_vocabulary, level_grammar, level_mechanics,
           remark_task, remark_organization, remark_vocabulary, remark_grammar, remark_mechanics,
           general_comment, next_steps, final_grade, grade_fixed, created_by)
         VALUES ($1, 1, 'proposal', $2, 'en-1', $3, $4, $5, $6, $7,
           'Answers the task.', 'Clear paragraphs.', 'Simple words.', 'Some errors.', 'A few spelling mistakes.',
           'A clear and simple text.', '{Check the spelling.}', $8, true, $9)`,
        [submissionId, proposalId, ...levels, teacherGrade, teacherId],
      );
      await client.query(
        `INSERT INTO review_journal_entries (assignment_id, submission_id, actor_id, event, evaluation_revision, version_number)
         VALUES ($1, $2, $3, 'evaluation_created', 1, 1)`,
        [assignmentId, submissionId, teacherId],
      );
      await client.query("COMMIT");
    },
  };
}

/** Entries of this event in the review log, for an assignment. */
export const journalCount = async (assignmentId: string, event: string) =>
  Number(
    (
      await sql<{ n: string }>(
        `SELECT count(*) AS n FROM review_journal_entries WHERE assignment_id = $1 AND event = $2`,
        [assignmentId, event],
      )
    )[0].n,
  );

/** A teacher signed in on `page`, and one copy To review from a proposal (levels 3, 2, 2, 2, 1), no evaluation yet. */
export async function seedReviewCopy(page: Page, text = "My town is small but it is beatiful.\n\nThere is a market every friday.") {
  const seeder = await seedTeacher(page, ["A"]);
  try {
    const assignmentId = await seeder.assignment(["A"]);
    const studentId = await seeder.student("Lena", "Bauer", ["A"]);
    const submissionId = await seeder.submit(assignmentId, studentId, "received", { text });
    await seeder.evaluate(assignmentId, submissionId, [3, 2, 2, 2, 1], { quote: "beatiful" });
    return { url: `/teacher/assignments/${assignmentId}/students/${studentId}`, assignmentId, submissionId };
  } finally {
    await seeder.close();
  }
}

/**
 * Leaves the copy by its back link while changes are typed: the page asks
 * (C1), the teacher leaves anyway; the list is shown.
 */
export async function leaveCopyAnyway(page: Page, title = "My town") {
  await page.getByRole("link", { name: `${title}: submissions` }).click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page.getByRole("table", { name: "Submissions" })).toBeVisible();
}
