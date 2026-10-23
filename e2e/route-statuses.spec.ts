import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createTeacher, signIn, sql } from "./support/helpers";
import { seedTeacher } from "./support/review";

// E8.6: the statuses of the resource pages, as the browser receives them: a
// real 404 for an absent or another person's resource, the page (200) for
// its owner, both for the document and for the RSC payload a navigation
// fetches. In production the prerendered shell's 200 is sent before the page
// runs: only the proxy's check (src/server/routes/resources.ts) gives the
// 404. Replayed on the preview (playwright.online.config.ts); per function:
// tests/route-resources.int.test.ts.

test.setTimeout(240_000);

const emailOf = async (userId: string) => (await sql<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]))[0].email;

async function signedIn(browser: Browser, email: string, space: RegExp) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  await expect(page).toHaveURL(space);
  return page;
}

/** The status of the document and of the RSC payload of this path, for the person signed in on `page`. */
async function statuses(page: Page, path: string) {
  const [document, rsc] = await Promise.all([page.request.get(path), page.request.get(path, { headers: { RSC: "1" } })]);
  return [document.status(), rsc.status()];
}

test("resource pages: 200 for their owner; 404 for another person, an unknown id, a withdrawn result, document and RSC alike", async ({ page: teacher, browser }) => {
  const seeder = await seedTeacher(teacher, ["A"]);
  let assignmentId: string, classId: string, lenaId: string, omarId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    classId = seeder.classId("A");
    lenaId = await seeder.student("Lena", "Bauer", ["A"]);
    omarId = await seeder.student("Omar", "Haddad", ["A"]);
    submissionId = await seeder.submit(assignmentId, lenaId, "received", { text: "My town is small but it is beatiful." });
    await seeder.evaluate(assignmentId, submissionId, [3, 2, 2, 2, 1], { teacherGrade: 10 });
  } finally {
    await seeder.close();
  }
  await sql(`UPDATE submissions SET status = 'published' WHERE id = $1`, [submissionId]);
  const unknown = randomUUID();

  // The owner teacher: their pages; another teacher: not found, like an unknown id.
  const teacherPages = [
    `/teacher/classes/${classId}`,
    `/teacher/assignments/${assignmentId}`,
    `/teacher/assignments/${assignmentId}/edit`,
    `/teacher/assignments/${assignmentId}/students/${lenaId}`,
  ];
  const other = await signedIn(browser, await createTeacher("Paul", "Martin"), /\/teacher\//);
  for (const path of teacherPages) {
    expect(await statuses(teacher, path), `owner ${path}`).toEqual([200, 200]);
    expect(await statuses(other, path), `other teacher ${path}`).toEqual([404, 404]);
  }
  for (const path of [`/teacher/classes/${unknown}`, `/teacher/assignments/${unknown}`, `/teacher/assignments/${assignmentId}/students/${unknown}`, "/teacher/classes/42"]) {
    expect(await statuses(teacher, path), path).toEqual([404, 404]);
  }
  expect(await statuses(teacher, "/teacher/assignments/new")).toEqual([200, 200]);

  // The students: the assignment for both; the result for Lena only, while published.
  const lena = await signedIn(browser, await emailOf(lenaId), /\/student\//);
  const omar = await signedIn(browser, await emailOf(omarId), /\/student\//);
  const assignment = `/student/assignments/${assignmentId}`;
  const result = `${assignment}/result`;
  expect(await statuses(lena, assignment)).toEqual([200, 200]);
  expect(await statuses(omar, assignment)).toEqual([200, 200]);
  expect(await statuses(lena, result)).toEqual([200, 200]);
  expect(await statuses(omar, result)).toEqual([404, 404]);
  expect(await statuses(lena, `/student/assignments/${unknown}/result`)).toEqual([404, 404]);

  // PUB-01 CA3: withdrawn, the result is not found at the next access.
  await sql(`UPDATE submissions SET status = 'validated' WHERE id = $1`, [submissionId]);
  expect(await statuses(lena, result)).toEqual([404, 404]);
  expect(await statuses(lena, assignment)).toEqual([200, 200]);
});
