import { expect, test, type Page } from "@playwright/test";
import { studentInClass, teacherWithClass } from "./support/classes";
import { sql } from "./support/helpers";

// E9 (spec 0011, AC-20): the image channel end to end, in the real runtime,
// every act on its screen. The student photographs three pages; each is read
// by the AI (the simulator: "Simulated reading of a page." on any page), the
// third moved to the top; they correct one misread word, then send. The copy
// reaches To review by itself (Workflows). The teacher sees the transcription
// "checked by the student", the changed word next to the engine's, compares
// it with the photos on demand, then validates and publishes; the student
// reads the result and their pages. Each piece in depth: e9-replays and
// student-leak (integration), access-matrix for the image route.

// Workflows, three uploads and readings, some fifty actions on Neon.
test.setTimeout(420_000);

const READING = "Simulated reading of a page.";

/** A photographed page, drawn in the browser (sharp stays in page-image.ts): each shade its own bytes. */
async function photo(page: Page, shade: number) {
  const base64 = await page.evaluate(async (gray) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, shade);
  return { name: `page-${shade}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}

test("E9 journey: three pages photographed, read, reordered, one word corrected, sent; To review; compared with the pages, validated and published; read by the student", async ({ browser }) => {
  // 1. The teacher's class and assignment.
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

  // 2. The student, on a phone: the notice (v5, photos included), then three pages, each read as it arrives.
  const lina = await studentInClass(browser, sarah.code);
  const student = lina.page;
  await student.goto("/student/assignments");
  await student.getByRole("listitem").filter({ hasText: "My town" }).getByRole("link", { name: "Write my text" }).click();
  await expect(student.getByText("each photo is sent to Anthropic too")).toBeVisible();
  await student.getByRole("button", { name: "I have read this notice" }).click();
  await student.getByRole("tab", { name: "Photograph my pages" }).click();
  const pages = student.getByRole("list", { name: "Your pages" }).getByRole("listitem");
  for (const [i, shade] of [230, 200, 170].entries()) {
    await student.locator("#page-photo").setInputFiles(await photo(student, shade));
    await expect(pages).toHaveCount(i + 1);
    // "Read" would match "Reading…": the reading itself says the page was read.
    await expect(pages.nth(i)).toContainText(READING, { timeout: 60_000 });
  }
  const ids = await pageIdsOf(lina.email);

  // 3. AC-3: page 3 moved to the top, twice up.
  // Chrome names the button "Move up : page 3" (the hidden span is positioned apart).
  await pages.nth(2).getByRole("button", { name: /^Move up\W+page 3$/ }).click();
  await expect(pages.nth(1).getByRole("button", { name: /^Move up\W+page 2$/ })).toBeEnabled();
  await pages.nth(1).getByRole("button", { name: /^Move up\W+page 2$/ }).click();
  await expect.poll(() => pageIdsOf(lina.email)).toEqual([ids[2], ids[0], ids[1]]);

  // 4. AC-4: on the first page, the AI's "page." was "pages." in the copy.
  const first = pages.nth(0);
  await first.getByRole("button", { name: "page.", exact: true }).click();
  await first.getByLabel("What you wrote in place of “page.”").fill("pages.");
  await first.getByRole("button", { name: "Keep my word" }).click();
  await expect(first.locator("del")).toHaveText("page.");
  await expect(first.locator("ins")).toContainText("pages.");
  await student.screenshot({ path: "test-results/e9-1-pages-checked-phone.png", fullPage: true });

  // 5. AC-1: sent; a dated confirmation; To review with no one acting.
  await student.getByRole("button", { name: "I checked the reading: send my pages" }).click();
  const submitted = student.locator("section").filter({ has: student.getByRole("heading", { name: "Pages submitted" }) });
  await expect(submitted).toContainText("Submitted on");
  await expect(submitted).toContainText("Submitted, being marked");
  await expect.poll(() => statusOf(lina.email), { timeout: 90_000 }).toBe("to_review");
  const assignmentId = await assignmentOf(lina.email);
  expect(await textOf(lina.email)).toBe(["Simulated reading of a pages.", READING, READING].join("\n\n"));

  // 6. REV-01, REV-02 (AC-13): the list shows the mode; the copy the checked transcription, the change highlighted.
  await teacher.goto(`/teacher/assignments/${assignmentId}`);
  const notice = teacher.getByRole("region", { name: /what the review log records/ });
  await notice.getByRole("button", { name: "I have read this notice" }).click();
  const list = teacher.getByRole("table", { name: "Submissions" });
  const row = list.getByRole("row").filter({ hasText: "Amrani" });
  await expect(row).toContainText("To review");
  await expect(row).toContainText("Images");
  await openByName(teacher, row, assignmentId);
  await expect(teacher.getByText("Transcribed automatically, checked by the student")).toBeVisible();
  await expect(teacher.locator("del").filter({ hasText: "page." }).first()).toBeVisible();
  // The teacher's copy highlights the student's word (`mark`), the engine's struck next to it.
  await expect(teacher.locator("mark").filter({ hasText: "pages." }).first()).toBeVisible();

  // The pages only on demand: no image requested before the dialog, page 1's on opening.
  const images: string[] = [];
  teacher.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/pages/")) images.push(new URL(request.url()).pathname);
  });
  expect(images).toEqual([]);
  await teacher.getByRole("button", { name: "Compare with the pages" }).click();
  const dialog = teacher.getByRole("dialog", { name: "Pages of the copy" });
  await expect(dialog.getByRole("img", { name: "Page 1 of the copy" })).toBeVisible();
  await expect.poll(() => images).toEqual([`/api/pages/${ids[2]}`]);
  await expect(dialog.getByRole("region", { name: "Reading of page 1" })).toContainText("pages.");
  await teacher.screenshot({ path: "test-results/e9-2-compare-desktop.png" });
  await dialog.getByRole("tab", { name: "Page 2" }).click();
  await expect(dialog.getByRole("img", { name: "Page 2 of the copy" })).toBeVisible();
  await expect.poll(() => images).toEqual([`/api/pages/${ids[2]}`, `/api/pages/${ids[0]}`]);
  await teacher.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // 7. Validated and published with the shortcut.
  const bar = teacher.locator("form > div.sticky");
  await bar.getByRole("button", { name: "Validate and publish" }).click();
  const publish = teacher.getByRole("dialog", { name: "Validate and publish this evaluation?" });
  await publish.getByRole("button", { name: "Validate and publish" }).click();
  await expect(publish).toBeHidden();
  const header = teacher.locator("header").filter({ has: teacher.getByRole("heading", { name: "Lina Amrani" }) });
  await expect(header).toContainText("Published by Sarah Bennett");

  // 8. PUB-02, AC-14: the student reads the result, and their pages with the reading they checked.
  await student.goto("/student/assignments");
  await student.getByRole("region", { name: /Marked, result available \(1\)/ }).getByRole("link", { name: "See your result" }).click();
  await expect(student.getByRole("region", { name: "Your grade" })).toContainText("/ 20");
  await student.goto(`/student/assignments/${assignmentId}`);
  await expect(student.getByText("The reading you checked")).toBeVisible();
  await expect(student.getByText("Simulated reading of a pages.")).toBeVisible();
  const html = await student.content();
  for (const hidden of ["Transcribing", "transcription_failed", "AI proposal", "page.</del>"]) expect(html, hidden).not.toContain(hidden);
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await student.screenshot({ path: "test-results/e9-3-student-pages-phone.png", fullPage: true });
});

/** Clicks the student's name in the row and waits for the copy's opening to be logged: the page is hydrated (E7.9). */
async function openByName(page: Page, row: ReturnType<Page["getByRole"]>, assignmentId: string) {
  const before = await copiesOpened(assignmentId);
  await row.getByRole("link", { name: /Amrani/ }).click();
  await expect.poll(() => copiesOpened(assignmentId), { timeout: 30_000 }).toBeGreaterThan(before);
}

async function copiesOpened(assignmentId: string) {
  const [row] = await sql<{ n: number }>(
    `SELECT count(*)::int AS n FROM review_journal_entries WHERE assignment_id = $1 AND event = 'copy_opened'`,
    [assignmentId],
  );
  return row.n;
}

/** The student's pages, draft or version, in their order. */
async function pageIdsOf(email: string) {
  const rows = await sql<{ id: string }>(
    `SELECT p.id FROM submission_pages p
     LEFT JOIN submission_drafts d ON d.id = p.draft_id
     LEFT JOIN submission_versions v ON v.id = p.version_id
     LEFT JOIN submissions s ON s.id = v.submission_id
     JOIN users u ON u.id = coalesce(d.student_id, s.student_id)
     WHERE u.email = $1 ORDER BY p.position`,
    [email],
  );
  return rows.map((r) => r.id);
}

async function statusOf(email: string) {
  const [row] = await sql<{ status: string }>(`SELECT s.status FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1`, [email]);
  return row?.status;
}

async function assignmentOf(email: string) {
  const [row] = await sql<{ id: string }>(`SELECT s.assignment_id AS id FROM submissions s JOIN users u ON u.id = s.student_id WHERE u.email = $1`, [email]);
  return row.id;
}

/** The confirmed transcription, as evaluated. */
async function textOf(email: string) {
  const [row] = await sql<{ text: string }>(
    `SELECT t.text FROM submission_transcriptions t
     JOIN submission_versions v ON v.id = t.version_id
     JOIN submissions s ON s.id = v.submission_id AND s.current_version = v.number
     JOIN users u ON u.id = s.student_id WHERE u.email = $1`,
    [email],
  );
  return row.text;
}
