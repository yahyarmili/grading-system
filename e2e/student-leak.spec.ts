import { expect, test, type Page, type Response } from "@playwright/test";
import { findLeak, INTERNAL_CODES, INTERNAL_LABELS, leakMarkers, type Received } from "../tests/helpers/leak";
import { phone } from "./support/classes";
import { signIn, sql } from "./support/helpers";
import { journalCount, seedTeacher } from "./support/review";

// E8.4, PUB-02 R2, NFR-EXP-04 (E8 plan §6), in a real browser: the leak
// sweep over the HTTP answers. Unique markers in every text of the proposal
// and its four alerts; the teacher writes theirs on the screen in every text
// of their evaluation. Every answer the student's browser receives is kept
// (pages, RSC payloads, Server Actions, errors and 404s), with each student
// URL fetched again as a RSC request, and searched: the test fails at the
// first marker found, and names it. Situations: To review; Validated, not
// published; Published (the teacher's markers on the result's answers only);
// withdrawn, the router's back button and the browser's both. Every service
// the student reaches, situation by situation: tests/student-leak.int.test.ts.

test.setTimeout(420_000);

const TEXT = "My town is small but it is beatiful.\n\nThere is a market every friday.";
const markers = leakMarkers();
const { proposalMarkers, teacherMarkers } = markers;
const FORBIDDEN = [...proposalMarkers, ...INTERNAL_CODES, ...INTERNAL_LABELS];
const TEXT_TYPES = /text\/html|text\/x-component|application\/json|text\/plain/;

/** A proposal in force whose every text is a marker, with the four alerts; the copy To review. */
async function proposeWithMarkers(submissionId: string) {
  const [{ id: runId }] = await sql<{ id: string }>(
    `INSERT INTO evaluation_runs (submission_id, version_number, outcome, provider, model_requested, model_answered, prompt_version, rubric_version, attempts, duration_ms)
     VALUES ($1, 1, 'proposed', 'simulator', 'simulator', 'simulator', 'evaluation-2', 'en-1', 1, 10) RETURNING id`,
    [submissionId],
  );
  const why = (id: string) => `${markers.proposal.justification}-${id}`;
  const [{ id: proposalId }] = await sql<{ id: string }>(
    `INSERT INTO ai_proposals (run_id, submission_id, version_number,
       level_task, level_organization, level_vocabulary, level_grammar, level_mechanics,
       justification_task, justification_organization, justification_vocabulary, justification_grammar, justification_mechanics,
       quotes_task, quotes_organization, quotes_vocabulary, quotes_grammar, quotes_mechanics,
       general_comment, next_steps, alerts, proposed_grade)
     VALUES ($1, $2, 1, 3, 2, 2, 2, 1, $3, $4, $5, $6, $7, '{small}', '{small}', '{small}', '{small}', '{small}', $8, $9,
       '{very_short,other_language,off_topic,addressed_to_marker}', 10)
     RETURNING id`,
    [runId, submissionId, why("task"), why("organization"), why("vocabulary"), why("grammar"), why("mechanics"),
      markers.proposal.comment, [markers.proposal.nextStep]],
  );
  await sql(`UPDATE submissions SET status = 'to_review', current_proposal_id = $2 WHERE id = $1`, [submissionId, proposalId]);
}

/** Everything the student's browser receives, as text, tagged with the situation it was received in. */
function collect(page: Page) {
  const received: (Received & { situation: string; url: string })[] = [];
  const cacheControl: { url: string; value: string }[] = [];
  const pending: Promise<void>[] = [];
  let situation = "sign-in";
  const keep = async (response: Response, at: string) => {
    const type = response.headers()["content-type"] ?? "";
    const url = response.url();
    if (new URL(url).pathname.startsWith("/student/")) cacheControl.push({ url, value: response.headers()["cache-control"] ?? "" });
    if (!TEXT_TYPES.test(type) || url.includes("/_next/")) return;
    const kind = response.request().method() === "POST" ? "action" : response.request().headers()["rsc"] ? "RSC" : "page";
    const body = await response.text().catch(() => "");
    received.push({ situation: at, url, source: `${at}: ${kind} ${response.status()} ${url}`, body });
  };
  page.on("response", (response) => void pending.push(keep(response, situation)));
  return {
    received,
    cacheControl,
    set situation(name: string) {
      situation = name;
    },
    /** Waits for every answer of the situation to be read. */
    settled: async () => {
      await page.waitForLoadState("networkidle");
      await Promise.all(pending);
    },
    /** The student URLs fetched again as RSC requests, the way the router asks for them. */
    async fetchRsc(urls: string[]) {
      for (const url of urls) {
        const response = await page.request.get(url, { headers: { RSC: "1" } });
        received.push({ situation, url, source: `${situation}: RSC fetch ${response.status()} ${url}`, body: await response.text() });
        cacheControl.push({ url, value: response.headers()["cache-control"] ?? "" });
      }
    },
  };
}

/** Opens the copy and waits for its opening to be logged: the page is hydrated (E7.9). */
async function openCopy(page: Page, url: string, assignmentId: string) {
  const before = await journalCount(assignmentId, "copy_opened");
  await page.goto(url);
  await expect.poll(() => journalCount(assignmentId, "copy_opened")).toBeGreaterThan(before);
}

async function confirm(page: Page, title: string, button: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden();
}

test("E8.4: nothing of the proposal or the review reaches the student's browser, To review, Validated, withdrawn (back included); Published: the teacher's version only", async ({ page: teacher, browser }) => {
  const seeder = await seedTeacher(teacher, ["A"]);
  let assignmentId: string, studentId: string, submissionId: string;
  try {
    assignmentId = await seeder.assignment(["A"]);
    studentId = await seeder.student("Lena", "Bauer", ["A"]);
    submissionId = await seeder.submit(assignmentId, studentId, "received", { text: TEXT });
  } finally {
    await seeder.close();
  }
  await proposeWithMarkers(submissionId);
  const [{ email: studentEmail }] = await sql<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [studentId]);
  const copyUrl = `/teacher/assignments/${assignmentId}/students/${studentId}`;
  const listUrl = "/student/assignments";
  const detailUrl = `/student/assignments/${assignmentId}`;
  const resultUrl = `${detailUrl}/result`;
  const bar = teacher.locator("form > div.sticky");

  const lena = await (await browser.newContext(phone)).newPage();
  const seen = collect(lena);
  await signIn(lena, studentEmail);
  await expect(lena).toHaveURL(/\/student\//);
  /** The status of the result URL in each situation, checked after the sweep: the sweep is what must catch a leak. */
  const resultStatus = new Map<string, number | undefined>();
  /** The student goes through the list, the assignment and the result URL, then the same as RSC requests. */
  async function studentVisits(situation: string) {
    seen.situation = situation;
    await lena.goto(listUrl);
    await lena.getByRole("link", { name: "Open the assignment" }).click();
    await expect(lena.getByRole("region", { name: "Your submission" })).toContainText("beatiful");
    resultStatus.set(situation, (await lena.goto(resultUrl))?.status());
    await seen.fetchRsc([listUrl, detailUrl, resultUrl]);
    await seen.settled();
  }
  /** Fails at the first forbidden word received in this situation; the teacher's markers too, unless allowed for the result. */
  function expectNoLeak(situation: string, { published = false } = {}) {
    const inSituation = seen.received.filter((r) => r.situation === situation);
    expect(inSituation.length, situation).toBeGreaterThan(0);
    expect(findLeak(inSituation, FORBIDDEN)).toBeNull();
    const elsewhere = published ? inSituation.filter((r) => !new URL(r.url, "http://student.test").pathname.endsWith("/result")) : inSituation;
    expect(findLeak(elsewhere, teacherMarkers)).toBeNull();
    if (resultStatus.has(situation)) expect(resultStatus.get(situation), `${situation}: ${resultUrl}`).toBe(published ? 200 : 404);
  }

  // 1. To review, the teacher's evaluation saved on the screen: every text a marker.
  await openCopy(teacher, copyUrl, assignmentId);
  for (const [n, id] of [[1, "task"], [2, "organization"], [3, "vocabulary"], [4, "grammar"], [5, "mechanics"]] as const) {
    await teacher.getByRole("region", { name: new RegExp(`^${n}`) }).getByRole("textbox", { name: "Remark" }).fill(markers.teacher.remarks[id]);
  }
  await teacher.getByRole("textbox", { name: "General comment" }).fill(markers.teacher.generalComment);
  await teacher.getByRole("textbox", { name: "Next steps" }).fill(markers.teacher.nextSteps.join("\n"));
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await studentVisits("to review");
  expectNoLeak("to review");

  // 2. Validated, not published.
  await bar.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(bar.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await studentVisits("validated");
  expectNoLeak("validated");

  // 3. Published: the teacher's markers, on the result's answers only, and on its screen.
  await bar.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(teacher, "Publish this evaluation?", "Publish");
  await expect(bar.getByRole("button", { name: "Withdraw publication" })).toBeVisible();
  await studentVisits("published");
  expectNoLeak("published", { published: true });
  const shown = await lena.locator("main").innerText();
  for (const word of teacherMarkers) expect(shown, word).toContain(word);

  // 4a. Withdrawn while the student is on the assignment: the router's back button shows the result kept, checked first.
  seen.situation = "withdrawn, router back";
  await lena.getByRole("link", { name: "My town" }).first().click();
  await expect(lena).toHaveURL(new RegExp(`${detailUrl}$`));
  await bar.getByRole("button", { name: "Withdraw publication" }).click();
  await confirm(teacher, "Withdraw the publication?", "Withdraw");
  await expect(bar.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await lena.waitForTimeout(1_200); // FRESHNESS_GRACE_MS [P]
  await lena.goBack();
  await expect(lena.getByRole("heading", { name: "Your result" })).toHaveCount(0);
  await expect.poll(() => lena.locator("body").innerText()).not.toContain(markers.teacher.generalComment);
  await seen.settled();
  const routerBack = await lena.locator("body").innerText();
  expect(findLeak([{ source: "the screen after back", body: routerBack }], [...FORBIDDEN, ...teacherMarkers])).toBeNull();
  // The result kept by the router was checked by its Server Action, whose answer was swept too.
  expect(seen.received.some((r) => r.situation === "withdrawn, router back" && r.source.includes("action"))).toBe(true);
  expectNoLeak("withdrawn, router back");

  // 4b. Published again, read, left by a full navigation, withdrawn: the browser's back button.
  await bar.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(teacher, "Publish this evaluation?", "Publish");
  await expect(bar.getByRole("button", { name: "Withdraw publication" })).toBeVisible();
  seen.situation = "published again";
  await lena.goto(resultUrl);
  await expect(lena.getByText(markers.teacher.generalComment)).toBeVisible();
  await lena.goto("/student/classes");
  await bar.getByRole("button", { name: "Withdraw publication" }).click();
  await confirm(teacher, "Withdraw the publication?", "Withdraw");
  await expect(bar.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await seen.settled();
  seen.situation = "withdrawn, browser back";
  await lena.goBack();
  await expect(lena.getByRole("heading", { name: "Your result" })).toHaveCount(0);
  await seen.settled();
  const browserBack = await lena.locator("body").innerText();
  expect(findLeak([{ source: "the screen after back", body: browserBack }], [...FORBIDDEN, ...teacherMarkers])).toBeNull();
  await seen.fetchRsc([listUrl, detailUrl, resultUrl]);
  expectNoLeak("withdrawn, browser back");

  // No answer of the student's space may be stored by the browser or a shared cache (E8 plan §5).
  expect(seen.cacheControl.length).toBeGreaterThan(10);
  for (const { url, value } of seen.cacheControl) expect(value, url).toContain("no-store");

  // The teacher's markers were really sent somewhere: on the teacher's own screen (the sweep is not blind).
  await teacher.reload();
  for (const word of [...teacherMarkers, ...proposalMarkers]) {
    expect(await teacher.locator("body").innerHTML(), word).toContain(word);
  }
});
